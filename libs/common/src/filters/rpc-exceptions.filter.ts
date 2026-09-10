import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { inspect } from 'node:util';
import { isServerError } from '../errors/error-code';
import { toRpcErrorPayload } from '../messaging/rpc-error';

/**
 * Микросервисный аналог `AllExceptionsFilter`: приводит любое исключение
 * обработчика к `RpcErrorPayload`, из которого gateway соберёт ответ по
 * контракту.
 *
 * Без него Nest отдаёт клиенту свой формат (`{ status: 'error', message }`),
 * и `code` доменной ошибки теряется по дороге.
 */
@Catch()
export class RpcExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): Observable<never> {
    const payload = toRpcErrorPayload(exception);

    // 5xx уходит вызывающему обезличенной, поэтому подробности имеет смысл
    // писать только здесь — дальше их уже не будет.
    if (isServerError(payload.status)) {
      this.logger.error(
        `Паттерн ${describePattern(host)}`,
        exception instanceof Error ? exception.stack : inspect(exception),
      );
    }

    return throwError(() => payload);
  }
}

function describePattern(host: ArgumentsHost): string {
  // Не `RmqContext`: фильтр общий для всех транспортов, а `getPattern` есть
  // не у каждого из них.
  const context = host
    .switchToRpc()
    .getContext<{ getPattern?: () => unknown } | undefined>();
  const pattern = context?.getPattern?.();

  return typeof pattern === 'string' ? pattern : 'неизвестен';
}
