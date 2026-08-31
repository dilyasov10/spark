/**
 * Очереди RabbitMQ — по одной на микросервис. Имя очереди берётся из
 * окружения (`RABBITMQ_AUTH_QUEUE` и подобные), эти значения — дефолт для
 * локального запуска, чтобы поднять сервис без полного .env.
 */
export const RMQ_QUEUE = {
  AUTH: 'auth_queue',
  NOTIFICATIONS: 'notifications_queue',
} as const;

/**
 * Токены инжекта `ClientProxy`. Строки, а не классы: клиент создаётся
 * фабрикой `ClientsModule`, привязать его к типу нечем.
 */
export const RMQ_CLIENT = {
  AUTH: 'AUTH_RMQ_CLIENT',
  NOTIFICATIONS: 'NOTIFICATIONS_RMQ_CLIENT',
} as const;

/**
 * Сколько gateway ждёт ответ микросервиса.
 *
 * Без ограничения запрос к упавшему сервису висел бы до таймаута клиента —
 * то есть, по сути, вечно: RabbitMQ примет сообщение в очередь и промолчит,
 * потому что забирать его некому.
 */
export const RPC_TIMEOUT_MS = 5_000;
