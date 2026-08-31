import { HttpStatus } from '@nestjs/common';

/**
 * Машинные коды ошибок — часть публичного контракта (CLAUDE.md, правило 5).
 * Фронтенд ветвится по `code`, поэтому переименование ломает клиент так же,
 * как переименование поля: сначала предупреждаем, потом мержим.
 *
 * Здесь лежат только общие коды. Доменные (`EMAIL_ALREADY_EXISTS`,
 * `CONFIRMATION_CODE_EXPIRED`) объявляются рядом со своим модулем.
 */
export const ERROR_CODE = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODE.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODE.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_CODE.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODE.NOT_FOUND,
};

const MESSAGE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Некорректный запрос',
  [HttpStatus.UNAUTHORIZED]: 'Необходимо войти в аккаунт',
  [HttpStatus.FORBIDDEN]: 'Недостаточно прав для этого действия',
  [HttpStatus.NOT_FOUND]: 'Ресурс не найден',
};

export const INTERNAL_ERROR_MESSAGE =
  'Внутренняя ошибка сервера. Попробуйте позже.';

const SERVER_ERROR_MIN_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

/** Ошибка на стороне сервера: наружу уходит без подробностей, детали — в лог. */
export function isServerError(status: number): boolean {
  return status >= SERVER_ERROR_MIN_STATUS;
}

/** Код по умолчанию для исключений, брошенных без явного `code`. */
export function errorCodeByStatus(status: number): ErrorCode {
  return CODE_BY_STATUS[status] ?? ERROR_CODE.INTERNAL_SERVER_ERROR;
}

/** Текст для пользователя, когда исключение брошено без своего сообщения. */
export function errorMessageByStatus(status: number): string {
  return MESSAGE_BY_STATUS[status] ?? INTERNAL_ERROR_MESSAGE;
}
