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
import { AuthModule } from './auth.module';

async function bootstrap() {
  const queue = envOrDefault('RABBITMQ_AUTH_QUEUE', RMQ_QUEUE.AUTH);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    rmqServerOptions({ url: requireEnv('RABBITMQ_URL'), queue }),
  );

  await app.listen();

  Logger.log(`Auth слушает очередь ${queue}`, 'Bootstrap');
}
bootstrap();
