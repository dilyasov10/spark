import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { ErrorDetailDto } from '../dto/api-error.dto';
import { AppException } from '../errors/app.exception';
import { ERROR_CODE } from '../errors/error-code';

const VALIDATION_MESSAGE = 'Проверьте правильность заполнения полей';

/**
 * Разворачивает дерево ошибок class-validator в плоский список `{ field, message }`.
 * Вложенные объекты получают путь через точку: `address.city`.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ErrorDetailDto[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const ownDetails = Object.values(error.constraints ?? {}).map(
      (message) => ({
        field,
        message,
      }),
    );

    return [
      ...ownDetails,
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}

/**
 * Глобальный ValidationPipe: невалидное тело запроса превращается в `400`
 * с телом `{ code: 'VALIDATION_ERROR', message, details: [{ field, message }] }`.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) =>
      new AppException({
        code: ERROR_CODE.VALIDATION_ERROR,
        message: VALIDATION_MESSAGE,
        status: HttpStatus.BAD_REQUEST,
        details: flattenValidationErrors(errors),
      }),
  });
}
