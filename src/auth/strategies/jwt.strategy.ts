import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppException } from '../../common/errors/app.exception';
import {
  ERROR_CODE,
  errorMessageByStatus,
} from '../../common/errors/error-code';
import { AuthService } from '../auth.service';
import type { AuthenticatedUser, JwtPayload } from '../types/jwt-payload';

/**
 * Разбирает `Authorization: Bearer <token>` и подменяет payload токена на
 * актуального пользователя из БД.
 *
 * Поход в базу здесь намеренный: без него удалённый аккаунт продолжал бы
 * работать до истечения access-токена, то есть ещё 15 минут.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.authService.findAuthenticatedUser(payload.sub);

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
