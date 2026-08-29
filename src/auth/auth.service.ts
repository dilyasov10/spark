import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AppException } from '../common/errors/app.exception';
import { EmailService } from './mailler/email.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BCRYPT_ROUNDS,
  EMAIL_CONFIRMATION_TTL_MS,
  PASSWORD_RECOVERY_TTL_MS,
} from './auth.constants';
import { AUTH_ERROR_CODE, AUTH_ERROR_MESSAGE } from './auth.error-code';
import { LoginDto } from './dto/login.dto';
import { NewPasswordDto } from './dto/new-password.dto';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { RegistrationConfirmationDto } from './dto/registration-confirmation.dto';
import { RegistrationEmailResendingDto } from './dto/registration-email-resending.dto';
import { RegistrationDto } from './dto/registration.dto';
import { RecaptchaService } from './recaptcha/recaptcha.service';
import type {
  AuthenticatedUser,
  JwtExpiresIn,
  JwtPayload,
  TokenPair,
} from './types/jwt-payload';

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
    private readonly emailService: EmailService,
    private readonly recaptchaService: RecaptchaService,
  ) {}

  /**
   * Проверяет учётные данные и выпускает пару токенов.
   *
   * @throws AppException `INVALID_CREDENTIALS` со статусом 401
   * @throws AppException `EMAIL_NOT_CONFIRMED` со статусом 401
   */
  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Сравнение выполняется всегда, даже когда пользователя нет, — время
    // ответа не должно зависеть от того, зарегистрирован email или нет.
    const isPasswordValid = await bcrypt.compare(
      dto.password,
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

    // Проверяется после сверки пароля, а не вместе с ней: иначе по ответу
    // можно было бы узнать, что email зарегистрирован, не зная пароля, — тот
    // самый оракул, ради которого выше считается DUMMY_PASSWORD_HASH. Здесь
    // отдельный код уже безопасен: до него доходит только владелец аккаунта.
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
   * Неподтверждённая запись с тем же email/username перезаписывается (UC-1).
   */
  async registration(dto: RegistrationDto): Promise<void> {
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const existingByUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
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

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const code = randomUUID();
    const expiresAt = new Date(Date.now() + EMAIL_CONFIRMATION_TTL_MS);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        isConfirmed: false,
        emailConfirmation: {
          create: { code, expiresAt },
        },
      },
    });

    await this.sendConfirmationEmail(user.email, code);
  }

  /**
   * Подтверждение email по коду из письма.
   *
   * @throws AppException `CONFIRMATION_CODE_INVALID`
   * @throws AppException `CONFIRMATION_CODE_EXPIRED`
   */
  async registrationConfirmation(
    dto: RegistrationConfirmationDto,
  ): Promise<void> {
    const confirmation = await this.prisma.emailConfirmation.findUnique({
      where: { code: dto.code },
      include: { user: true },
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
      this.prisma.emailConfirmation.delete({
        where: { id: confirmation.id },
      }),
    ]);
  }

  /**
   * Повторная отправка кода подтверждения.
   *
   * @throws AppException `USER_NOT_FOUND` со статусом 404
   * @throws AppException `EMAIL_ALREADY_CONFIRMED`
   */
  async registrationEmailResending(
    dto: RegistrationEmailResendingDto,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { emailConfirmation: true },
    });

    if (!user) {
      throw new AppException({
        code: AUTH_ERROR_CODE.USER_NOT_FOUND,
        message: AUTH_ERROR_MESSAGE.USER_NOT_FOUND,
        // Без явного статуса AppException отдал бы 400, а по правилу 6
        // «ресурс не найден» — это 404.
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
   * Письмо уходит и неподтверждённым пользователям (isConfirmed не проверяем).
   *
   * @throws AppException `RECAPTCHA_FAILED` со статусом 400
   * @throws AppException `USER_NOT_FOUND` со статусом 404
   */
  async passwordRecovery(dto: PasswordRecoveryDto): Promise<void> {
    // Сначала captcha — иначе боты дёргали бы БД по произвольным email.
    await this.recaptchaService.verify(dto.recaptchaToken);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
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
   * @throws AppException `RECOVERY_CODE_INVALID`
   * @throws AppException `RECOVERY_CODE_EXPIRED`
   */
  async newPassword(dto: NewPasswordDto): Promise<void> {
    const recovery = await this.prisma.passwordRecovery.findUnique({
      where: { code: dto.recoveryCode },
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

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: recovery.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordRecovery.delete({
        where: { id: recovery.id },
      }),
      this.prisma.session.deleteMany({
        where: { userId: recovery.userId },
      }),
    ]);
  }

  /**
   * Пользователь для `request.user`. Возвращает `null`, если аккаунт удалён, —
   * тогда ещё живой токен не должен пускать дальше.
   */
  async findAuthenticatedUser(
    userId: string,
  ): Promise<AuthenticatedUser | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: AUTHENTICATED_USER_SELECT,
    });
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

    await this.emailService.sendRegistrationConfirmation(email, confirmUrl);
  }

  private async sendPasswordRecoveryEmail(
    email: string,
    code: string,
  ): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const recoveryUrl = `${frontendUrl}/auth/new-password?code=${code}`;

    await this.emailService.sendPasswordRecovery(email, recoveryUrl);
  }
}
