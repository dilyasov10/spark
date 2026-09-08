import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject, OperationObject } from '@nestjs/swagger';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  API_PREFIX,
  AUTH_ERROR_CODE,
  ERROR_CODE,
  buildOpenApiDocument,
  setupApp,
} from '@app/common';
import { AppModule } from '../src/app.module';

// Секреты и адрес брокера общие для всех e2e-спек, см. test/setup-e2e.ts.
// Сообщений здесь не отправляется: документ собирается из метаданных
// декораторов, живой RabbitMQ для этого не нужен.

const OPENAPI_PATH = resolve(__dirname, '..', '..', '..', 'openapi.json');

const ERROR_SCHEMA_REF = '#/components/schemas/ApiErrorDto';

/** Все операции спеки вместе с путём и методом — так удобнее искать. */
function operations(
  document: OpenAPIObject,
): Array<{ path: string; method: string; operation: OperationObject }> {
  return Object.entries(document.paths).flatMap(([path, methods]) =>
    Object.entries(methods as Record<string, OperationObject>).map(
      ([method, operation]) => ({ path, method, operation }),
    ),
  );
}

function operationAt(
  document: OpenAPIObject,
  path: string,
  method: string,
): OperationObject {
  const found = operations(document).find(
    (item) => item.path === path && item.method === method,
  );

  if (!found) {
    throw new Error(`В спеке нет ${method.toUpperCase()} ${path}`);
  }

  return found.operation;
}

/** Коды из примеров ответа: именно по ним ветвится фронтенд. */
function errorCodes(operation: OperationObject, status: number): string[] {
  const response = operation.responses[String(status)];

  if (!response || !('content' in response)) {
    throw new Error(`У операции нет тела ответа на ${status}`);
  }

  const json = response.content?.['application/json'];

  expect(json?.schema).toEqual({ $ref: ERROR_SCHEMA_REF });

  return Object.keys(json?.examples ?? {});
}

describe('Swagger (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Тот же порядок, что в main.ts: префикс до сборки документа.
    setupApp(app);
    await app.init();

    document = buildOpenApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('описывает все роуты с префиксом /api', () => {
    const paths = Object.keys(document.paths);

    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((path) =>
      expect(path.startsWith(`/${API_PREFIX}`)).toBe(true),
    );
  });

  it('даёт каждой операции уникальный operationId без имени контроллера', () => {
    // operationId становится именем метода в сгенерированном клиенте:
    // при совпадении фронтенд молча теряет один из эндпоинтов.
    const ids = operations(document).map(
      ({ operation }) => operation.operationId,
    );

    expect(ids).toContain('login');
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).not.toMatch(/Controller_/));
  });

  it('перечисляет доменные коды ошибок входа', () => {
    const login = operationAt(document, '/api/auth/login', 'post');

    expect(errorCodes(login, 401)).toEqual([
      AUTH_ERROR_CODE.INVALID_CREDENTIALS,
      AUTH_ERROR_CODE.EMAIL_NOT_CONFIRMED,
    ]);
    expect(errorCodes(login, 400)).toEqual([ERROR_CODE.VALIDATION_ERROR]);
  });

  it('различает протухший токен и отсутствие авторизации', () => {
    // Фронтенду это разные ветки: по TOKEN_EXPIRED токен молча обновляют,
    // по UNAUTHORIZED показывают форму входа.
    const me = operationAt(document, '/api/auth/me', 'get');

    expect(errorCodes(me, 401)).toEqual([
      AUTH_ERROR_CODE.TOKEN_EXPIRED,
      ERROR_CODE.UNAUTHORIZED,
    ]);
  });

  it('показывает Set-Cookie у входа и выхода', () => {
    const login = operationAt(document, '/api/auth/login', 'post');
    const logout = operationAt(document, '/api/auth/logout', 'post');

    // Refresh-токен в теле ответа не появляется — без заголовка в спеке
    // фронтенд не увидит, что эндпоинты вообще трогают cookie.
    expect(login.responses['200']).toHaveProperty('headers.Set-Cookie');
    expect(logout.responses['200']).toHaveProperty('headers.Set-Cookie');
  });

  it('совпадает с закоммиченным openapi.json', async () => {
    // Файл отдают фронтенду для генерации клиента: разъехавшись с кодом, он
    // тихо врёт. `servers` и `info` в сравнение не идут — они зависят от
    // PUBLIC_API_URL и PORT, то есть от машины.
    const committed = JSON.parse(
      await readFile(OPENAPI_PATH, 'utf8'),
    ) as OpenAPIObject;

    expect(committed.paths).toEqual(document.paths);
    expect(committed.components).toEqual(document.components);
  });
});
