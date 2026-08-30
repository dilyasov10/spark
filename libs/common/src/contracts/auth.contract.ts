import type { AuthenticatedUser, TokenPair } from '../auth/jwt.types';

/**
 * Паттерны сообщений auth-микросервиса.
 *
 * Такая же часть контракта, как имена полей: переименование паттерна ломает
 * gateway ровно так же, как переименование эндпоинта ломает фронтенд.
 */
export const AUTH_PATTERN = {
  /** Проверить пароль и выпустить пару токенов. */
  LOGIN: 'auth.login',
  /** Найти пользователя по id для `request.user`. */
  FIND_AUTHENTICATED_USER: 'auth.find-authenticated-user',
} as const;

/** Полезная нагрузка `auth.login`. */
export interface LoginCommand {
  email: string;
  password: string;
}

/** Ответ `auth.login`. */
export type LoginResult = TokenPair;

/** Полезная нагрузка `auth.find-authenticated-user`. */
export interface FindAuthenticatedUserQuery {
  userId: string;
}

/** Ответ `auth.find-authenticated-user`. `null` — аккаунта больше нет. */
export type FindAuthenticatedUserResult = AuthenticatedUser | null;
