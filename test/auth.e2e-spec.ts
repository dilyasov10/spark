import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  BCRYPT_ROUNDS,
  REFRESH_TOKEN_COOKIE,
} from '../src/auth/auth.constants';
import { AUTH_ERROR_CODE } from '../src/auth/auth.error-code';
import { setupApp } from '../src/common/bootstrap/setup-app';
import { ApiErrorDto } from '../src/common/dto/api-error.dto';
import { ERROR_CODE } from '../src/common/errors/error-code';
import { EmailService } from '../src/auth/mailler/email.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Секреты общие для всех e2e-спек и выставляются в test/setup-e2e.ts.

const PASSWORD = 'Password123!';
const CREATED_AT = '2026-01-17T08:42:00.000Z';

const USER = {
  id: '3f8c1a94-2e7b-4d61-9c0a-5b1e2d4a7f01',
  username: 'anna_kovaleva',
  email: 'anna.kovaleva@gmail.com',
  firstName: 'Анна',
  lastName: 'Ковалёва',
  createdAt: new Date(CREATED_AT),
};

interface FindUniqueArgs {
  where: { id?: string; email?: string };
}

/** Заголовок `Set-Cookie` с refresh-токеном или падение с внятным текстом. */
function refreshCookieHeader(response: request.Response): string {
  const cookies = (response.headers['set-cookie'] ?? []) as unknown as string[];
  const cookie = cookies.find((item) =>
    item.startsWith(`${REFRESH_TOKEN_COOKIE}=`),
  );

  if (cookie === undefined) {
    throw new Error(`В ответе нет cookie ${REFRESH_TOKEN_COOKIE}`);
  }

  return cookie;
}

/**
 * Атрибуты, по которым браузер решает, та же это cookie или другая. Срок
 * жизни в них не входит — им выдача и гашение как раз и отличаются.
 */
function cookieIdentity(cookie: string): string[] {
  return cookie
    .split('; ')
    .slice(1)
    .filter((attribute) => !/^(Max-Age|Expires)=/i.test(attribute))
    .sort();
}

