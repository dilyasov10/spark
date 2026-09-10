/**
 * Чтение окружения до старта Nest.
 *
 * `ConfigService` здесь не годится: транспорт микросервиса нужно собрать ещё
 * до `NestFactory.createMicroservice`, то есть до того, как поднимется DI.
 */

/** Обязательная переменная. Пустая строка считается незаданной. */
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    // Падаем на старте, а не на первом сообщении: сервис без брокера всё
    // равно нерабочий, и лучше узнать об этом из логов запуска.
    throw new Error(`Переменная окружения ${name} не задана`);
  }

  return value;
}

/** Необязательная переменная со значением по умолчанию. */
export function envOrDefault(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
