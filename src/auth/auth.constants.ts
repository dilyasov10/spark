import type { CookieOptions } from 'express';
import { API_PREFIX } from '../common/bootstrap/setup-app';

/**
 * Та же стоимость, что у сида (`prisma/seed/index.ts`), — иначе сид-аккаунты
 * пришлось бы перехешировать.
 */
export const BCRYPT_ROUNDS = 10;

/** TTL кода подтверждения email (1 час), как в плане UC-1. */
export const EMAIL_CONFIRMATION_TTL_MS = 60 * 60 * 1000;

/** TTL кода восстановления пароля (1 час), как в плане UC-3. */
export const PASSWORD_RECOVERY_TTL_MS = 60 * 60 * 1000;

/** Имя cookie с refresh-токеном. Часть контракта с фронтендом. */
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

/**
 * Cookie видна только auth-роутам: остальные эндпоинты refresh-токен не читают,
 * и слать его им незачем. Путь обязан учитывать глобальный префикс — cookie,
 * выданную на `/auth`, браузер на `/api/auth/...` уже не пришлёт.
 */
export const REFRESH_TOKEN_COOKIE_PATH = `/${API_PREFIX}/auth`;

const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Refresh-токен уходит только в httpOnly-cookie: в `localStorage` его достал бы
 * любой XSS, а из cookie с этим флагом JS его не прочитает.
 *
 * `sameSite: 'none'` нужен, когда фронт живёт на другом домене, но браузеры
 * принимают его только вместе с `secure`, а `secure` не работает по http —
 * поэтому локально режим мягче.
 */
export function refreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  };
}