describe('Авторизация (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);

    // Живая БД не нужна: подменяем только PrismaService, а глобальные пайп
    // и фильтр остаются настоящими — их поведение и проверяем.
    const findUnique = jest.fn((args: FindUniqueArgs) => {
      if (args.where.email !== undefined) {
        // Поиск по email — это логин: он читает всю строку, включая
        // passwordHash и isConfirmed. Профиль ниже идёт по id с узким select,
        // где этих полей нет, поэтому в USER их и не держим.
        return Promise.resolve(
          args.where.email === USER.email
            ? { ...USER, passwordHash, isConfirmed: true }
            : null,
        );
      }

      return Promise.resolve(args.where.id === USER.id ? USER : null);
    });

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ user: { findUnique } })
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(password: string = PASSWORD): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: USER.email, password })
      .expect(HttpStatus.OK);

    return (response.body as { accessToken: string }).accessToken;
  }

  describe('POST /api/auth/login', () => {
    it('отвечает 200, а не 201, и отдаёт accessToken', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: USER.email, password: PASSWORD })
        .expect(HttpStatus.OK);

      // Assert
      const body = response.body as { accessToken: string };
      expect(typeof body.accessToken).toBe('string');
      expect(body.accessToken.length).toBeGreaterThan(0);
    });

    it('кладёт refresh-токен в httpOnly-cookie, а не в тело ответа', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: USER.email, password: PASSWORD })
        .expect(HttpStatus.OK);

      // Assert
      const cookies = response.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies.find((cookie) =>
        cookie.startsWith('refreshToken='),
      );

      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('Path=/api/auth');
      expect(Object.keys(response.body as object)).toEqual(['accessToken']);
    });

    it('не отдаёт passwordHash ни в каком виде', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: USER.email, password: PASSWORD })
        .expect(HttpStatus.OK);

      // Assert
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain('$2b$');
    });

    it('отвечает 401 с кодом INVALID_CREDENTIALS на неверный пароль', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: USER.email, password: 'WrongPassword1!' })
        .expect(HttpStatus.UNAUTHORIZED);

      // Assert
      const body = response.body as ApiErrorDto;
      expect(body.code).toBe(AUTH_ERROR_CODE.INVALID_CREDENTIALS);
      expect(body).not.toHaveProperty('statusCode');
    });

    it('не раскрывает, зарегистрирован ли email: оба отказа отвечают одинаково', async () => {
      // Arrange
      // Act
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: USER.email, password: 'WrongPassword1!' })
        .expect(HttpStatus.UNAUTHORIZED);

      const unknownEmail = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(HttpStatus.UNAUTHORIZED);

      // Assert
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('отвечает 400 с деталями по полям на невалидное тело', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      const body = response.body as ApiErrorDto;
      expect(body.code).toBe(ERROR_CODE.VALIDATION_ERROR);
      expect(body.details?.map((detail) => detail.field)).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });

    it('отвечает 400 на лишнее поле в теле запроса', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: USER.email, password: PASSWORD, role: 'admin' })
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(
        ERROR_CODE.VALIDATION_ERROR,
      );
    });
  });

  describe('POST /api/auth/logout', () => {
    it('отвечает 200, а не 201, и подтверждает выход', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body).toEqual({ success: true });
    });

    it('гасит cookie: пустое значение и дата истечения в прошлом', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .expect(HttpStatus.OK);

      // Assert
      const cookie = refreshCookieHeader(response);
      expect(cookie).toMatch(new RegExp(`^${REFRESH_TOKEN_COOKIE}=;`));
      expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
      // Срок жизни перебил бы дату истечения и продлил cookie.
      expect(cookie).not.toContain('Max-Age');
    });

    it('гасит cookie теми же атрибутами, с какими выдал её при входе', async () => {
      // Arrange: с другим Path или SameSite браузер счёл бы cookie чужой
      // и оставил бы refresh-токен жить после выхода.
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: USER.email, password: PASSWORD })
        .expect(HttpStatus.OK);

      // Act
      const logoutResponse = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .expect(HttpStatus.OK);

      // Assert
      expect(cookieIdentity(refreshCookieHeader(logoutResponse))).toEqual(
        cookieIdentity(refreshCookieHeader(loginResponse)),
      );
    });

    it('не требует access-токена: выйти можно и с протухшей сессией', async () => {
      // Arrange: гарда ответила бы на такой заголовок 401, и пользователь
      // остался бы с живой cookie.
      const forgedToken =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.not-a-signature';

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${forgedToken}`)
        .expect(HttpStatus.OK);

      // Assert
      expect(response.body).toEqual({ success: true });
    });
  });

  describe('GET /api/auth/me', () => {
    it('отдаёт профиль по валидному токену', async () => {
      // Arrange
      const accessToken = await login();

      // Act
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Assert: id — UUID-строка, createdAt — ISO 8601 в UTC.
      expect(response.body).toEqual({
        id: USER.id,
        username: USER.username,
        email: USER.email,
        firstName: USER.firstName,
        lastName: USER.lastName,
        createdAt: CREATED_AT,
      });
    });

    it('отвечает 401 по-русски, когда токена нет', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(HttpStatus.UNAUTHORIZED);

      // Assert
      const body = response.body as ApiErrorDto;
      expect(body.code).toBe(ERROR_CODE.UNAUTHORIZED);
      expect(body.message).toBe('Необходимо войти в аккаунт');
      // Английский текст Passport наружу не уходит.
      expect(body.message).not.toBe('Unauthorized');
    });

    it('отвечает 401 на токен с чужой подписью', async () => {
      // Arrange
      const forgedToken =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.not-a-signature';

      // Act
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`)
        .expect(HttpStatus.UNAUTHORIZED);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(ERROR_CODE.UNAUTHORIZED);
    });
  });
});

