import { INestApplication } from '@nestjs/common';

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
}
