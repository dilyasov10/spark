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

/** Имя cookie с access-токеном. JS его не читает — только браузер шлёт на API. */
export const ACCESS_TOKEN_COOKIE = 'accessToken';

/** Имя cookie с refresh-токеном. Часть контракта с фронтендом. */
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

/** Значение `OAuthProvider.provider` для входа через Google. */
export const OAUTH_PROVIDER_GOOGLE = 'google' as const;

/** Значение `OAuthProvider.provider` для входа через GitHub. */
export const OAUTH_PROVIDER_GITHUB = 'github' as const;

/**
 * Префикс генерируемого username: `client1`, `client2`, …
 * Google и GitHub не отдают логин в формате `/^[a-zA-Z0-9_-]{6,30}$/`.
 */
export const OAUTH_USERNAME_PREFIX = 'client';

/** Заглушки, если в профиле нет имени или фамилии — поля в схеме обязательные. */
export const OAUTH_FALLBACK_FIRST_NAME = 'User';
export const OAUTH_FALLBACK_LAST_NAME = 'OAuth';

/**
 * Куда фронт принимает возврат после OAuth: успех — без query,
 * отказ — `?error=CODE`. Токены в URL не кладём.
 */
export const OAUTH_FRONTEND_CALLBACK_PATH = '/auth/oauth';

/**
 * Cookie с `state` для CSRF. Две разные, чтобы параллельный вход
 * Google и GitHub не перезаписывал друг друга.
 */
export const OAUTH_GOOGLE_STATE_COOKIE = 'oauthGoogleState';
export const OAUTH_GITHUB_STATE_COOKIE = 'oauthGithubState';

const OAUTH_STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Access виден всем API-роутам: `GET /api/auth/me` и будущие `/api/posts`
 * должны получать cookie. Refresh ниже уже, его читают только auth-роуты.
 */
export const ACCESS_TOKEN_COOKIE_PATH = `/${API_PREFIX}`;

/**
 * Cookie видна только auth-роутам: остальные эндпоинты refresh-токен не читают,
 * и слать его им незачем. Путь обязан учитывать глобальный префикс — cookie,
 * выданную на `/auth`, браузер на `/api/auth/...` уже не пришлёт.
 */
export const REFRESH_TOKEN_COOKIE_PATH = `/${API_PREFIX}/auth`;

const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Access и refresh — httpOnly: в `localStorage` их достал бы любой XSS,
 * а из cookie с этим флагом JS не прочитает.
 *
 * `sameSite: 'none'` нужен, когда фронт живёт на другом домене, но браузеры
 * принимают его только вместе с `secure`, а `secure` не работает по http —
 * поэтому локально режим мягче.
 */
export function accessCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: ACCESS_TOKEN_COOKIE_PATH,
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  };
}

export function refreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  };
}

/**
 * `state` ставим на том же path, что и refresh: callback читает cookie
 * с `/api/auth/oauth/.../callback`. `sameSite: lax` достаточно — это
 * top-level GET после провайдера, не XHR с другого origin.
 */
export function oauthStateCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: OAUTH_STATE_COOKIE_MAX_AGE_MS,
  };
}

/** Редирект на фронт после OAuth: на успехе без query, на отказе — код ошибки. */
export function buildOAuthFrontendRedirectUrl(
  frontendUrl: string,
  error?: string,
): string {
  const base = frontendUrl.endsWith('/') ? frontendUrl : `${frontendUrl}/`;
  const url = new URL(OAUTH_FRONTEND_CALLBACK_PATH, base);

  if (error) {
    url.searchParams.set('error', error);
  }

  return url.toString();
}
