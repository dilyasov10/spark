/**
 * Выгружает спеку в `openapi.json` — по ней фронтенд генерирует типы и клиент.
 *
 *   pnpm swagger:json
 *
 * Поднимать сервер, базу и RabbitMQ для этого не нужно: документ собирается из
 * метаданных декораторов, а не из живых запросов. Файл коммитится, поэтому
 * изменение контракта видно в диффе пул-реквеста — ровно там, где о нём нужно
 * предупредить фронтенд (CLAUDE.md, правило 7).
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { buildOpenApiDocument, setupApp } from '@app/common';
import { AppModule } from '../apps/gateway/src/app.module';

const OUTPUT_PATH = resolve(__dirname, '..', 'openapi.json');

/**
 * `AuthModule` и `JwtStrategy` читают эти переменные через `getOrThrow` при
 * инициализации DI, то есть до того, как соберётся документ. Значения
 * заведомо нерабочие и наружу не уходят: подключения по ним не будет —
 * `ClientProxy` соединяется лениво, при первой отправке, а её здесь нет.
 *
 * Настоящие значения из `.env` при этом не перетираются: если переменная уже
 * задана, ставим её же.
 */
const PLACEHOLDER_ENV: Record<string, string> = {
  JWT_ACCESS_SECRET: 'openapi-generation-only',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'openapi-generation-only',
  JWT_REFRESH_EXPIRES_IN: '7d',
  RABBITMQ_URL: 'amqp://openapi-generation-not-connected',
};

function applyPlaceholderEnv(): void {
  for (const [name, fallback] of Object.entries(PLACEHOLDER_ENV)) {
    process.env[name] ||= fallback;
  }
}

async function generate(): Promise<void> {
  applyPlaceholderEnv();

  const app = await NestFactory.create(AppModule, { logger: false });

  // Префикс — до сборки документа: иначе пути окажутся без `/api/v1`,
  // и сгенерированный клиент будет бить мимо всех эндпоинтов.
  setupApp(app);

  const document = buildOpenApiDocument(app);

  await app.close();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`);

  const endpoints = Object.values(document.paths).reduce(
    (total, methods) => total + Object.keys(methods).length,
    0,
  );

  console.log(`openapi.json обновлён: ${endpoints} эндпоинтов`);
}

generate().catch((error: unknown) => {
  console.error('Не удалось собрать спеку:', error);
  process.exit(1);
});
