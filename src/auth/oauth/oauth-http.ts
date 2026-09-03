import { AppException } from '../../common/errors/app.exception';
import { AUTH_ERROR_CODE, AUTH_ERROR_MESSAGE } from '../auth.error-code';

/** Единая ошибка обмена code: фронт видит `OAUTH_FAILED`, без деталей провайдера. */
export function oauthFailed(): AppException {
  return new AppException({
    code: AUTH_ERROR_CODE.OAUTH_FAILED,
    message: AUTH_ERROR_MESSAGE.OAUTH_FAILED,
  });
}

/**
 * GET/POST JSON к OAuth API. Сетевые сбои, не-2xx и битый JSON
 * сворачиваем в `OAUTH_FAILED` — наружу не светим ответ провайдера.
 */
export async function fetchJson(
  url: string | URL,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw oauthFailed();
  }

  if (!response.ok) {
    throw oauthFailed();
  }

  try {
    return await response.json();
  } catch {
    throw oauthFailed();
  }
}
