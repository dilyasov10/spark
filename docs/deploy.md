# Деплой в Kubernetes

Неймспейс — `sprak-by-ru`, реестр образов — Docker Hub (`alhmdd2405`).

## Что где лежит

| Файл | Назначение |
|---|---|
| `Dockerfile` | Один образ на все три сервиса; какой собрать — решает `--build-arg service` |
| `preparingDeploy.sh` | Собирает `deployment.generated.yaml` из шаблона манифеста |
| `apps/<service>/deployment.yaml` | Шаблон Deployment сервиса (у gateway — ещё и Service) |
| `apps/gateway/ingress.yaml` | Вход снаружи: домен и TLS |
| `apps/<service>/Jenkinsfile` | Пайплайн сервиса, по джобе на каждый |
| `k8s/rabbitmq.yaml` | Брокер, общий для всех сервисов |
| `k8s/Jenkinsfile.bootstrap` | Разовая подготовка окружения отдельной джобой |

Только gateway слушает HTTP. `auth` и `notifications` поднимаются через
`createMicroservice` с транспортом RabbitMQ — у них нет ни Service, ни портов,
ни HTTP-проб, и наружу они не публикуются.

## Разовая подготовка

Порядок важен: сервисы падают на старте, если Secret или брокера ещё нет.

Прямого доступа к кластеру у команды нет — kubeconfig лежит только в Jenkins,
в credential `prod-kubernetes`. Поэтому подготовка проводится джобой
`k8s/Jenkinsfile.bootstrap`, а не руками. Команды `kubectl` ниже приведены для
того, у кого доступ есть, — они делают ровно то же самое.

### 0. Джоба bootstrap

Заводится один раз, тип — Pipeline, Script Path — `k8s/Jenkinsfile.bootstrap`.
Ей нужны два credential:

| ID | Тип | Что внутри |
|---|---|---|
| `prod-kubernetes` | kubeconfig | тот же, что у сервисных джоб |
| `nest-backend-env` | Secret file | обычный `.env` со всеми ключами из таблицы ниже |

Первый прогон запускать со всеми галками выключенными: стадия `Cluster info`
ничего не меняет, а показывает `ingressclass`, наличие cert-manager и текущее
содержимое неймспейса. Из её вывода берутся значения параметров `INGRESS_CLASS`
и `CLUSTER_ISSUER` для следующего запуска.

Дальше — по одной галке за раз, в порядке: `APPLY_NAMESPACE` → `APPLY_SECRET`
→ `APPLY_RABBITMQ` → `APPLY_INGRESS`.

### 1. Неймспейс

```bash
kubectl create namespace sprak-by-ru
```

### 2. Secret

Все три сервиса читают один Secret — `nest-backend-secrets`. В git он не лежит
и через пайплайн сервиса не едет: его кладёт джоба bootstrap из файла в
credential `nest-backend-env`.

Обязательные ключи — те, что читаются через `getOrThrow`/`requireEnv`: без
любого из них под уходит в `CrashLoopBackOff` ещё до первого запроса.

| Ключ | Кому нужен |
|---|---|
| `DATABASE_URL` | Prisma, pooled-эндпоинт Neon (хост с `-pooler`) |
| `RABBITMQ_URL` | всем трём |
| `JWT_ACCESS_SECRET` | gateway (проверка подписи), auth (выпуск) |
| `JWT_ACCESS_EXPIRES_IN` | auth |
| `JWT_REFRESH_SECRET` | auth |
| `JWT_REFRESH_EXPIRES_IN` | auth |
| `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` | notifications |
| `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | из них поднимается сам брокер |
| `CORS_ORIGINS` | gateway — домены фронта через запятую |

`CORS_ORIGINS` формально необязателен, но в кубере его надо задать: при пустом
значении API отражает любой `Origin`, то есть ходить к нему с credentials
сможет произвольный сайт.

Содержимое файла для credential `nest-backend-env` — обычный `.env`, без
кавычек и без `export`; `kubectl --from-env-file` разбирает именно такой
формат:

```dotenv
DATABASE_URL=postgresql://...-pooler.../db?sslmode=require
RABBITMQ_URL=amqp://spark:ПАРОЛЬ@rabbitmq.sprak-by-ru.svc.cluster.local:5672
RABBITMQ_USER=spark
RABBITMQ_PASSWORD=ПАРОЛЬ
JWT_ACCESS_SECRET=...
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRES_IN=7d
MAIL_HOST=smtp.yandex.ru
MAIL_USER=...
MAIL_PASSWORD=...
MAIL_FROM=Spark <noreply@ДОМЕН>
CORS_ORIGINS=https://ДОМЕН-ФРОНТА
```

То же самое напрямую, если доступ к кластеру есть:

```bash
kubectl -n sprak-by-ru create secret generic nest-backend-secrets \
  --from-literal=DATABASE_URL='postgresql://...-pooler.../db?sslmode=require' \
  --from-literal=RABBITMQ_URL='amqp://spark:ПАРОЛЬ@rabbitmq.sprak-by-ru.svc.cluster.local:5672' \
  --from-literal=RABBITMQ_USER='spark' \
  --from-literal=RABBITMQ_PASSWORD='ПАРОЛЬ' \
  --from-literal=JWT_ACCESS_SECRET='...' \
  --from-literal=JWT_ACCESS_EXPIRES_IN='15m' \
  --from-literal=JWT_REFRESH_SECRET='...' \
  --from-literal=JWT_REFRESH_EXPIRES_IN='7d' \
  --from-literal=MAIL_HOST='smtp.yandex.ru' \
  --from-literal=MAIL_USER='...' \
  --from-literal=MAIL_PASSWORD='...' \
  --from-literal=MAIL_FROM='Spark <noreply@ДОМЕН>' \
  --from-literal=CORS_ORIGINS='https://ДОМЕН-ФРОНТА'
