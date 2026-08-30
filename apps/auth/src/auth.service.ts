import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AUTH_ERROR_CODE, AUTH_ERROR_MESSAGE, AppException } from '@app/common';
import type {
  AuthenticatedUser,
  JwtExpiresIn,
  JwtPayload,
  LoginCommand,
  TokenPair,
} from '@app/common';
import { PrismaService } from '@app/prisma';
import { BCRYPT_ROUNDS } from './auth.constants';

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
  ) {}

  /**
   * Проверяет учётные данные и выпускает пару токенов.
   *
   * @throws AppException `INVALID_CREDENTIALS` со статусом 401
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

    return this.issueTokens({ sub: user.id, email: user.email });
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

    // `createdAt` приводится к строке здесь, а не в gateway: через RabbitMQ
    // едет JSON, и `Date` всё равно станет строкой — пусть тип на обеих
    // сторонах говорит правду.
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
}
