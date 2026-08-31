import { Transport } from '@nestjs/microservices';
import type { RmqOptions } from '@nestjs/microservices';

/** Параметры подключения к очереди — общие у слушателя и у клиента. */
export interface RmqConnectionOptions {
  /** Строка подключения к брокеру, `amqp://user:pass@host:5672`. */
  url: string;
  /** Имя очереди микросервиса. */
  queue: string;
}

/**
 * Транспорт для `NestFactory.createMicroservice` — сторона, которая слушает
 * очередь.
 *
 * `durable: true` обязателен на обеих сторонах: RabbitMQ откажется отдавать
 * очередь клиенту, объявившему её с другими параметрами, и подключение упадёт
 * с `PRECONDITION_FAILED`.
 */
export function rmqServerOptions({
  url,
  queue,
}: RmqConnectionOptions): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [url],
      queue,
      queueOptions: { durable: true },
    },
  };
}

/**
 * Транспорт для `ClientsModule` — сторона, которая шлёт сообщения.
 *
 * `persistent: true` помечает сообщения как переживающие перезапуск брокера:
 * без него всё, что лежало в очереди, пропадает вместе с RabbitMQ.
 */
export function rmqClientOptions({ url, queue }: RmqConnectionOptions) {
  return {
    transport: Transport.RMQ as const,
    options: {
      urls: [url],
      queue,
      queueOptions: { durable: true },
      persistent: true,
    },
  };
}
