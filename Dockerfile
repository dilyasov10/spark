# Check out https://hub.docker.com/_/node to select a new base image
#
# Мажор 24 — тот же, что на сборочном агенте: там `nvm use --lts` даёт 24.x, и
# юнит-тесты с e2e гоняются именно на нём. Раньше стояло 20.11, и образ
# расходился с агентом: тесты проходили, а `pnpm install` внутри сборки падал.
#
# Нижние границы, которые нельзя опускать:
#   prisma 7          — 20.19+, 22.12+ или 24.0+, иначе preinstall обрывает
#                       установку с «Please upgrade your Node.js version»;
#   corepack@latest   — ^22.22.2 || ^24.15.0 || >=26, иначе ставится с
#                       предупреждением EBADENGINE.
FROM node:24-alpine

# bcrypt — нативный модуль, и готовых бинарников под musl у него нет: на alpine
# он собирается из исходников, без этих пакетов установка падает на node-gyp.
RUN apk add --no-cache python3 make g++

# pnpm берётся из поля packageManager в package.json.
# Переменная гасит интерактивный вопрос corepack — в CI на нём сборка зависнет.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# corepack из образа старше ключей, которыми подписаны свежие релизы pnpm, и
# падает на `Cannot find matching keyid`. Обновляем до установки зависимостей.
RUN npm install -g corepack@latest && corepack enable

WORKDIR /app

# Манифесты отдельным слоем: пока зависимости не менялись, установка берётся из
# кеша. Прежний `COPY package*.json` не захватывал pnpm-lock.yaml, и сборка шла
# по плавающим версиям.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Клиент Prisma лежит в libs/prisma/src/generated и в git не коммитится — без
# генерации сборка падает на несуществующем импорте.
# `prisma generate` в базу не ходит, но prisma.config.ts требует заданного URL:
# подставляем заглушку, соединение по ней не открывается.
RUN DIRECT_URL="postgresql://build:build@localhost:5432/build" pnpm db:generate

# Собираются все три приложения монорепы: образ один на всех, а какое из них
# запускать — решает `command` в манифесте деплоя. Три отдельных образа
# отличались бы только точкой входа, зато тянули бы три сборки и три пуша.
RUN pnpm build

# NODE_ENV выставляется только сейчас: будь он production до установки, pnpm
# пропустил бы devDependencies, и сборка осталась бы без @nestjs/cli.
ENV NODE_ENV=production
ENV PORT=4401

EXPOSE ${PORT}

# runAsNonRoot в deployment.yaml требует непривилегированного пользователя;
# `node` в этом образе — uid 1000, как и runAsUser в манифесте.
USER node

# Не `pnpm start`: это `nest start`, дев-команда — она пересобирала бы проект
# при каждом старте контейнера и тянула бы devDependencies в рантайм.
#
# По умолчанию поднимается gateway — единственное приложение с HTTP-портом.
# Микросервисы запускаются тем же образом с другим `command`:
#   node dist/apps/auth/main
#   node dist/apps/notifications/main
CMD ["node", "dist/apps/gateway/main"]
