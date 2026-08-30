import { HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrorDto } from '../dto/api-error.dto';

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
 * Описывает ошибочные ответы эндпоинта общей схемой `ApiErrorDto`
 * (CLAUDE.md, правило 7).
 *
 * ```ts
 * @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
 * ```
 *
 * Без аргументов описывает все статусы контракта: 400, 401, 403, 404, 500.
 */
export function ApiErrorResponses(
  ...statuses: HttpStatus[]
): ReturnType<typeof applyDecorators> {
  const applied = statuses.length > 0 ? statuses : ALL_ERROR_STATUSES;

  return applyDecorators(
    ...applied.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTION_BY_STATUS[status],
        type: ApiErrorDto,
      }),
    ),
  );
}
