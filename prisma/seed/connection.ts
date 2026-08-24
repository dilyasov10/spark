/**
 * Сид, как и Prisma CLI, ходит по direct-эндпоинту Neon: массовые upsert'ы
 * в одной транзакции через pooler рвутся.
 */
export function resolveConnectionString(): string {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Не задан ни DIRECT_URL, ни DATABASE_URL — заполните .env по образцу .env.example.',
    );
  }

  return connectionString;
}

/** Хост и имя базы без учётных данных — чтобы было видно, куда пишем. */
export function describeTarget(connectionString: string): string {
  try {
    const { host, pathname } = new URL(connectionString);
    return `${host}${pathname}`;
  } catch {
    return 'нераспознанный connection string';
  }
}
