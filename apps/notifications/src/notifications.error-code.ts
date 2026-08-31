/**
 * Доменные коды ошибок рассылки. Общие живут в `libs/common/src/errors`.
 *
 * `code` — часть публичного контракта (CLAUDE.md, правило 5): он доезжает до
 * фронтенда через gateway, поэтому переименование ломает клиент.
 */
export const NOTIFICATIONS_ERROR_CODE = {
  /** SMTP не принял письмо. Повторить можно, но не сразу. */
  EMAIL_DELIVERY_FAILED: 'EMAIL_DELIVERY_FAILED',
} as const;

export type NotificationsErrorCode =
  (typeof NOTIFICATIONS_ERROR_CODE)[keyof typeof NOTIFICATIONS_ERROR_CODE];
