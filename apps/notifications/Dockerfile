# Один образ на сервис. Какой именно собрать — решает build-arg `service`,
# его прокидывает Jenkinsfile. Контекст сборки — корень репозитория (`./`).
#
# node 24: Prisma 7 не ставится на 20.11 (нужно 20.19+/22.12+/24).
FROM node:24-alpine

ARG service
# Значение по умолчанию для сервисов без HTTP-порта (auth/notifications):
# пустой EXPOSE обрывает сборку.
ARG port=3000
ENV SERVICE=$service
ENV PORT=$port

# bcrypt — нативный модуль, под musl бинарников нет: собирается из исходников.
RUN apk add --no-cache python3 make g++

# pnpm берётся из package.json → packageManager. Переменная гасит интерактивный
# вопрос corepack, иначе сборка в CI зависает.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g corepack@latest && corepack enable

WORKDIR /app

# Манифесты отдельным слоем: пока зависимости не менялись — install из кеша.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Клиент Prisma генерируется в libs/prisma/src/generated и в git не коммитится.
# `prisma generate` в базу не ходит, но URL нужен формально — подставляем заглушку.
RUN DIRECT_URL="postgresql://build:build@localhost:5432/build" pnpm db:generate

# Собираем только нужный сервис.
RUN pnpm build:${SERVICE}

ENV NODE_ENV=production
EXPOSE ${PORT}

# runAsNonRoot в манифесте требует непривилегированного пользователя;
# `node` в этом образе — uid 1000, как и runAsUser в deployment.yaml.
USER node

# Форма с sh -c вынужденная: путь зависит от $SERVICE. exec отдаёт node первый
# pid — иначе SIGTERM от кубера уйдёт в sh, а не в node.
CMD ["sh", "-c", "exec node dist/apps/$SERVICE/main"]
