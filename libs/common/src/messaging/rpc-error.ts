import { HttpStatus } from '@nestjs/common';
import type { ErrorDetailDto } from '../dto/api-error.dto';
import { AppException } from '../errors/app.exception';
import { ERROR_CODE, INTERNAL_ERROR_MESSAGE } from '../errors/error-code';

/**
 * Ошибка в том виде, в котором она едет между сервисами.
 *
 * Через RabbitMQ проходит только JSON, поэтому класс исключения по дороге
 * теряется. Везём ровно те поля, из которых gateway потом соберёт ответ по
 * контракту (CLAUDE.md, правило 5), плюс `status` — иначе на HTTP-стороне
 * нечем отличить 401 от 404.
 */
export interface RpcErrorPayload {
  code: string;
  message: string;
  status: number;
  details?: ErrorDetailDto[];
}

/** Признак, по которому клиент отличает наш payload от чужого объекта. */
const RPC_ERROR_MARKER = '__isRpcError';

type MarkedRpcErrorPayload = RpcErrorPayload & { [RPC_ERROR_MARKER]: true };

/**
 * Готовит доменную ошибку к отправке. Всё, что не `AppException`, схлопывается
 * в обезличенную 500: наружу не должны утекать ни стектрейс, ни текст драйвера
 * (CLAUDE.md, правило 6) — подробности остаются в логе микросервиса.
 */
export function toRpcErrorPayload(exception: unknown): MarkedRpcErrorPayload {
  if (exception instanceof AppException) {
    return {
      [RPC_ERROR_MARKER]: true,
      code: exception.code,
      message: exception.message,
      status: exception.getStatus(),
      details: exception.details,
    };
  }

  return {
    [RPC_ERROR_MARKER]: true,
    code: ERROR_CODE.INTERNAL_SERVER_ERROR,
    message: INTERNAL_ERROR_MESSAGE,
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  };
}

function isRpcErrorPayload(value: unknown): value is MarkedRpcErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[RPC_ERROR_MARKER] === true
  );
}

/**
 * Обратное преобразование на стороне gateway: доменная ошибка микросервиса
 * снова становится `AppException` и уходит клиенту с исходными `code`
 * и статусом.
 *
 * Всё остальное — обрыв связи, таймаут, ответ чужого формата — это отказ
 * инфраструктуры, а не домена, и превращается в 500.
 */
export function fromRpcError(error: unknown): AppException {
  if (isRpcErrorPayload(error)) {
    return new AppException({
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    });
  }

  return new AppException({
    code: ERROR_CODE.INTERNAL_SERVER_ERROR,
    message: INTERNAL_ERROR_MESSAGE,
    status: HttpStatus.INTERNAL_SERVER_ERROR,
  });
}