describe('Регистрация (e2e)', () => {
  let app: INestApplication<App>;
  let findUnique: jest.Mock;
  let userDelete: jest.Mock;
  let userCreate: jest.Mock;
  let emailConfirmationFindUnique: jest.Mock;
  let emailConfirmationDelete: jest.Mock;
  let emailConfirmationUpsert: jest.Mock;
  let userUpdate: jest.Mock;
  let transaction: jest.Mock;
  let sendRegistrationConfirmation: jest.Mock;

  const VALID_BODY = {
    username: 'test_user',
    email: 'new.user@example.com',
    password: PASSWORD,
    passwordConfirmation: PASSWORD,
    firstName: 'Тест',
    lastName: 'Юзер',
  };

  const CONFIRMATION_CODE = '0f8fad5b-d9cb-469f-a165-70867728950e';

  beforeAll(async () => {
    findUnique = jest.fn().mockResolvedValue(null);
    userDelete = jest.fn().mockResolvedValue(undefined);
    userCreate = jest.fn().mockResolvedValue({
      id: USER.id,
      email: VALID_BODY.email,
    });
    emailConfirmationFindUnique = jest.fn();
    emailConfirmationDelete = jest.fn().mockResolvedValue(undefined);
    emailConfirmationUpsert = jest.fn().mockResolvedValue(undefined);
    userUpdate = jest.fn().mockResolvedValue(undefined);
    transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
    sendRegistrationConfirmation = jest.fn().mockResolvedValue(undefined);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique,
          delete: userDelete,
          create: userCreate,
          update: userUpdate,
        },
        emailConfirmation: {
          findUnique: emailConfirmationFindUnique,
          delete: emailConfirmationDelete,
          upsert: emailConfirmationUpsert,
        },
        $transaction: transaction,
      })
      .overrideProvider(EmailService)
      .useValue({ sendRegistrationConfirmation })
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue(null);
    userDelete.mockClear();
    userCreate.mockClear().mockResolvedValue({
      id: USER.id,
      email: VALID_BODY.email,
    });
    emailConfirmationFindUnique.mockReset();
    emailConfirmationDelete.mockClear();
    emailConfirmationUpsert.mockClear();
    userUpdate.mockClear();
    transaction
      .mockClear()
      .mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    sendRegistrationConfirmation.mockClear().mockResolvedValue(undefined);
  });

  describe('POST /api/auth/registration', () => {
    it('отвечает 204 и создаёт пользователя без тела ответа', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/registration')
        .send(VALID_BODY)
        .expect(HttpStatus.NO_CONTENT);

      // Assert
      expect(response.body).toEqual({});
      expect(userCreate).toHaveBeenCalledTimes(1);
      expect(sendRegistrationConfirmation).toHaveBeenCalledTimes(1);
    });

    it('отвечает 400 с EMAIL_ALREADY_EXISTS на подтверждённый email', async () => {
      // Arrange
      findUnique
        .mockResolvedValueOnce({
          id: USER.id,
          email: VALID_BODY.email,
          isConfirmed: true,
        })
        .mockResolvedValueOnce(null);

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/registration')
        .send(VALID_BODY)
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      const body = response.body as ApiErrorDto;
      expect(body.code).toBe(AUTH_ERROR_CODE.EMAIL_ALREADY_EXISTS);
      expect(body).not.toHaveProperty('statusCode');
      expect(userCreate).not.toHaveBeenCalled();
    });

    it('отвечает 400 с деталями по полям на невалидное тело', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/registration')
        .send({
          username: 'ab',
          email: 'not-an-email',
          password: 'short',
          passwordConfirmation: 'other',
          firstName: '',
          lastName: '',
        })
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      const body = response.body as ApiErrorDto;
      expect(body.code).toBe(ERROR_CODE.VALIDATION_ERROR);
      expect(body.details?.map((detail) => detail.field)).toEqual(
        expect.arrayContaining(['username', 'email', 'password']),
      );
    });
  });

  describe('POST /api/auth/registration-confirmation', () => {
    it('отвечает 204 при валидном коде', async () => {
      // Arrange
      emailConfirmationFindUnique.mockResolvedValue({
        id: 'confirmation-id',
        userId: USER.id,
        code: CONFIRMATION_CODE,
        expiresAt: new Date(Date.now() + 60_000),
      });

      // Act
      await request(app.getHttpServer())
        .post('/api/auth/registration-confirmation')
        .send({ code: CONFIRMATION_CODE })
        .expect(HttpStatus.NO_CONTENT);

      // Assert
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: { isConfirmed: true },
      });
    });

    it('отвечает 400 с CONFIRMATION_CODE_INVALID на неизвестный код', async () => {
      // Arrange
      emailConfirmationFindUnique.mockResolvedValue(null);

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/registration-confirmation')
        .send({ code: CONFIRMATION_CODE })
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(
        AUTH_ERROR_CODE.CONFIRMATION_CODE_INVALID,
      );
    });

    it('отвечает 400 с CONFIRMATION_CODE_EXPIRED на просроченный код', async () => {
      // Arrange
      emailConfirmationFindUnique.mockResolvedValue({
        id: 'confirmation-id',
        userId: USER.id,
        code: CONFIRMATION_CODE,
        expiresAt: new Date(Date.now() - 1_000),
      });

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/registration-confirmation')
        .send({ code: CONFIRMATION_CODE })
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(
        AUTH_ERROR_CODE.CONFIRMATION_CODE_EXPIRED,
      );
    });
  });

  describe('POST /api/auth/registration-email-resending', () => {
    it('отвечает 204 и шлёт письмо неподтверждённому пользователю', async () => {
      // Arrange
      findUnique.mockResolvedValue({
        id: USER.id,
        email: VALID_BODY.email,
        isConfirmed: false,
      });

      // Act
      await request(app.getHttpServer())
        .post('/api/auth/registration-email-resending')
        .send({ email: VALID_BODY.email })
        .expect(HttpStatus.NO_CONTENT);

      // Assert
      expect(emailConfirmationUpsert).toHaveBeenCalledTimes(1);
      expect(sendRegistrationConfirmation).toHaveBeenCalledTimes(1);
    });

    it('отвечает 404 с USER_NOT_FOUND на неизвестный email', async () => {
      // Arrange
      findUnique.mockResolvedValue(null);

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/registration-email-resending')
        .send({ email: 'nobody@example.com' })
        .expect(HttpStatus.NOT_FOUND);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(
        AUTH_ERROR_CODE.USER_NOT_FOUND,
      );
    });

    it('отвечает 400 с EMAIL_ALREADY_CONFIRMED на уже подтверждённый email', async () => {
      // Arrange
      findUnique.mockResolvedValue({
        id: USER.id,
        email: VALID_BODY.email,
        isConfirmed: true,
      });

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/registration-email-resending')
        .send({ email: VALID_BODY.email })
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(
        AUTH_ERROR_CODE.EMAIL_ALREADY_CONFIRMED,
      );
    });
  });
});

