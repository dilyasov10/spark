# Один образ на все три сервиса: содержимое сборки у них общее, различается
# только точка входа. Какой сервис запускать — решает build-arg `service`, его
# прокидывает Jenkinsfile каждого приложения.
#
# Мажор 24 — тот же, что на сборочном агенте: там `nvm use --lts` даёт 24.x, и
# юнит-тесты с e2e гоняются именно на нём. Раньше стояло 20.11, и образ
# расходился с агентом: тесты проходили, а установка внутри сборки падала.
#
# Нижние границы, которые нельзя опускать:
#   prisma 7          — 20.19+, 22.12+ или 24.0+, иначе preinstall обрывает
#                       установку с «Please upgrade your Node.js version»;
#   corepack@latest   — ^22.22.2 || ^24.15.0 || >=26, иначе ставится с
#                       предупреждением EBADENGINE.
FROM node:24-alpine

ARG service
# Значение по умолчанию нужно auth и notifications: они HTTP не слушают и порт
# не получают, а `EXPOSE` с пустой строкой обрывает сборку.
ARG port=3000

ENV SERVICE=$service
ENV PORT=$port

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

# Клиент Prisma генерируется в libs/prisma/src/generated и в git не коммитится —
# без генерации сборка падает на несуществующем импорте. `prisma generate` в базу
# не ходит, но prisma.config.ts требует заданного URL: подставляем заглушку,
# соединение по ней не открывается.
RUN DIRECT_URL="postgresql://build:build@localhost:5432/build" pnpm db:generate

# Собираем только нужный сервис: три сборки на образ — это втрое дольше ради
# артефактов, которые в этом контейнере не запустятся.
RUN pnpm build:${SERVICE}

# NODE_ENV выставляется только сейчас: будь он production до установки, pnpm
# пропустил бы devDependencies, и сборка осталась бы без @nestjs/cli.
ENV NODE_ENV=production

EXPOSE ${PORT}

# runAsNonRoot в манифестах требует непривилегированного пользователя;
# `node` в этом образе — uid 1000, как и runAsUser в deployment.yaml.
USER node

# Не `pnpm start` — это `nest start`, дев-команда: она пересобирала бы проект при
# каждом старте контейнера и тянула devDependencies в рантайм.
#
# Форма с `sh -c` вынужденная: путь зависит от $SERVICE, а exec-форма переменные
# не разворачивает. `exec` отдаёт node первый pid — иначе SIGTERM от кубера
# придёт в sh, node его не увидит, и под будет убит по таймауту вместо
# штатного завершения.
CMD ["sh", "-c", "exec node dist/apps/$SERVICE/main"]
