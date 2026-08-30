import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable, of, throwError } from 'rxjs';
import {
  AUTH_ERROR_CODE,
  AUTH_ERROR_MESSAGE,
  AUTH_PATTERN,
  AppException,
  toRpcErrorPayload,
} from '@app/common';
import type {
  AuthenticatedUser,
  FindAuthenticatedUserQuery,
  JwtExpiresIn,
  LoginCommand,
  TokenPair,
} from '@app/common';

/** Срок жизни из окружения приходит строкой, а тип у него шаблонный. */
function expiresIn(name: string): JwtExpiresIn {
  return process.env[name] as JwtExpiresIn;
}

/**
 * Заглушка auth-микросервиса для e2e gateway.
 *
 * Живого RabbitMQ в прогоне нет, но проверять хочется настоящий путь ответа:
 * поэтому отказы едут не как обычные исключения, а как `RpcErrorPayload` —
 * ровно то, что положил бы в очередь `RpcExceptionsFilter`. Так тест проходит
 * через `fromRpcError` в gateway и ловит расхождения в формате ошибки.
 *
 * Токены подписываются по-настоящему: `JwtStrategy` проверяет подпись на
 * месте, и фиктивная строка на `/me` не прошла бы.
 */
export function createFakeAuthClient(
  user: AuthenticatedUser,
  password: string,
): { send: (pattern: string, payload: unknown) => Observable<unknown> } {
  const jwtService = new JwtService({
    secret: process.env.JWT_ACCESS_SECRET,
    signOptions: { expiresIn: expiresIn('JWT_ACCESS_EXPIRES_IN') },
  });

  const login = ({ email, password: given }: LoginCommand) => {
    if (email !== user.email || given !== password) {
      return throwError(() =>
        toRpcErrorPayload(
          new AppException({
            code: AUTH_ERROR_CODE.INVALID_CREDENTIALS,
            message: AUTH_ERROR_MESSAGE.INVALID_CREDENTIALS,
            status: HttpStatus.UNAUTHORIZED,
          }),
        ),
      );
    }

    const payload = { sub: user.id, email: user.email };
    const tokens: TokenPair = {
      accessToken: jwtService.sign(payload),
      refreshToken: jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: expiresIn('JWT_REFRESH_EXPIRES_IN'),
      }),
    };

    return of(tokens);
  };

  return {
    send(pattern: string, payload: unknown): Observable<unknown> {
      if (pattern === AUTH_PATTERN.LOGIN) {
        return login(payload as LoginCommand);
      }

      if (pattern === AUTH_PATTERN.FIND_AUTHENTICATED_USER) {
        const { userId } = payload as FindAuthenticatedUserQuery;

        return of(userId === user.id ? user : null);
      }

      throw new Error(`Заглушке auth неизвестен паттерн ${pattern}`);
    },
  };
}
