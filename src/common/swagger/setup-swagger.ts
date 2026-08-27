import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '../bootstrap/setup-app';
import { ApiErrorDto, ErrorDetailDto } from '../dto/api-error.dto';

/**
 * `SwaggerModule.setup` вешает маршрут в обход глобального префикса, поэтому
 * префикс подставляем сами — адрес UI остаётся `/api/docs`.
 */
export const SWAGGER_PATH = `${API_PREFIX}/docs`;

/**
 * Swagger — единственный источник правды по API (CLAUDE.md, правило 7).
 * Схема ошибки регистрируется всегда, даже если её ещё не использует ни один
 * эндпоинт: фронтенд генерирует по ней типы.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Inctagram API')
    .setDescription(
      'Поля — camelCase, id — UUID-строка, даты — ISO 8601 в UTC, ' +
        'пустые коллекции — [], ошибки — { code, message, details }.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ApiErrorDto, ErrorDetailDto],
  });

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
