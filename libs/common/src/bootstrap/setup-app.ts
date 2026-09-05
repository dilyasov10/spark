import { INestApplication } from '@nestjs/common';

/**
 * Общий префикс всех HTTP-роутов: контроллер `@Controller('auth')` наружу
 * доступен как `/api/auth/...`.
 */
export const API_PREFIX = 'api';

/**
 * Домены, которым браузер разрешит читать ответы API.
 *
 * Список задаётся переменной `CORS_ORIGINS` через запятую:
 * `https://spark.ru,https://staging.spark.ru`.
 *
 * Пустой список означает «отразить Origin запроса» — режим для локальной
 * разработки, когда порт фронта заранее не известен. В кубере переменная
 * обязана быть выставлена: иначе к API с credentials сможет обратиться
 * произвольный сайт.
 */
function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Настройки уровня инстанса приложения — то, что нельзя объявить провайдером
 * в `app.module.ts`, потому что это методы `INestApplication`.
 *
 * Вызывается и из `main.ts`, и из e2e-тестов: иначе тесты поднимали бы
 * приложение с другими путями, чем прод (CLAUDE.md — тот же приём, что с
 * глобальным пайпом и фильтром).
 */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);

  const origins = corsOrigins();

  // Без CORS фронт на отдельном домене не получит ни одного ответа: браузер
  // отсечёт их до того, как код увидит результат.
  //
  // `credentials` обязателен — refresh-токен ездит httpOnly-cookie, а её
  // браузер на кросс-доменный запрос без Access-Control-Allow-Credentials не
  // пришлёт. По той же причине здесь не может быть '*': со credentials браузер
  // отвергает звёздочку, поэтому при пустом списке отражаем Origin запроса.
  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });
}
