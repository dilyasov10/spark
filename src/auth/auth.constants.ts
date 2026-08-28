import type { CookieOptions } from 'express';
import { API_PREFIX } from '../common/bootstrap/setup-app';

/**
 * Та же стоимость, что у сида (`prisma/seed/index.ts`), — иначе сид-аккаунты
 * пришлось бы перехешировать.
 */
export const BCRYPT_ROUNDS = 10;

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
 * Атрибуты, по которым браузер отличает одну cookie от другой. Вынесены
 * отдельно, потому что выдача и гашение обязаны совпадать до последнего поля:
 * cookie с тем же именем, но другим `path` или `sameSite`, для браузера чужая,
 * и на выходе из аккаунта она не удалится.
 *
 * Refresh-токен уходит только в httpOnly-cookie: в `localStorage` его достал бы
 * любой XSS, а из cookie с этим флагом JS его не прочитает.
 *
 * `sameSite: 'none'` нужен, когда фронт живёт на другом домене, но браузеры
 * принимают его только вместе с `secure`, а `secure` не работает по http —
 * поэтому локально режим мягче.
 */
function refreshCookieAttributes(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
  };
}

/** Опции cookie, которую выдаём при входе. */
export function refreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    ...refreshCookieAttributes(isProduction),
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  };
}

/**
 * Опции для `res.clearCookie` при выходе: те же атрибуты, но без `maxAge` —
 * гашение это та же cookie с датой истечения в прошлом, и срок жизни ей уже
 * не нужен. Express выбрасывает `maxAge` в `clearCookie` и сам, но передавать
 * туда опции выдачи — значит держать выход из аккаунта на детали реализации
 * соседней библиотеки.
 */
export function clearRefreshCookieOptions(
  isProduction: boolean,
): CookieOptions {
  return refreshCookieAttributes(isProduction);
}