```

Пароль в `RABBITMQ_PASSWORD` и в `RABBITMQ_URL` — один и тот же: брокер
поднимается из первого, сервисы подключаются по второму.

### 3. RabbitMQ

```bash
kubectl apply -f k8s/rabbitmq.yaml
kubectl -n sprak-by-ru rollout status deployment/rabbitmq
```

### 4. Ingress

Заменить `API_HOST` в `apps/gateway/ingress.yaml` на купленный домен, затем:

```bash
kubectl apply -f apps/gateway/ingress.yaml
```

A-запись домена должна указывать на внешний адрес ingress-контроллера:

```bash
kubectl get svc -A -l app.kubernetes.io/component=controller
```

### 5. Миграции

Пайплайн их не гоняет — накатываются отдельно, с машины, где есть `DIRECT_URL`
(direct-эндпоинт Neon; через pooler миграции ломаются):

```bash
pnpm db:deploy
```

## Деплой

### Через Jenkins

По джобе на сервис, у каждой свой Script Path — `apps/<service>/Jenkinsfile`.
Джоба обязана иметь:

- **GitHub project** → `https://github.com/dilyasov10/spark/`
- **Build Triggers** → GitHub Pull Request Builder
- credentials `sprak-by-ru` (Docker Hub) и `prod-kubernetes` (kubeconfig)

Деплойные стадии выполняются, когда PR нацелен в `main`. Следствие: деплоится
любой PR в `main`, включая чужой и ещё не отревьюренный.

### Вручную

Путь, который не зависит от Jenkins, — им же удобно раскатывать первую версию:

```bash
SERVICE=gateway
PROJECT=nest-backend-gateway
TAG=$(git rev-parse --short HEAD)

docker build --build-arg service=$SERVICE --build-arg port=4409 \
  -t alhmdd2405/$PROJECT:$TAG -f Dockerfile .
docker push alhmdd2405/$PROJECT:$TAG

# Пишет apps/$SERVICE/deployment.generated.yaml, шаблон не трогает.
./preparingDeploy.sh $SERVICE alhmdd2405 $PROJECT $TAG \
  ${PROJECT}-deployment 4409 sprak-by-ru

kubectl apply -f apps/$SERVICE/deployment.generated.yaml
kubectl -n sprak-by-ru rollout status deployment/${PROJECT}-deployment
```

Для `auth` и `notifications` — то же самое без `--build-arg port` и с `0`
вместо порта в аргументах скрипта.

## Проверка

```bash
kubectl -n sprak-by-ru get pods,svc,ingress
kubectl -n sprak-by-ru logs -l project=nest-backend-gateway --tail=50
curl -i https://ДОМЕН/api
```

Если под перезапускается — причина почти всегда в отсутствующем ключе Secret:

```bash
kubectl -n sprak-by-ru logs <pod> --previous | head -30
```

## Что отдать фронтенду

| | |
|---|---|
| База API | `https://ДОМЕН/api` |
| Swagger UI | `https://ДОМЕН/api/docs` |
| Спека OpenAPI | `https://ДОМЕН/api/docs-json` |

Логин кладёт refresh-токен в httpOnly-cookie с `sameSite=none; secure`, поэтому
запросы с фронта должны идти с `credentials: 'include'`, а домен фронта —
присутствовать в `CORS_ORIGINS`. По http cookie не поедет: `secure` работает
только под TLS.
