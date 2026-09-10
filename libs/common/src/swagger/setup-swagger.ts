import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { API_PREFIX } from '../bootstrap/setup-app';
import { ApiErrorDto, ErrorDetailDto } from '../dto/api-error.dto';

/**
 * `SwaggerModule.setup` вешает маршрут в обход глобального префикса, поэтому
 * префикс подставляем сами — адрес UI остаётся `/api/v1/docs`.
 */
export const SWAGGER_PATH = `${API_PREFIX}/docs`;

/** Машиночитаемая спека: по ней фронтенд генерирует типы и клиент. */
export const SWAGGER_JSON_PATH = `${SWAGGER_PATH}-json`;

/** Группы эндпоинтов. Описание тега видно фронтенду прямо в UI. */
const TAGS: ReadonlyArray<{ name: string; description: string }> = [
  {
    name: 'auth',
    description:
      'Вход, выход и профиль текущего пользователя. Access-токен приходит ' +
      'в теле ответа, refresh-токен — httpOnly-cookie.',
  },
  {
    name: 'health',
    description: 'Проверка живости сервиса. Используется пробами Kubernetes.',
  },
];

const DESCRIPTION = [
  '## Контракт',
  '',
  '- поля — `camelCase`;',
  '- `id` и все ссылочные поля (`userId`, `postId`) — строка UUID, не число;',
  '- даты — ISO 8601 в UTC: `2026-08-21T01:52:00.000Z`;',
  '- пустая коллекция — `[]`, никогда не `null`;',
  '- ошибка на любом статусе — `{ code, message, details? }`.',
  '',
  '`code` — стабильный машинный идентификатор в `UPPER_SNAKE_CASE`.',
  'Ветвиться нужно по нему, а не по тексту `message`: текст меняется без',
  'предупреждения, `code` — часть контракта. Конкретные коды перечислены',
  'в описании каждого ответа с ошибкой.',
  '',
  '## Авторизация',
  '',
  '1. `POST /api/v1/auth/login` возвращает `accessToken` в теле и ставит',
  '   httpOnly-cookie `refreshToken` на путь `/api/v1/auth`.',
  '2. Access-токен живёт 15 минут и уходит заголовком',
  '   `Authorization: Bearer <token>`.',
  '3. Cookie недоступна из JS — это защита от XSS. Запросы к API нужно слать',
  '   с `credentials: "include"`, иначе браузер её не приложит.',
  '4. `POST /api/v1/auth/logout` гасит cookie. Access-токен при этом остаётся',
  '   валидным до конца своего срока — стереть его у себя должен фронтенд.',
  '',
  'Домен фронтенда должен быть перечислен в `CORS_ORIGINS` на сервере:',
  'иначе браузер не отдаст ответ и не пришлёт cookie.',
].join('\n');

/**
 * Адреса, по которым API реально доступен. Без них сгенерированный клиент не
 * знает базового URL, а «Try it out» в UI бьёт в текущий origin.
 *
 * Путь `/api/v1` сюда не входит: он уже есть в самих путях спеки.
 */
function applyServers(builder: DocumentBuilder): void {
  const publicUrl = process.env.PUBLIC_API_URL?.trim();

  if (publicUrl) {
    builder.addServer(publicUrl, 'Развёрнутый стенд');
  }

  builder.addServer(
    `http://localhost:${process.env.PORT ?? 3000}`,
    'Локальный запуск',
  );
}

/**
 * `operationId` становится именем метода в сгенерированном клиенте: с
 * умолчанием Nest фронтенд получил бы `authControllerLogin()` вместо `login()`.
 *
 * Уникальность имени метода Nest не проверяет — при совпадении спека молча
 * теряет один из эндпоинтов. Поэтому падаем на сборке документа: ошибка видна
 * разработчику, а не фронтенду по факту пропавшего метода.
 */
function createOperationIdFactory(): (
  controllerKey: string,
  methodKey: string,
) => string {
  const ownerByMethod = new Map<string, string>();

  return (controllerKey: string, methodKey: string): string => {
    const owner = ownerByMethod.get(methodKey);

    if (owner && owner !== controllerKey) {
      throw new Error(
        `Swagger: метод ${methodKey} есть и в ${owner}, и в ${controllerKey}. ` +
          'operationId обязан быть уникальным — переименуйте один из них.',
      );
    }

    ownerByMethod.set(methodKey, controllerKey);

    return methodKey;
  };
}

/**
 * Собирает спеку. Вынесено отдельно от `setupSwagger`, чтобы скрипт выгрузки
 * `openapi.json` отдавал фронтенду ровно тот же документ, что раздаёт сервер.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Inctagram API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access-токен из ответа POST /api/v1/auth/login',
    });

  TAGS.forEach(({ name, description }) => builder.addTag(name, description));
  applyServers(builder);

  return SwaggerModule.createDocument(app, builder.build(), {
    // Схема ошибки регистрируется всегда, даже если на неё ссылается только
    // `$ref`: фронтенд генерирует по ней типы.
    extraModels: [ApiErrorDto, ErrorDetailDto],
    operationIdFactory: createOperationIdFactory(),
  });
}

/**
 * Swagger — единственный источник правды по API (CLAUDE.md, правило 7).
 */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
    customSiteTitle: 'Inctagram API',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      displayRequestDuration: true,
    },
  });
}
