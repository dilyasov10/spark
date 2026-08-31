import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  AUTH_PATTERN,
  AppException,
  ERROR_CODE,
  RMQ_CLIENT,
  errorMessageByStatus,
  sendRpc,
} from '@app/common';
import type {
  AuthenticatedUser,
  FindAuthenticatedUserQuery,
  FindAuthenticatedUserResult,
  JwtPayload,
} from '@app/common';

/**
 * Разбирает `Authorization: Bearer <token>` и подменяет payload токена на
 * актуального пользователя из auth-микросервиса.
 *
 * Поход за пользователем здесь намеренный: без него удалённый аккаунт
 * продолжал бы работать до истечения access-токена, то есть ещё 15 минут.
 * Подпись при этом проверяется на месте — ради неё в брокер ходить незачем.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject(RMQ_CLIENT.AUTH) private readonly authClient: ClientProxy,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await sendRpc<
      FindAuthenticatedUserResult,
      FindAuthenticatedUserQuery
    >(this.authClient, AUTH_PATTERN.FIND_AUTHENTICATED_USER, {
      userId: payload.sub,
    });

    if (!user) {
      // Подпись верна, но аккаунта больше нет.
      throw new AppException({
        code: ERROR_CODE.UNAUTHORIZED,
        message: errorMessageByStatus(HttpStatus.UNAUTHORIZED),
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    return user;
  }
}
