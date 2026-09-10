export * from './prisma.module';
export * from './prisma.service';
// Модели и типы клиента переэкспортируются здесь, чтобы приложения не лезли
// в сгенерированный каталог по относительному пути.
export type * from './generated/prisma/models';
