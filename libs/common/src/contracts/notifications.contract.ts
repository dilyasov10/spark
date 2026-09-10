/** Паттерны сообщений notifications-микросервиса. */
export const NOTIFICATIONS_PATTERN = {
  /** Отправить письмо. Запрос-ответ: вызывающий узнаёт об отказе SMTP. */
  SEND_EMAIL: 'notifications.send-email',
} as const;

/** Полезная нагрузка `notifications.send-email`. */
export interface SendEmailCommand {
  /** Адрес получателя. */
  to: string;
  subject: string;
  /** Тело письма в HTML. */
  html: string;
}

/** Ответ `notifications.send-email`. */
export interface SendEmailResult {
  /** Идентификатор письма от SMTP-сервера — по нему письмо ищут в логах. */
  messageId: string;
}
