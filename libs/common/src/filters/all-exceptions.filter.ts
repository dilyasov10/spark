import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { inspect } from 'node:util';
import { ApiErrorDto } from '../dto/api-error.dto';
import { AppException } from '../errors/app.exception';
import {
  ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
  errorCodeByStatus,
  errorMessageByStatus,
  isServerError,
} from '../errors/error-code';

/**
 * Приводит любое исключение к единому телу ответа `{ code, message, details }`
 * (CLAUDE.md, правило 5). Формат Nest по умолчанию
 * (`{ statusCode, message, error }`) наружу не уходит.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status = resolveStatus(exception);

    if (isServerError(status)) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : inspect(exception),
      );
    }

    response.status(status).json(buildErrorBody(exception, status));
  }
}

function resolveStatus(exception: unknown): number {
  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

function buildErrorBody(exception: unknown, status: number): ApiErrorDto {
  // 5xx уходит клиенту без подробностей: стектрейс, SQL и тексты драйвера
  // остаются в логе.
  if (isServerError(status)) {
    return {
      code: ERROR_CODE.INTERNAL_SERVER_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    };
  }

  if (exception instanceof AppException) {
    return {
      code: exception.code,
      message: exception.message,
      ...(exception.details ? { details: exception.details } : {}),
    };
  }

  if (exception instanceof HttpException) {
    return {
      code: errorCodeByStatus(status),
      message: extractMessage(exception) ?? errorMessageByStatus(status),
    };
  }

  return {
    code: errorCodeByStatus(status),
    message: errorMessageByStatus(status),
  };
}

/** Текст дефолтного 404 роутера Nest: `Cannot GET /users`. */
const ROUTER_NOT_FOUND_MESSAGE = /^Cannot [A-Z]+ \//;

function extractMessage(exception: HttpException): string | undefined {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return response;
  }

  // Массив сообщений (дефолтный ValidationPipe) игнорируем намеренно:
  // ошибки валидации форматирует createValidationPipe.
  if ('message' in response && typeof response.message === 'string') {
    return ROUTER_NOT_FOUND_MESSAGE.test(response.message)
      ? undefined
      : response.message;
  }

  return undefined;
}
