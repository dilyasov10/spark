/**
 * Доменные коды ошибок авторизации. Общие коды (`UNAUTHORIZED`, `NOT_FOUND`
 * и прочие) живут в `common/errors/error-code.ts`; сюда попадает только то,
 * что специфично для входа в аккаунт.
 *
 * `code` — часть публичного контракта (CLAUDE.md, правило 5): фронт ветвится
 * по нему, а не по тексту, поэтому переименование ломает клиент.
 */
export const AUTH_ERROR_CODE = {
  /**
   * Один код и на несуществующий email, и на неверный пароль. Разные коды
   * превратили бы эндпоинт в оракул «зарегистрирован ли этот email».
   */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /**
   * Отдельно от `UNAUTHORIZED`: по нему фронт понимает, что токен нужно молча
   * обновить, а не показывать форму входа.
   */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODE)[keyof typeof AUTH_ERROR_CODE];

export const AUTH_ERROR_MESSAGE = {
  INVALID_CREDENTIALS: 'Неверный email или пароль',
  TOKEN_EXPIRED: 'Срок действия токена истёк. Войдите заново',
} as const;
