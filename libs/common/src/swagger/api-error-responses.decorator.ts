import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorDto } from '../dto/api-error.dto';
import {
  ERROR_CODE,
  errorCodeByStatus,
  errorMessageByStatus,
} from '../errors/error-code';
import { VALIDATION_MESSAGE } from '../validation/validation-pipe.factory';

const DESCRIPTION_BY_STATUS: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Невалидный запрос или ошибка валидации',
  [HttpStatus.UNAUTHORIZED]: 'Нет авторизации или токен истёк',
  [HttpStatus.FORBIDDEN]: 'Недостаточно прав для этого действия',
  [HttpStatus.NOT_FOUND]: 'Ресурс не найден',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Внутренняя ошибка сервера',
};

const ALL_ERROR_STATUSES = Object.keys(DESCRIPTION_BY_STATUS).map(
  Number,
) as HttpStatus[];

/**
 * Конкретный вариант ошибки: пара «машинный код — текст, который к нему
 * приходит». Фронтенд ветвится по `code` (CLAUDE.md, правило 5), поэтому в
 * Swagger нужен не абстрактный `string`, а перечень реальных значений.
 */
export interface ApiErrorVariant {
  code: string;
  message: string;
}

/**
 * Статус вместе с кодами, которые эндпоинт на нём возвращает. Голый
 * `HttpStatus` означает «только общий код для этого статуса».
 */
export interface ApiErrorStatusSpec {
  status: HttpStatus;
  codes: readonly ApiErrorVariant[];
}

export type ApiErrorSpec = HttpStatus | ApiErrorStatusSpec;

/**
 * Тело, которое отдаёт глобальный пайп: код всегда `VALIDATION_ERROR`,
 * а разбор по полям лежит в `details`.
 */
const VALIDATION_EXAMPLE: ApiErrorDto = {
  code: ERROR_CODE.VALIDATION_ERROR,
  message: VALIDATION_MESSAGE,
  details: [{ field: 'email', message: 'Некорректный email' }],
};

/**
 * Что вернёт `AllExceptionsFilter`, если исключение брошено без своего кода.
 * Берётся из тех же функций, что работают в рантайме, — пример в документации
 * не может разъехаться с фактическим ответом.
 */
function defaultBody(status: HttpStatus): ApiErrorDto {
  if (status === HttpStatus.BAD_REQUEST) {
    return VALIDATION_EXAMPLE;
  }

  return {
    code: errorCodeByStatus(status),
    message: errorMessageByStatus(status),
  };
}

function normalize(spec: ApiErrorSpec): ApiErrorStatusSpec {
  if (typeof spec === 'number') {
    const { code, message } = defaultBody(spec);

    return { status: spec, codes: [{ code, message }] };
  }

  return spec;
}

function toBody(status: HttpStatus, variant: ApiErrorVariant): ApiErrorDto {
  const base = defaultBody(status);

  // `details` есть только у валидации — подставляем его лишь тому коду,
  // который его действительно отдаёт.
  return base.details && base.code === variant.code
    ? { ...variant, details: base.details }
    : variant;
}

/**
 * Swagger UI показывает варианты выпадающим списком — фронтенд видит все коды
 * эндпоинта, не читая исходники.
 */
function toExamples(
  status: HttpStatus,
  variants: readonly ApiErrorVariant[],
): Record<string, { summary: string; value: ApiErrorDto }> {
  return Object.fromEntries(
    variants.map((variant) => [
      variant.code,
      { summary: variant.code, value: toBody(status, variant) },
    ]),
  );
}

function describe(
  status: HttpStatus,
  variants: readonly ApiErrorVariant[],
): string {
  const base = DESCRIPTION_BY_STATUS[status] ?? 'Ошибка';
  const codes = variants.map(({ code }) => `\`${code}\``).join(', ');

  return `${base}. Коды: ${codes}`;
}

/**
 * Описывает ошибочные ответы эндпоинта общей схемой `ApiErrorDto`
 * (CLAUDE.md, правило 7).
 *
 * ```ts
 * @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
 * ```
 *
 * Доменные коды перечисляются явно — иначе фронтенд не узнает, по чему ему
 * ветвиться:
 *
 * ```ts
 * @ApiErrorResponses({
 *   status: HttpStatus.UNAUTHORIZED,
 *   codes: [{ code: 'INVALID_CREDENTIALS', message: 'Неверный email или пароль' }],
 * })
 * ```
 *
 * Без аргументов описывает все статусы контракта: 400, 401, 403, 404, 500.
 */
export function ApiErrorResponses(
  ...specs: ApiErrorSpec[]
): ReturnType<typeof applyDecorators> {
  const applied = specs.length > 0 ? specs : ALL_ERROR_STATUSES;

  return applyDecorators(
    // Схема нужна в спеке, даже когда на неё ссылается только `$ref`.
    ApiExtraModels(ApiErrorDto),
    ...applied.map(normalize).map(({ status, codes }) =>
      ApiResponse({
        status,
        description: describe(status, codes),
        content: {
          'application/json': {
            schema: { $ref: getSchemaPath(ApiErrorDto) },
            examples: toExamples(status, codes),
          },
        },
      }),
    ),
  );
}
