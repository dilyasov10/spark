import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorDetailDto } from '../dto/api-error.dto';

export interface AppExceptionOptions {
  /** Машинный код, по которому ветвится клиент. UPPER_SNAKE_CASE. */
  code: string;
  /** Текст для пользователя. */
  message: string;
  /** HTTP-статус по смыслу ошибки (CLAUDE.md, правило 6). */
  status?: HttpStatus;
  /** Уточнения по полям запроса. */
  details?: ErrorDetailDto[];
}

/**
 * Ошибка домена с явным `code` и текстом для пользователя.
 *
 * Предпочтительный способ бросать ошибки: встроенные исключения Nest
 * (`NotFoundException` и прочие) несут английские тексты вида `Forbidden
 * resource`, которые уходят пользователю как есть.
 *
 * ```ts
 * throw new AppException({
 *   code: 'EMAIL_ALREADY_EXISTS',
 *   message: 'Пользователь с таким email уже зарегистрирован',
 *   details: [{ field: 'email', message: 'Email уже занят' }],
 * });
 * ```
 */
export class AppException extends HttpException {
  readonly code: string;
  readonly details?: ErrorDetailDto[];

  constructor({
    code,
    message,
    status = HttpStatus.BAD_REQUEST,
    details,
  }: AppExceptionOptions) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
  }
}
