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
 * Refresh JWT. `deviceId` связывает cookie с строкой `Session`
 * (`@@unique([userId, deviceId])`). Access-токен это поле не несёт.
 */
export interface RefreshJwtPayload extends JwtPayload {
  deviceId: string;
  /** Уникален на каждую выдачу, чтобы ротация в ту же секунду не повторила JWT. */
  jti?: string;
}

/** IP и User-Agent с запроса — пишем в Session при login / refresh / OAuth. */
export interface SessionContext {
  ip: string;
  deviceName: string;
}

/**
 * Пользователь, которого стратегия кладёт в `request.user`. Собирается
 * `select`-ом без `passwordHash`: хеш не должен покидать сервис ни при каких
 * условиях.
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
}

/** Пара токенов, которую выпускает `AuthService`. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
