import { HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../common/errors/app.exception';
import {
  ERROR_CODE,
  errorMessageByStatus,
} from '../../common/errors/error-code';
import { AUTH_ERROR_CODE, AUTH_ERROR_MESSAGE } from '../auth.error-code';
import type { AuthenticatedUser } from '../types/jwt-payload';

/**
 * `AuthGuard('jwt')` в чистом виде кидает `UnauthorizedException` с английским
 * текстом `Unauthorized`, и глобальный фильтр отдаёт его пользователю как есть.
 * Подкласс переводит отказы Passport в `AppException` с русским текстом и
 * кодом из контракта.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    // Ошибка из validate() — уже AppException, подменять её не нужно.
    // Всё, что не Error, Passport бросать не должен; такой случай проваливается
    // ниже и получает обычный 401 вместо утечки сырого значения в 500.
    if (err instanceof Error) {
      throw err;
    }

    if (user) {
      return user;
    }

    // Сверяем имя, а не `instanceof TokenExpiredError`: jsonwebtoken —
    // транзитивная зависимость, прямого импорта из неё лучше не заводить.
    const isExpired =
      info instanceof Error && info.name === 'TokenExpiredError';

    throw new AppException({
      code: isExpired ? AUTH_ERROR_CODE.TOKEN_EXPIRED : ERROR_CODE.UNAUTHORIZED,
      message: isExpired
        ? AUTH_ERROR_MESSAGE.TOKEN_EXPIRED
        : errorMessageByStatus(HttpStatus.UNAUTHORIZED),
      status: HttpStatus.UNAUTHORIZED,
    });
  }
}
