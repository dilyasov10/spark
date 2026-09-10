/**
 * Та же стоимость, что у сида (`prisma/seed/index.ts`), — иначе сид-аккаунты
 * пришлось бы перехешировать.
 */
export const BCRYPT_ROUNDS = 10;

/** TTL кода подтверждения email (1 час). */
export const EMAIL_CONFIRMATION_TTL_MS = 60 * 60 * 1000;

/** TTL кода восстановления пароля (1 час). */
export const PASSWORD_RECOVERY_TTL_MS = 60 * 60 * 1000;
