/**
 * Сборка монорепы: дефолтный конфиг Nest CLI плюс одна правка резолвера.
 *
 * Сгенерированный клиент Prisma импортирует соседние файлы с расширением
 * `.js` (`./internal/prismaNamespace.js`), хотя на диске это `.ts` — так
 * требует ESM-совместимый вывод генератора. Webpack понимает такой импорт
 * буквально, не находит файл и валит сборку любого приложения, которое
 * тянет `@app/prisma`.
 *
 * `extensionAlias` возвращает `.js` обратно на `.ts` — тот же приём, что
 * `experimentalResolver` у ts-node в `prisma/seed/tsconfig.json`.
 */
module.exports = (options) => ({
  ...options,
  resolve: {
    ...options.resolve,
    extensionAlias: {
      ...options.resolve?.extensionAlias,
      '.js': ['.ts', '.js'],
    },
  },
});
