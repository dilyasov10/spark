import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * Общий префикс всех HTTP-роутов: контроллер `@Controller('auth')` наружу
 * доступен как `/api/auth/...`.
 */
export const API_PREFIX = 'api';

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
  // Нужен OAuth callback и JWT из cookie: `state` и `accessToken`
  // читаются из `request.cookies`. Без парсера CSRF и /me всегда падают.
  app.use(cookieParser());

  const frontendUrl = process.env.FRONTEND_URL;
  if (frontendUrl) {
    app.enableCors({
      origin: frontendUrl,
      credentials: true,
    });
  }
}
