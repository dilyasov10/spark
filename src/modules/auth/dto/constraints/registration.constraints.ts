export const USERNAME_MIN_LENGTH = 6;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{6,30}$/;

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 20;
export const PASSWORD_PATTERN =
  /^[0-9A-Za-z!"#$%&'()*+,\-./:;<=>?@[\]^_{|}~]+$/;
export const PASSWORD_COMPLEXITY_PATTERN = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).+$/;

export const FIRST_NAME_MIN_LENGTH = 1;
export const FIRST_NAME_MAX_LENGTH = 50;
export const LAST_NAME_MIN_LENGTH = 1;
export const LAST_NAME_MAX_LENGTH = 50;

/** TTL for email confirmation code (plan: 1 hour). */
export const EMAIL_CONFIRMATION_TTL_MS = 60 * 60 * 1000;

export const BCRYPT_SALT_ROUNDS = 10;
