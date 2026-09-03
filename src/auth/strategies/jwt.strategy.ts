import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppException } from '../../common/errors/app.exception';
import {
  ERROR_CODE,
  errorMessageByStatus,
} from '../../common/errors/error-code';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';
import { AuthService } from '../auth.service';
import type { AuthenticatedUser, JwtPayload } from '../types/jwt-payload';

/**
 * Читает access-токен из httpOnly-cookie. Заголовок Authorization больше
 * не нужен: фронт шлёт cookie сам (`credentials: 'include'`).
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
      jwtFromRequest: ExtractJwt.fromExtractors([accessTokenFromCookie]),
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

function accessTokenFromCookie(request: Request): string | null {
  const token = request.cookies?.[ACCESS_TOKEN_COOKIE];
  return typeof token === 'string' && token.length > 0 ? token : null;
}
