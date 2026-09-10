import type { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, throwError, timeout } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RPC_TIMEOUT_MS } from './rmq.constants';
import { fromRpcError } from './rpc-error';

/**
 * Запрос-ответ к микросервису с таймаутом и разбором ошибки.
 *
 * Ошибку микросервиса возвращает как `AppException` с исходными `code` и
 * статусом — глобальный HTTP-фильтр дальше отдаст её клиенту в обычном формате.
 * Таймаут и обрыв связи становятся обезличенной 500: для клиента это отказ
 * сервера, а не доменная ошибка.
 */
export async function sendRpc<TResult, TPayload = unknown>(
  client: ClientProxy,
  pattern: string,
  payload: TPayload,
): Promise<TResult> {
  return firstValueFrom(
    client.send<TResult, TPayload>(pattern, payload).pipe(
      timeout(RPC_TIMEOUT_MS),
      catchError((error: unknown) => throwError(() => fromRpcError(error))),
    ),
  );
}
