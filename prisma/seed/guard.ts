/**
 * Сид пишет в базу фиктивные данные, поэтому он обязан оставаться локальным
 * инструментом. Флага-обхода намеренно нет: если окружение выглядит как
 * продакшн, скрипт падает до открытия соединения.
 */

interface ProductionMarker {
  readonly reason: string;
  readonly isPresent: () => boolean;
}

const PRODUCTION_MARKERS: readonly ProductionMarker[] = [
  {
    reason: 'NODE_ENV=production',
    isPresent: () => process.env.NODE_ENV === 'production',
  },
  {
    reason: 'VERCEL_ENV=production',
    isPresent: () => process.env.VERCEL_ENV === 'production',
  },
  {
    reason: 'RAILWAY_ENVIRONMENT=production',
    isPresent: () => process.env.RAILWAY_ENVIRONMENT === 'production',
  },
  {
    reason: 'RENDER — окружение Render',
    isPresent: () => Boolean(process.env.RENDER),
  },
  {
    reason: 'FLY_APP_NAME — окружение Fly.io',
    isPresent: () => Boolean(process.env.FLY_APP_NAME),
  },
];

export function assertLocalEnvironment(): void {
  const detected = PRODUCTION_MARKERS.filter((marker) =>
    marker.isPresent(),
  ).map((marker) => marker.reason);

  if (detected.length === 0) {
    return;
  }

  throw new Error(
    `Сид данных запрещён вне локального окружения. Признаки продакшна: ${detected.join(', ')}.`,
  );
}
