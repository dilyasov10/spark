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
  /** Создать неподтверждённого пользователя и отправить письмо с кодом. */
  REGISTRATION: 'auth.registration',
  /** Подтвердить email по коду из письма. */
  REGISTRATION_CONFIRMATION: 'auth.registration-confirmation',
  /** Повторно отправить письмо подтверждения. */
  REGISTRATION_EMAIL_RESENDING: 'auth.registration-email-resending',
  /** Создать recovery-код и отправить письмо для смены пароля. */
  PASSWORD_RECOVERY: 'auth.password-recovery',
  /** Сменить пароль по recovery-коду. */
  NEW_PASSWORD: 'auth.new-password',
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

/**
 * Полезная нагрузка `auth.registration`. Без `passwordConfirmation`:
 * совпадение паролей проверяет gateway при валидации DTO.
 */
export interface RegistrationCommand {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/** Полезная нагрузка `auth.registration-confirmation`. */
export interface RegistrationConfirmationCommand {
  code: string;
}

/** Полезная нагрузка `auth.registration-email-resending`. */
export interface RegistrationEmailResendingCommand {
  email: string;
}

/**
 * Полезная нагрузка `auth.password-recovery`. Без токена reCAPTCHA: его
 * проверяет gateway до проксирования (edge-проверка токена из браузера).
 */
export interface PasswordRecoveryCommand {
  email: string;
}

/**
 * Полезная нагрузка `auth.new-password`. Без `passwordConfirmation`:
 * совпадение проверяет gateway.
 */
export interface NewPasswordCommand {
  recoveryCode: string;
  newPassword: string;
}