describe('Восстановление пароля (e2e)', () => {
  let app: INestApplication<App>;
  let findUnique: jest.Mock;
  let passwordRecoveryFindUnique: jest.Mock;
  let passwordRecoveryUpsert: jest.Mock;
  let passwordRecoveryDelete: jest.Mock;
  let sessionDeleteMany: jest.Mock;
  let userUpdate: jest.Mock;
  let transaction: jest.Mock;
  let sendPasswordRecovery: jest.Mock;

  const RECOVERY_CODE = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const RECAPTCHA_TOKEN = 'e2e-recaptcha-token';
  const NEW_PASSWORD_BODY = {
    newPassword: PASSWORD,
    passwordConfirmation: PASSWORD,
    recoveryCode: RECOVERY_CODE,
  };
  const PASSWORD_RECOVERY_BODY = {
    email: USER.email,
    recaptchaToken: RECAPTCHA_TOKEN,
  };

  beforeAll(async () => {
    findUnique = jest.fn().mockResolvedValue(null);
    passwordRecoveryFindUnique = jest.fn();
    passwordRecoveryUpsert = jest.fn().mockResolvedValue(undefined);
    passwordRecoveryDelete = jest.fn().mockResolvedValue(undefined);
    sessionDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    userUpdate = jest.fn().mockResolvedValue(undefined);
    transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
    sendPasswordRecovery = jest.fn().mockResolvedValue(undefined);

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique,
          update: userUpdate,
        },
        passwordRecovery: {
          findUnique: passwordRecoveryFindUnique,
          upsert: passwordRecoveryUpsert,
          delete: passwordRecoveryDelete,
        },
        session: {
          deleteMany: sessionDeleteMany,
        },
        $transaction: transaction,
      })
      .overrideProvider(EmailService)
      .useValue({ sendPasswordRecovery })
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue(null);
    passwordRecoveryFindUnique.mockReset();
    passwordRecoveryUpsert.mockClear();
    passwordRecoveryDelete.mockClear();
    sessionDeleteMany.mockClear();
    userUpdate.mockClear();
    transaction
      .mockClear()
      .mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    sendPasswordRecovery.mockClear().mockResolvedValue(undefined);
  });

  describe('POST /api/auth/password-recovery', () => {
    it('отвечает 204 и шлёт письмо существующему пользователю', async () => {
      // Arrange
      findUnique.mockResolvedValue({
        id: USER.id,
        email: USER.email,
        isConfirmed: false,
      });

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/password-recovery')
        .send(PASSWORD_RECOVERY_BODY)
        .expect(HttpStatus.NO_CONTENT);

      // Assert
      expect(response.body).toEqual({});
      expect(passwordRecoveryUpsert).toHaveBeenCalledTimes(1);
      expect(sendPasswordRecovery).toHaveBeenCalledTimes(1);
    });

    it('отвечает 404 с USER_NOT_FOUND на неизвестный email', async () => {
      // Arrange
      findUnique.mockResolvedValue(null);

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/password-recovery')
        .send({
          email: 'nobody@example.com',
          recaptchaToken: RECAPTCHA_TOKEN,
        })
        .expect(HttpStatus.NOT_FOUND);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(
        AUTH_ERROR_CODE.USER_NOT_FOUND,
      );
      expect(passwordRecoveryUpsert).not.toHaveBeenCalled();
    });

    it('отвечает 400 с VALIDATION_ERROR на невалидный email', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/password-recovery')
        .send({ email: 'not-an-email', recaptchaToken: RECAPTCHA_TOKEN })
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(
        ERROR_CODE.VALIDATION_ERROR,
      );
    });
  });

  describe('POST /api/auth/new-password', () => {
    it('отвечает 204, обновляет пароль и сбрасывает сессии', async () => {
      // Arrange
      passwordRecoveryFindUnique.mockResolvedValue({
        id: 'recovery-id',
        userId: USER.id,
        code: RECOVERY_CODE,
        expiresAt: new Date(Date.now() + 60_000),
      });

      // Act
      await request(app.getHttpServer())
        .post('/api/auth/new-password')
        .send(NEW_PASSWORD_BODY)
        .expect(HttpStatus.NO_CONTENT);

      // Assert
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: { passwordHash: expect.stringMatching(/^\$2[aby]\$/) },
      });
      expect(passwordRecoveryDelete).toHaveBeenCalledWith({
        where: { id: 'recovery-id' },
      });
      expect(sessionDeleteMany).toHaveBeenCalledWith({
        where: { userId: USER.id },
      });
    });

    it('отвечает 400 с RECOVERY_CODE_INVALID на неизвестный код', async () => {
      // Arrange
      passwordRecoveryFindUnique.mockResolvedValue(null);

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/new-password')
        .send(NEW_PASSWORD_BODY)
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(
        AUTH_ERROR_CODE.RECOVERY_CODE_INVALID,
      );
    });

    it('отвечает 400 с RECOVERY_CODE_EXPIRED на просроченный код', async () => {
      // Arrange
      passwordRecoveryFindUnique.mockResolvedValue({
        id: 'recovery-id',
        userId: USER.id,
        code: RECOVERY_CODE,
        expiresAt: new Date(Date.now() - 1_000),
      });

      // Act
      const response = await request(app.getHttpServer())
        .post('/api/auth/new-password')
        .send(NEW_PASSWORD_BODY)
        .expect(HttpStatus.BAD_REQUEST);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(
        AUTH_ERROR_CODE.RECOVERY_CODE_EXPIRED,
      );
    });
  });
});
