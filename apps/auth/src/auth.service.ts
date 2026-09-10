import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClientProxy } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import {
  AUTH_ERROR_CODE,
  AUTH_ERROR_MESSAGE,
  AppException,
  NOTIFICATIONS_PATTERN,
  RMQ_CLIENT,
  sendRpc,
} from '@app/common';
import type {
  AuthenticatedUser,
  JwtExpiresIn,
  JwtPayload,
  LoginCommand,
  NewPasswordCommand,
  PasswordRecoveryCommand,
  RegistrationCommand,
  RegistrationConfirmationCommand,
  RegistrationEmailResendingCommand,
  SendEmailCommand,
  SendEmailResult,
  TokenPair,
} from '@app/common';
import { PrismaService } from '@app/prisma';
import {
  BCRYPT_ROUNDS,
  EMAIL_CONFIRMATION_TTL_MS,
  PASSWORD_RECOVERY_TTL_MS,
} from './auth.constants';

/**
 * Хеш несуществующего пароля. С ним сравниваем, когда пользователь не найден:
 * без этого ответ на незарегистрированный email возвращался бы мгновенно, а на
 * зарегистрированный — через ~100 мс работы bcrypt, и эндпоинт превращался бы
 * в оракул «есть ли такой аккаунт».
 *
 * Считается один раз при загрузке модуля.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'timing-attack-placeholder',
  BCRYPT_ROUNDS,
);

/** Поля пользователя, которые безопасно отдавать наружу: без `passwordHash`. */
const AUTHENTICATED_USER_SELECT = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(RMQ_CLIENT.NOTIFICATIONS)
    private readonly notificationsClient: ClientProxy,
  ) {}

  /**
   * Проверяет учётные данные и выпускает пару токенов.
   *
   * @throws AppException `INVALID_CREDENTIALS` со статусом 401
   * @throws AppException `EMAIL_NOT_CONFIRMED` со статусом 401
   */
  async login(command: LoginCommand): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: command.email },
    });

    // Сравнение выполняется всегда, даже когда пользователя нет, — время
    // ответа не должно зависеть от того, зарегистрирован email или нет.
    const isPasswordValid = await bcrypt.compare(
      command.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !isPasswordValid) {
      // Одинаковые код и текст для «нет такого email» и «неверный пароль».
      // `details` не заполняем: указание на поле выдало бы, что не сошлось.
      throw new AppException({
        code: AUTH_ERROR_CODE.INVALID_CREDENTIALS,
        message: AUTH_ERROR_MESSAGE.INVALID_CREDENTIALS,
        // Без явного статуса AppException отдал бы 400.
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    // Проверяется после сверки пароля: иначе по ответу можно было бы узнать,
    // что email зарегистрирован, не зная пароля, — тот самый оракул, ради
    // которого выше считается DUMMY_PASSWORD_HASH. Здесь отдельный код уже
    // безопасен: до него доходит только владелец аккаунта.
    if (!user.isConfirmed) {
      throw new AppException({
        code: AUTH_ERROR_CODE.EMAIL_NOT_CONFIRMED,
        message: AUTH_ERROR_MESSAGE.EMAIL_NOT_CONFIRMED,
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    return this.issueTokens({ sub: user.id, email: user.email });
  }

  /**
   * Регистрация: создаёт неподтверждённого пользователя и шлёт письмо с кодом.
   * Неподтверждённая запись с тем же email/username перезаписывается.
   *
   * @throws AppException `EMAIL_ALREADY_EXISTS` / `USERNAME_ALREADY_EXISTS`
   */
  async registration(command: RegistrationCommand): Promise<void> {
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: command.email },
    });
    const existingByUsername = await this.prisma.user.findUnique({
      where: { username: command.username },
    });

    if (existingByEmail?.isConfirmed) {
      throw new AppException({
        code: AUTH_ERROR_CODE.EMAIL_ALREADY_EXISTS,
        message: AUTH_ERROR_MESSAGE.EMAIL_ALREADY_EXISTS,
        details: [{ field: 'email', message: 'Email уже занят' }],
      });
    }

    if (existingByUsername?.isConfirmed) {
      throw new AppException({
        code: AUTH_ERROR_CODE.USERNAME_ALREADY_EXISTS,
        message: AUTH_ERROR_MESSAGE.USERNAME_ALREADY_EXISTS,
        details: [{ field: 'username', message: 'Username уже занят' }],
      });
    }

    // Неподтверждённый пользователь с тем же email/username — перезаписать.
    const idsToDelete = new Set<string>();
    if (existingByEmail && !existingByEmail.isConfirmed) {
      idsToDelete.add(existingByEmail.id);
    }
    if (existingByUsername && !existingByUsername.isConfirmed) {
      idsToDelete.add(existingByUsername.id);
    }
    for (const id of idsToDelete) {
      await this.prisma.user.delete({ where: { id } });
    }

    const passwordHash = await bcrypt.hash(command.password, BCRYPT_ROUNDS);
    const code = randomUUID();
    const expiresAt = new Date(Date.now() + EMAIL_CONFIRMATION_TTL_MS);

    const user = await this.prisma.user.create({
      data: {
        username: command.username,
        email: command.email,
        passwordHash,
        firstName: command.firstName,
        lastName: command.lastName,
        isConfirmed: false,
        emailConfirmation: { create: { code, expiresAt } },
      },
    });

    await this.sendConfirmationEmail(user.email, code);
  }

  /**
   * Подтверждение email по коду из письма.
   *
   * @throws AppException `CONFIRMATION_CODE_INVALID` / `CONFIRMATION_CODE_EXPIRED`
   */
  async registrationConfirmation(
    command: RegistrationConfirmationCommand,
  ): Promise<void> {
    const confirmation = await this.prisma.emailConfirmation.findUnique({
      where: { code: command.code },
    });

    if (!confirmation) {
      throw new AppException({
        code: AUTH_ERROR_CODE.CONFIRMATION_CODE_INVALID,
        message: AUTH_ERROR_MESSAGE.CONFIRMATION_CODE_INVALID,
        details: [
          {
            field: 'code',
            message: AUTH_ERROR_MESSAGE.CONFIRMATION_CODE_INVALID,
          },
        ],
      });
    }

    if (confirmation.expiresAt.getTime() < Date.now()) {
      throw new AppException({
        code: AUTH_ERROR_CODE.CONFIRMATION_CODE_EXPIRED,
        message: AUTH_ERROR_MESSAGE.CONFIRMATION_CODE_EXPIRED,
        details: [
          {
            field: 'code',
            message: AUTH_ERROR_MESSAGE.CONFIRMATION_CODE_EXPIRED,
          },
        ],
      });
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: confirmation.userId },
        data: { isConfirmed: true },
      }),
      this.prisma.emailConfirmation.delete({ where: { id: confirmation.id } }),
    ]);
  }

  /**
   * Повторная отправка кода подтверждения.
   *
   * @throws AppException `USER_NOT_FOUND` со статусом 404
   * @throws AppException `EMAIL_ALREADY_CONFIRMED`
   */
  async registrationEmailResending(
    command: RegistrationEmailResendingCommand,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: command.email },
    });

    if (!user) {
      throw new AppException({
        code: AUTH_ERROR_CODE.USER_NOT_FOUND,
        message: AUTH_ERROR_MESSAGE.USER_NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
        details: [
          { field: 'email', message: AUTH_ERROR_MESSAGE.USER_NOT_FOUND },
        ],
      });
    }

    if (user.isConfirmed) {
      throw new AppException({
        code: AUTH_ERROR_CODE.EMAIL_ALREADY_CONFIRMED,
        message: AUTH_ERROR_MESSAGE.EMAIL_ALREADY_CONFIRMED,
        details: [
          {
            field: 'email',
            message: AUTH_ERROR_MESSAGE.EMAIL_ALREADY_CONFIRMED,
          },
        ],
      });
    }

    const code = randomUUID();
    const expiresAt = new Date(Date.now() + EMAIL_CONFIRMATION_TTL_MS);

    await this.prisma.emailConfirmation.upsert({
      where: { userId: user.id },
      create: { userId: user.id, code, expiresAt },
      update: { code, expiresAt },
    });

    await this.sendConfirmationEmail(user.email, code);
  }

  /**
   * Запрос восстановления пароля: создаёт/обновляет recovery-код и шлёт письмо.
   * Проверка reCAPTCHA сделана в gateway до вызова.
   *
   * @throws AppException `USER_NOT_FOUND` со статусом 404
   */
  async passwordRecovery(command: PasswordRecoveryCommand): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: command.email },
    });

    if (!user) {
      throw new AppException({
        code: AUTH_ERROR_CODE.USER_NOT_FOUND,
        message: AUTH_ERROR_MESSAGE.USER_NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
        details: [
          { field: 'email', message: AUTH_ERROR_MESSAGE.USER_NOT_FOUND },
        ],
      });
    }

    const code = randomUUID();
    const expiresAt = new Date(Date.now() + PASSWORD_RECOVERY_TTL_MS);

    await this.prisma.passwordRecovery.upsert({
      where: { userId: user.id },
      create: { userId: user.id, code, expiresAt },
      update: { code, expiresAt },
    });

    await this.sendPasswordRecoveryEmail(user.email, code);
  }

  /**
   * Установка нового пароля по recovery-коду.
   * После успеха удаляет recovery и все Session пользователя.
   *
   * @throws AppException `RECOVERY_CODE_INVALID` / `RECOVERY_CODE_EXPIRED`
   */
  async newPassword(command: NewPasswordCommand): Promise<void> {
    const recovery = await this.prisma.passwordRecovery.findUnique({
      where: { code: command.recoveryCode },
    });

    if (!recovery) {
      throw new AppException({
        code: AUTH_ERROR_CODE.RECOVERY_CODE_INVALID,
        message: AUTH_ERROR_MESSAGE.RECOVERY_CODE_INVALID,
        details: [
          {
            field: 'recoveryCode',
            message: AUTH_ERROR_MESSAGE.RECOVERY_CODE_INVALID,
          },
        ],
      });
    }

    if (recovery.expiresAt.getTime() < Date.now()) {
      throw new AppException({
        code: AUTH_ERROR_CODE.RECOVERY_CODE_EXPIRED,
        message: AUTH_ERROR_MESSAGE.RECOVERY_CODE_EXPIRED,
        details: [
          {
            field: 'recoveryCode',
            message: AUTH_ERROR_MESSAGE.RECOVERY_CODE_EXPIRED,
          },
        ],
      });
    }

    const passwordHash = await bcrypt.hash(command.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: recovery.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordRecovery.delete({ where: { id: recovery.id } }),
      this.prisma.session.deleteMany({ where: { userId: recovery.userId } }),
    ]);
  }

  /**
   * Пользователь для `request.user`. Возвращает `null`, если аккаунт удалён, —
   * тогда ещё живой токен не должен пускать дальше.
   */
  async findAuthenticatedUser(
    userId: string,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: AUTHENTICATED_USER_SELECT,
    });

    if (!user) {
      return null;
    }

    // `createdAt` приводится к строке здесь: через RabbitMQ едет JSON, и `Date`
    // всё равно станет строкой — пусть тип на обеих сторонах говорит правду.
    return { ...user, createdAt: user.createdAt.toISOString() };
  }

  /**
   * Access подписывается дефолтным секретом модуля, refresh — своим:
   * с общим секретом access-токен структурно годился бы как refresh.
   */
  private async issueTokens(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<JwtExpiresIn>(
          'JWT_REFRESH_EXPIRES_IN',
        ),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async sendConfirmationEmail(
    email: string,
    code: string,
  ): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const confirmUrl = `${frontendUrl}/auth/registration-confirmation?code=${code}`;

    await this.sendEmail({
      to: email,
      subject: 'Spark — confirm your email',
      html: `<p>Confirm your registration:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
    });
  }

  private async sendPasswordRecoveryEmail(
    email: string,
    code: string,
  ): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const recoveryUrl = `${frontendUrl}/auth/new-password?code=${code}`;

    await this.sendEmail({
      to: email,
      subject: 'Spark — восстановление пароля',
      html: `<p>Чтобы задать новый пароль, перейдите по ссылке:</p><p><a href="${recoveryUrl}">${recoveryUrl}</a></p>`,
    });
  }

  /**
   * Письма шлём не сами, а командой в notifications: SMTP-доступы и обработка
   * отказа живут там. Запрос-ответ — чтобы отказ доставки не потерялся.
   */
  private sendEmail(command: SendEmailCommand): Promise<SendEmailResult> {
    return sendRpc<SendEmailResult, SendEmailCommand>(
      this.notificationsClient,
      NOTIFICATIONS_PATTERN.SEND_EMAIL,
      command,
    );
  }
}
