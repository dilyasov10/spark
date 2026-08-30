import type { JwtSignOptions } from '@nestjs/jwt';

/**
 * Срок жизни токена. В типах jsonwebtoken это не просто `string`, а шаблонный
 * литерал вида `'15m'` / `'7d'`, поэтому значение из окружения приходится
 * сужать — делаем это здесь, в одном месте, а не при каждом использовании.
 *
 * Формат строки при этом остаётся на совести окружения: тип его не проверяет.
 */
export type JwtExpiresIn = NonNullable<JwtSignOptions['expiresIn']>;

/**
 * Содержимое JWT. Токен не шифруется, а лишь подписывается — прочитать его
 * может кто угодно, поэтому внутри только идентификатор и email, без
 * персональных данных и ролей.
 */
export interface JwtPayload {
  /** Стандартный claim `subject` — id пользователя. */
  sub: string;
  email: string;
}

/**
 * Пользователь, которого стратегия кладёт в `request.user`. Собирается
 * `select`-ом без `passwordHash`: хеш не должен покидать сервис ни при каких
 * условиях.
 *
 * `createdAt` — строка, а не `Date`: до gateway пользователь доезжает через
 * RabbitMQ, то есть через `JSON.stringify`, и объектом `Date` там быть уже
 * перестаёт. Формат при этом ровно тот, что требует контракт, — ISO 8601 в UTC.
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

/** Пара токенов, которую выпускает `AuthService`. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
