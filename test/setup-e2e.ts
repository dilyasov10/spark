// JWT-секреты выставляются до загрузки тестового файла: `AuthModule` читает их
// через `getOrThrow` на этапе инициализации, то есть в момент импорта
// `AppModule`. Задать их внутри спеки уже поздно.
//
// Значения тестовые и к настоящим секретам отношения не имеют — подписывать
// ими нечего, кроме токенов внутри прогона. Живой `.env` в репозиторий не
// коммитится, поэтому на CI переменных нет, и без этого файла спеки, которые
// поднимают `AppModule`, падают на `Configuration key ... does not exist`.
//
// dotenv не перезаписывает уже выставленные переменные, так что локальный
// `.env` на прогон не влияет — тесты идут на одних и тех же значениях везде.
//
// `DATABASE_URL` сюда намеренно не попадает: `app.e2e-spec.ts` поднимает
// настоящий `PrismaService`, и подключение ему нужно реальное.
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// То же самое для почты: `EmailService` читает креды в конструкторе, то есть
// снова на инициализации `AppModule`. Без них не поднимается всё приложение,
// а не только регистрация. Транспорт nodemailer при создании никуда не ходит —
// соединение открывается только на отправке, которой в спеках нет.
process.env.EMAIL_USER = 'e2e@example.com';
process.env.EMAIL_PASS = 'e2e-email-password';
process.env.FRONTEND_URL = 'http://localhost:3001';

// Google / GitHub OAuth: сервисы читают ключи в момент редиректа/callback,
// но e2e на oauth-роуты тоже ходят — без значений getOrThrow упадёт.
process.env.GOOGLE_CLIENT_ID = 'e2e-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'e2e-google-client-secret';
process.env.GOOGLE_CALLBACK_URL =
  'http://localhost:3000/api/auth/oauth/google/callback';
process.env.GITHUB_CLIENT_ID = 'e2e-github-client-id';
process.env.GITHUB_CLIENT_SECRET = 'e2e-github-client-secret';
process.env.GITHUB_CALLBACK_URL =
  'http://localhost:3000/api/auth/oauth/github/callback';

// reCAPTCHA в e2e не ходим в Google — RecaptchaService при false сразу return.
process.env.RECAPTCHA_ENABLED = 'false';
