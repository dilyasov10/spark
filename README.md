<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Архитектура

Монорепа Nest: три приложения в `apps/` и общий код в `libs/`.

| Приложение | Что делает | Транспорт |
|---|---|---|
| `apps/gateway` | Единственный HTTP-вход: роуты, валидация, Swagger, cookie | HTTP + клиент RabbitMQ |
| `apps/auth` | Проверка пароля, выпуск токенов, чтение пользователей из БД | слушает очередь `auth_queue` |
| `apps/notifications` | Отправка писем через SMTP | слушает очередь `notifications_queue` |

| Библиотека | Что внутри |
|---|---|
| `libs/common` (`@app/common`) | Контракт ошибок, валидация, Swagger, контракты сообщений, обвязка RabbitMQ |
| `libs/prisma` (`@app/prisma`) | `PrismaService` и сгенерированный клиент |

В базу ходит только `auth`, наружу торчит только `gateway`. Между ними — RabbitMQ:
запрос-ответ (`ClientProxy.send`), а не события, потому что HTTP-ответ клиенту всё равно
нужно дождаться.

Доменные ошибки переживают дорогу через брокер: в микросервисе `RpcExceptionsFilter`
превращает `AppException` в payload с `code`, `message` и статусом, а в gateway
`fromRpcError` собирает его обратно — фронтенд получает обычное тело ошибки из
контракта (CLAUDE.md, правило 5). Всё, что не доменная ошибка — таймаут, обрыв связи, —
становится обезличенной 500.

## Project setup

```bash
$ pnpm install
```

Кроме Postgres, для запуска нужен RabbitMQ. Локально проще всего контейнером:

```bash
$ docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:4-management
```

Адрес брокера и имена очередей — в `.env` (см. `.env.example`).

## База данных

Postgres на Neon через Prisma 7. Скопируйте `.env.example` в `.env` и заполните оба URL:
`DATABASE_URL` — pooled-эндпоинт (по нему ходит приложение), `DIRECT_URL` — direct-эндпоинт
(по нему ходят Prisma CLI и сид; миграции через pooler ломаются).

```bash
# сгенерировать клиент (после pnpm install и после любой правки схемы)
$ pnpm db:generate

# применить миграции
$ pnpm db:migrate

# наполнить базу тестовыми данными
$ pnpm db:seed

# просмотреть данные в браузере
$ pnpm db:studio
```

### Тестовые данные

`pnpm db:seed` разворачивает 8 пользователей и 20 постов (17 опубликованных и 3 черновика),
каждый пост связан с автором через `Post.authorId`. Пароль у всех фиктивных аккаунтов
одинаковый — `Password123!`.

Скрипт **идемпотентен**: идентификаторы записей зафиксированы в
[prisma/seed/users.ts](prisma/seed/users.ts) и [prisma/seed/posts.ts](prisma/seed/posts.ts),
запись идёт через `upsert` в одной транзакции. Повторный запуск обновляет те же строки —
дубликатов не появляется, счётчики остаются 8 и 20.

Скрипт **не запускается на продакшне**: перед подключением к базе он проверяет окружение
и падает с ошибкой, если видит `NODE_ENV=production`, `VERCEL_ENV=production`,
`RAILWAY_ENVIRONMENT=production`, `RENDER` или `FLY_APP_NAME`. Флага-обхода нет.

```bash
$ NODE_ENV=production pnpm db:seed
Сид данных не выполнен: Сид данных запрещён вне локального окружения. Признаки продакшна: NODE_ENV=production.
```

## Compile and run the project

Приложений три, и запускать их надо все — gateway без микросервисов ответит 500 по
таймауту. Каждой команде нужен свой терминал.

```bash
# watch mode: gateway, auth, notifications
$ pnpm start:dev
$ pnpm start:dev:auth
$ pnpm start:dev:notifications
```

```bash
# сборка всех трёх приложений в dist/apps/<app>/main.js
$ pnpm build

# production mode
$ pnpm start:prod
$ pnpm start:prod:auth
$ pnpm start:prod:notifications
```

Собрать что-то одно: `pnpm build:gateway`, `pnpm build:auth`, `pnpm build:notifications`.

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
