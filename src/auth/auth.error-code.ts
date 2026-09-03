/**
 * Доменные коды ошибок авторизации. Общие коды (`UNAUTHORIZED`, `NOT_FOUND`
 * и прочие) живут в `common/errors/error-code.ts`; сюда попадает только то,
 * что специфично для auth (логин, регистрация, токены).
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
  /**
   * Пароль сошёлся, но email ещё не подтверждён. Отдельно от
   * `INVALID_CREDENTIALS`: фронту нужно предложить переотправку письма, а не
   * форму входа заново.
   */
  EMAIL_NOT_CONFIRMED: 'EMAIL_NOT_CONFIRMED',

  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  USERNAME_ALREADY_EXISTS: 'USERNAME_ALREADY_EXISTS',
  CONFIRMATION_CODE_INVALID: 'CONFIRMATION_CODE_INVALID',
  CONFIRMATION_CODE_EXPIRED: 'CONFIRMATION_CODE_EXPIRED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  EMAIL_ALREADY_CONFIRMED: 'EMAIL_ALREADY_CONFIRMED',

  RECOVERY_CODE_INVALID: 'RECOVERY_CODE_INVALID',
  RECOVERY_CODE_EXPIRED: 'RECOVERY_CODE_EXPIRED',
  RECAPTCHA_FAILED: 'RECAPTCHA_FAILED',

  /**
   * Провайдер не вернул email (нет scope или почта скрыта).
   * Без email пользователя не создаём: поле в схеме обязательное и уникальное.
   */
  OAUTH_EMAIL_REQUIRED: 'OAUTH_EMAIL_REQUIRED',
  /** Обмен code на профиль не удался или пользователь отказал в доступе. */
  OAUTH_FAILED: 'OAUTH_FAILED',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODE)[keyof typeof AUTH_ERROR_CODE];

export const AUTH_ERROR_MESSAGE = {
  INVALID_CREDENTIALS: 'Неверный email или пароль',
  TOKEN_EXPIRED: 'Срок действия токена истёк. Войдите заново',
  EMAIL_NOT_CONFIRMED:
    'Email не подтверждён. Перейдите по ссылке из письма или запросите новое',
  EMAIL_ALREADY_EXISTS: 'Пользователь с таким email уже зарегистрирован',
  USERNAME_ALREADY_EXISTS: 'Пользователь с таким username уже зарегистрирован',
  CONFIRMATION_CODE_INVALID: 'Код подтверждения недействителен',
  CONFIRMATION_CODE_EXPIRED: 'Ссылка подтверждения истекла',
  USER_NOT_FOUND: 'Пользователь не найден',
  EMAIL_ALREADY_CONFIRMED: 'Email уже подтверждён',
  RECOVERY_CODE_INVALID: 'Код восстановления недействителен',
  RECOVERY_CODE_EXPIRED: 'Ссылка восстановления истекла',
  RECAPTCHA_FAILED: 'Проверка reCAPTCHA не пройдена',
  OAUTH_EMAIL_REQUIRED:
    'Провайдер не предоставил email. Разрешите доступ к почте и попробуйте снова',
  OAUTH_FAILED: 'Не удалось войти через OAuth. Попробуйте ещё раз',
} as const;
