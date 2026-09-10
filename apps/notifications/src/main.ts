// Транспорт собирается до старта Nest, а значит и до того, как ConfigModule
// прочитает .env, — файл приходится подгружать здесь самим.
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { MicroserviceOptions } from '@nestjs/microservices';
import {
  RMQ_QUEUE,
  envOrDefault,
  requireEnv,
  rmqServerOptions,
} from '@app/common';
import { NotificationsModule } from './notifications.module';

async function bootstrap() {
  const queue = envOrDefault(
    'RABBITMQ_NOTIFICATIONS_QUEUE',
    RMQ_QUEUE.NOTIFICATIONS,
  );

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    NotificationsModule,
    rmqServerOptions({ url: requireEnv('RABBITMQ_URL'), queue }),
  );

  await app.listen();

  Logger.log(`Notifications слушает очередь ${queue}`, 'Bootstrap');
}
bootstrap();
