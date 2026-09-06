import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_ROUNDS, OAUTH_PROVIDER_GOOGLE } from './auth.constants';
import { AUTH_ERROR_CODE, AUTH_ERROR_MESSAGE } from './auth.error-code';
import { AuthService } from './auth.service';

// Экспорты bcrypt не переопределяются через spyOn, поэтому оборачиваем модуль
// целиком, сохраняя настоящую реализацию: хеши в тестах должны быть настоящими.
jest.mock('bcrypt', () => {
  const actual = jest.requireActual<typeof import('bcrypt')>('bcrypt');

  return {
    ...actual,
    compare: jest.fn((data: string | Buffer, hash: string): Promise<boolean> =>
      actual.compare(data, hash),
    ),
  };
});

const VALID_PASSWORD = 'Password123!';
const WRONG_PASSWORD = 'WrongPassword1!';
const USER_ID = '3f8c1a94-2e7b-4d61-9c0a-5b1e2d4a7f01';
const EMAIL = 'anna.kovaleva@gmail.com';

/** Возвращает ошибку, которой завершился вызов, вместо того чтобы падать. */
async function captureError(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }

  throw new Error('Ожидалась ошибка, но вызов завершился успешно');
}

describe('AuthService', () => {
  let service: AuthService;
  let findUnique: jest.Mock;
  let userDelete: jest.Mock;
  let userCreate: jest.Mock;
  let emailConfirmationFindUnique: jest.Mock;
  let emailConfirmationDelete: jest.Mock;
  let emailConfirmationUpsert: jest.Mock;
  let passwordRecoveryFindUnique: jest.Mock;
  let passwordRecoveryUpsert: jest.Mock;
  let passwordRecoveryDelete: jest.Mock;
  let sessionDeleteMany: jest.Mock;
  let oAuthProviderFindUnique: jest.Mock;
  let oAuthProviderCreate: jest.Mock;
  let userFindMany: jest.Mock;
  let emailConfirmationDeleteMany: jest.Mock;
  let userUpdate: jest.Mock;
  let transaction: jest.Mock;
  let signAsync: jest.Mock;
  let sendRegistrationConfirmation: jest.Mock;
  let sendPasswordRecovery: jest.Mock;
  let sendOAuthRegistrationNotification: jest.Mock;
  let verifyRecaptcha: jest.Mock;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(VALID_PASSWORD, BCRYPT_ROUNDS);
  });

  beforeEach(() => {
    jest.mocked(bcrypt.compare).mockClear();
    findUnique = jest.fn();
    userDelete = jest.fn().mockResolvedValue(undefined);
    userCreate = jest.fn().mockResolvedValue({
      id: USER_ID,
      email: EMAIL,
    });
    emailConfirmationFindUnique = jest.fn();
    emailConfirmationDelete = jest.fn().mockResolvedValue(undefined);
    emailConfirmationUpsert = jest.fn().mockResolvedValue(undefined);
    passwordRecoveryFindUnique = jest.fn();
    passwordRecoveryUpsert = jest.fn().mockResolvedValue(undefined);
    passwordRecoveryDelete = jest.fn().mockResolvedValue(undefined);
    sessionDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    oAuthProviderFindUnique = jest.fn().mockResolvedValue(null);
    oAuthProviderCreate = jest.fn().mockResolvedValue(undefined);
    userFindMany = jest.fn().mockResolvedValue([]);
    emailConfirmationDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    userUpdate = jest.fn().mockResolvedValue(undefined);
    transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
    signAsync = jest.fn().mockResolvedValue('signed-token');
    sendRegistrationConfirmation = jest.fn().mockResolvedValue(undefined);
    sendPasswordRecovery = jest.fn().mockResolvedValue(undefined);
    sendOAuthRegistrationNotification = jest.fn().mockResolvedValue(undefined);
    verifyRecaptcha = jest.fn().mockResolvedValue(undefined);

    service = new AuthService(
      {
        user: {
          findUnique,
          findMany: userFindMany,
          delete: userDelete,
          create: userCreate,
          update: userUpdate,
        },
        emailConfirmation: {
          findUnique: emailConfirmationFindUnique,
          delete: emailConfirmationDelete,
          deleteMany: emailConfirmationDeleteMany,
          upsert: emailConfirmationUpsert,
        },
        passwordRecovery: {
          findUnique: passwordRecoveryFindUnique,
          upsert: passwordRecoveryUpsert,
          delete: passwordRecoveryDelete,
        },
        session: {
          deleteMany: sessionDeleteMany,
        },
        oAuthProvider: {
          findUnique: oAuthProviderFindUnique,
          create: oAuthProviderCreate,
        },
        $transaction: transaction,
      } as unknown as PrismaService,
      { signAsync } as unknown as JwtService,
      {
        getOrThrow: jest.fn((key: string) => `value-of-${key}`),
      } as unknown as ConfigService,
      {
        sendRegistrationConfirmation,
        sendPasswordRecovery,
        sendOAuthRegistrationNotification,
      } as never,
      { verify: verifyRecaptcha } as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Обычный пользователь с подтверждённым email — успешный вход возможен только для такого. */
  const confirmedUser = () => ({
    id: USER_ID,
    email: EMAIL,
    passwordHash,
    isConfirmed: true,
  });

  const registrationDto = {
    username: 'test_user',
    email: 'new.user@example.com',
    password: VALID_PASSWORD,
    passwordConfirmation: VALID_PASSWORD,
    firstName: 'Тест',
    lastName: 'Юзер',
  };
  it('возвращает пару токенов при верных учётных данных', async () => {
    // Arrange
    findUnique.mockResolvedValue(confirmedUser());

    // Act
    const tokens = await service.login({
      email: EMAIL,
      password: VALID_PASSWORD,
    });

    // Assert
    expect(tokens).toEqual({
      accessToken: 'signed-token',
      refreshToken: 'signed-token',
    });
  });

  it('кладёт в payload только id и email', async () => {
    // Arrange
    findUnique.mockResolvedValue(confirmedUser());

    // Act
    await service.login({ email: EMAIL, password: VALID_PASSWORD });

    // Assert
    expect(signAsync).toHaveBeenCalledWith(
      { sub: USER_ID, email: EMAIL },
      expect.anything(),
    );
    expect(signAsync).toHaveBeenCalledWith({ sub: USER_ID, email: EMAIL });
  });

  it('подписывает refresh-токен отдельным секретом', async () => {
    // Arrange
    findUnique.mockResolvedValue(confirmedUser());

    // Act
    await service.login({ email: EMAIL, password: VALID_PASSWORD });

    // Assert
    expect(signAsync).toHaveBeenCalledWith(expect.anything(), {
      secret: 'value-of-JWT_REFRESH_SECRET',
      expiresIn: 'value-of-JWT_REFRESH_EXPIRES_IN',
    });
  });

  it('кидает INVALID_CREDENTIALS со статусом 401, когда email не найден', async () => {
    // Arrange
    findUnique.mockResolvedValue(null);

    // Act
    const error = await captureError(
      service.login({ email: 'nobody@example.com', password: VALID_PASSWORD }),
    );

    // Assert
    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(AUTH_ERROR_CODE.INVALID_CREDENTIALS);
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(error.message).toBe(AUTH_ERROR_MESSAGE.INVALID_CREDENTIALS);
  });

  it('кидает INVALID_CREDENTIALS со статусом 401, когда пароль неверный', async () => {
    // Arrange
    findUnique.mockResolvedValue(confirmedUser());

    // Act
    const error = await captureError(
      service.login({ email: EMAIL, password: WRONG_PASSWORD }),
    );

    // Assert
    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(AUTH_ERROR_CODE.INVALID_CREDENTIALS);
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('кидает EMAIL_NOT_CONFIRMED со статусом 401, когда email не подтверждён', async () => {
    // Arrange
    findUnique.mockResolvedValue({ ...confirmedUser(), isConfirmed: false });

    // Act
    const error = await captureError(
      service.login({ email: EMAIL, password: VALID_PASSWORD }),
    );

    // Assert
    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(AUTH_ERROR_CODE.EMAIL_NOT_CONFIRMED);
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('не выдаёт EMAIL_NOT_CONFIRMED без верного пароля: неподтверждённый аккаунт не раскрывается', async () => {
    // Arrange
    findUnique.mockResolvedValue({ ...confirmedUser(), isConfirmed: false });

    // Act
    const error = await captureError(
      service.login({ email: EMAIL, password: WRONG_PASSWORD }),
    );

    // Assert
    // Проверка isConfirmed идёт после сверки пароля, поэтому чужой email
    // отвечает так же, как незарегистрированный.
    expect(error.code).toBe(AUTH_ERROR_CODE.INVALID_CREDENTIALS);
  });

  it('не раскрывает, зарегистрирован ли email: ответы на оба отказа совпадают', async () => {
    // Arrange
    findUnique.mockResolvedValueOnce(null);
    findUnique.mockResolvedValueOnce(confirmedUser());

    // Act
    const unknownEmailError = await captureError(
      service.login({ email: 'nobody@example.com', password: VALID_PASSWORD }),
    );
    const wrongPasswordError = await captureError(
      service.login({ email: EMAIL, password: WRONG_PASSWORD }),
    );

    // Assert
    expect(unknownEmailError.getResponse()).toEqual(
      wrongPasswordError.getResponse(),
    );
    expect(unknownEmailError.getStatus()).toBe(wrongPasswordError.getStatus());
    // Указание на поле выдало бы, что именно не сошлось.
    expect(unknownEmailError.details).toBeUndefined();
  });

  it('сравнивает пароль даже когда пользователя нет — защита от тайминг-атаки', async () => {
    // Arrange
    const compare = jest.mocked(bcrypt.compare);
    findUnique.mockResolvedValue(null);

    // Act
    await captureError(
      service.login({ email: 'nobody@example.com', password: VALID_PASSWORD }),
    );

    // Assert
    expect(compare).toHaveBeenCalledTimes(1);
    // Сравнение идёт с настоящим хешем-заглушкой, а не с пустой строкой.
    expect(String(compare.mock.calls[0][1])).toMatch(/^\$2[aby]\$/);
  });

  it('не запрашивает passwordHash для профиля пользователя', async () => {
    // Arrange
    findUnique.mockResolvedValue({ id: USER_ID, email: EMAIL });

    // Act
    await service.findAuthenticatedUser(USER_ID);

    // Assert
    const [[args]] = findUnique.mock.calls as [
      [{ select: Record<string, true> }],
    ];
    expect(args.select).not.toHaveProperty('passwordHash');
    expect(args.select).toMatchObject({
      id: true,
      email: true,
      username: true,
    });
  });

  it('возвращает null, когда аккаунта уже нет', async () => {
    // Arrange
    findUnique.mockResolvedValue(null);

    // Act
    const user = await service.findAuthenticatedUser(USER_ID);

    // Assert
    expect(user).toBeNull();
  });

  describe('registration', () => {
    it('создаёт пользователя с isConfirmed=false и вызывает mailer', async () => {
      // Arrange
      findUnique.mockResolvedValue(null);
      userCreate.mockResolvedValue({
        id: USER_ID,
        email: registrationDto.email,
      });

      // Act
      await service.registration(registrationDto);

      // Assert
      const [[createArgs]] = userCreate.mock.calls as [
        [{ data: { isConfirmed: boolean; passwordHash: string } }],
      ];
      expect(createArgs.data.isConfirmed).toBe(false);
      expect(createArgs.data.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(sendRegistrationConfirmation).toHaveBeenCalledTimes(1);
      expect(sendRegistrationConfirmation).toHaveBeenCalledWith(
        registrationDto.email,
        expect.stringMatching(
          /^value-of-FRONTEND_URL\/auth\/registration-confirmation\?code=[0-9a-f-]{36}$/,
        ),
      );
      expect(userDelete).not.toHaveBeenCalled();
    });

    it('кидает EMAIL_ALREADY_EXISTS, если email уже подтверждён', async () => {
      // Arrange
      findUnique
        .mockResolvedValueOnce({
          id: USER_ID,
          email: registrationDto.email,
          isConfirmed: true,
        })
        .mockResolvedValueOnce(null);

      // Act
      const error = await captureError(service.registration(registrationDto));

      // Assert
      expect(error.code).toBe(AUTH_ERROR_CODE.EMAIL_ALREADY_EXISTS);
      expect(error.message).toBe(AUTH_ERROR_MESSAGE.EMAIL_ALREADY_EXISTS);
      expect(userCreate).not.toHaveBeenCalled();
      expect(sendRegistrationConfirmation).not.toHaveBeenCalled();
    });

    it('кидает USERNAME_ALREADY_EXISTS, если username уже подтверждён', async () => {
      // Arrange
      findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'other-id',
        username: registrationDto.username,
        isConfirmed: true,
      });

      // Act
      const error = await captureError(service.registration(registrationDto));

      // Assert
      expect(error.code).toBe(AUTH_ERROR_CODE.USERNAME_ALREADY_EXISTS);
      expect(userCreate).not.toHaveBeenCalled();
    });

    it('удаляет неподтверждённого пользователя с тем же email и создаёт заново', async () => {
      // Arrange
      const oldId = 'old-unconfirmed-id';
      findUnique
        .mockResolvedValueOnce({
          id: oldId,
          email: registrationDto.email,
          isConfirmed: false,
        })
        .mockResolvedValueOnce(null);
      userCreate.mockResolvedValue({
        id: USER_ID,
        email: registrationDto.email,
      });

      // Act
      await service.registration(registrationDto);

      // Assert
      expect(userDelete).toHaveBeenCalledWith({ where: { id: oldId } });
      expect(userCreate).toHaveBeenCalledTimes(1);
      expect(sendRegistrationConfirmation).toHaveBeenCalledTimes(1);
    });
  });

  describe('registrationConfirmation', () => {
    const CODE = '0f8fad5b-d9cb-469f-a165-70867728950e';

    it('ставит isConfirmed=true и удаляет код', async () => {
      // Arrange
      emailConfirmationFindUnique.mockResolvedValue({
        id: 'confirmation-id',
        userId: USER_ID,
        code: CODE,
        expiresAt: new Date(Date.now() + 60_000),
      });

      // Act
      await service.registrationConfirmation({ code: CODE });

      // Assert
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { isConfirmed: true },
      });
      expect(emailConfirmationDelete).toHaveBeenCalledWith({
        where: { id: 'confirmation-id' },
      });
    });

    it('кидает CONFIRMATION_CODE_INVALID, если кода нет', async () => {
      // Arrange
      emailConfirmationFindUnique.mockResolvedValue(null);

      // Act
      const error = await captureError(
        service.registrationConfirmation({ code: CODE }),
      );

      // Assert
      expect(error.code).toBe(AUTH_ERROR_CODE.CONFIRMATION_CODE_INVALID);
      expect(error.message).toBe(AUTH_ERROR_MESSAGE.CONFIRMATION_CODE_INVALID);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('кидает CONFIRMATION_CODE_EXPIRED, если TTL вышел', async () => {
      // Arrange
      emailConfirmationFindUnique.mockResolvedValue({
        id: 'confirmation-id',
        userId: USER_ID,
        code: CODE,
        expiresAt: new Date(Date.now() - 1_000),
      });

      // Act
      const error = await captureError(
        service.registrationConfirmation({ code: CODE }),
      );

      // Assert
      expect(error.code).toBe(AUTH_ERROR_CODE.CONFIRMATION_CODE_EXPIRED);
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('registrationEmailResending', () => {
    it('генерирует новый код и шлёт письмо неподтверждённому пользователю', async () => {
      // Arrange
      findUnique.mockResolvedValue({
        id: USER_ID,
        email: EMAIL,
        isConfirmed: false,
        emailConfirmation: { id: 'old', code: 'old-code' },
      });

      // Act
      await service.registrationEmailResending({ email: EMAIL });

      // Assert
      expect(emailConfirmationUpsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        create: expect.objectContaining({
          userId: USER_ID,
          code: expect.any(String),
          expiresAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          code: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
      expect(sendRegistrationConfirmation).toHaveBeenCalledWith(
        EMAIL,
        expect.stringContaining('registration-confirmation?code='),
      );
    });

    it('кидает USER_NOT_FOUND со статусом 404, если email неизвестен', async () => {
      // Arrange
      findUnique.mockResolvedValue(null);

      // Act
      const error = await captureError(
        service.registrationEmailResending({ email: 'nobody@example.com' }),
      );

      // Assert
      expect(error.code).toBe(AUTH_ERROR_CODE.USER_NOT_FOUND);
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(emailConfirmationUpsert).not.toHaveBeenCalled();
    });

    it('кидает EMAIL_ALREADY_CONFIRMED, если email уже подтверждён', async () => {
      // Arrange
      findUnique.mockResolvedValue({
        id: USER_ID,
        email: EMAIL,
        isConfirmed: true,
      });

      // Act
      const error = await captureError(
        service.registrationEmailResending({ email: EMAIL }),
      );

      // Assert
      expect(error.code).toBe(AUTH_ERROR_CODE.EMAIL_ALREADY_CONFIRMED);
      expect(sendRegistrationConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('passwordRecovery', () => {
    const RECAPTCHA_TOKEN = 'test-recaptcha-token';

    it('upsert recovery-кода и шлёт письмо (в т.ч. неподтверждённому)', async () => {
      // Arrange
      findUnique.mockResolvedValue({
        id: USER_ID,
        email: EMAIL,
        isConfirmed: false,
      });

      // Act
      await service.passwordRecovery({
        email: EMAIL,
        recaptchaToken: RECAPTCHA_TOKEN,
      });

      // Assert
      expect(verifyRecaptcha).toHaveBeenCalledWith(RECAPTCHA_TOKEN);
      expect(passwordRecoveryUpsert).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        create: expect.objectContaining({
          userId: USER_ID,
          code: expect.any(String),
          expiresAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          code: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
      expect(sendPasswordRecovery).toHaveBeenCalledWith(
        EMAIL,
        expect.stringMatching(
          /^value-of-FRONTEND_URL\/auth\/new-password\?code=[0-9a-f-]{36}$/,
        ),
      );
    });

    it('кидает USER_NOT_FOUND со статусом 404, если email неизвестен', async () => {
      // Arrange
      findUnique.mockResolvedValue(null);

      // Act
      const error = await captureError(
        service.passwordRecovery({
          email: 'nobody@example.com',
          recaptchaToken: RECAPTCHA_TOKEN,
        }),
      );

      // Assert
      expect(verifyRecaptcha).toHaveBeenCalledWith(RECAPTCHA_TOKEN);
      expect(error.code).toBe(AUTH_ERROR_CODE.USER_NOT_FOUND);
      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(passwordRecoveryUpsert).not.toHaveBeenCalled();
      expect(sendPasswordRecovery).not.toHaveBeenCalled();
    });

    it('не ходит в БД, если reCAPTCHA не прошла', async () => {
      // Arrange
      verifyRecaptcha.mockRejectedValue(
        new AppException({
          code: AUTH_ERROR_CODE.RECAPTCHA_FAILED,
          message: AUTH_ERROR_MESSAGE.RECAPTCHA_FAILED,
          status: HttpStatus.BAD_REQUEST,
        }),
      );

      // Act
      const error = await captureError(
        service.passwordRecovery({
          email: EMAIL,
          recaptchaToken: RECAPTCHA_TOKEN,
        }),
      );

      // Assert
      expect(error.code).toBe(AUTH_ERROR_CODE.RECAPTCHA_FAILED);
      expect(findUnique).not.toHaveBeenCalled();
      expect(passwordRecoveryUpsert).not.toHaveBeenCalled();
    });
  });

  describe('newPassword', () => {
    const RECOVERY_CODE = '0f8fad5b-d9cb-469f-a165-70867728950e';
    const newPasswordDto = {
      newPassword: VALID_PASSWORD,
      passwordConfirmation: VALID_PASSWORD,
      recoveryCode: RECOVERY_CODE,
    };

    it('обновляет пароль, удаляет recovery и все Session', async () => {
      // Arrange
      passwordRecoveryFindUnique.mockResolvedValue({
        id: 'recovery-id',
        userId: USER_ID,
        code: RECOVERY_CODE,
        expiresAt: new Date(Date.now() + 60_000),
      });

      // Act
      await service.newPassword(newPasswordDto);

      // Assert
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { passwordHash: expect.stringMatching(/^\$2[aby]\$/) },
      });
      expect(passwordRecoveryDelete).toHaveBeenCalledWith({
        where: { id: 'recovery-id' },
      });
      expect(sessionDeleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
    });

    it('кидает RECOVERY_CODE_INVALID, если кода нет', async () => {
      // Arrange
      passwordRecoveryFindUnique.mockResolvedValue(null);

      // Act
      const error = await captureError(service.newPassword(newPasswordDto));

      // Assert
      expect(error.code).toBe(AUTH_ERROR_CODE.RECOVERY_CODE_INVALID);
      expect(error.message).toBe(AUTH_ERROR_MESSAGE.RECOVERY_CODE_INVALID);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('кидает RECOVERY_CODE_EXPIRED, если TTL вышел', async () => {
      // Arrange
      passwordRecoveryFindUnique.mockResolvedValue({
        id: 'recovery-id',
        userId: USER_ID,
        code: RECOVERY_CODE,
        expiresAt: new Date(Date.now() - 1_000),
      });

      // Act
      const error = await captureError(service.newPassword(newPasswordDto));

      // Assert
      expect(error.code).toBe(AUTH_ERROR_CODE.RECOVERY_CODE_EXPIRED);
      expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('loginWithOAuth', () => {
    const googleProfile = {
      providerId: 'google-sub-123',
      email: 'google.user@example.com',
      firstName: 'Иван',
      lastName: 'Петров',
    };

    it('кидает OAUTH_EMAIL_REQUIRED, если провайдер не отдал email', async () => {
      const error = await captureError(
        service.loginWithOAuth(OAUTH_PROVIDER_GOOGLE, {
          providerId: 'google-sub-123',
        }),
      );

      expect(error.code).toBe(AUTH_ERROR_CODE.OAUTH_EMAIL_REQUIRED);
      expect(error.message).toBe(AUTH_ERROR_MESSAGE.OAUTH_EMAIL_REQUIRED);
      expect(oAuthProviderFindUnique).not.toHaveBeenCalled();
      expect(sendOAuthRegistrationNotification).not.toHaveBeenCalled();
    });

    it('логинит существующего OAuth-пользователя без нового User', async () => {
      oAuthProviderFindUnique.mockResolvedValue({
        provider: OAUTH_PROVIDER_GOOGLE,
        providerId: googleProfile.providerId,
        user: { id: USER_ID, email: EMAIL },
      });

      const tokens = await service.loginWithOAuth(
        OAUTH_PROVIDER_GOOGLE,
        googleProfile,
      );

      expect(tokens).toEqual({
        accessToken: 'signed-token',
        refreshToken: 'signed-token',
      });
      expect(userCreate).not.toHaveBeenCalled();
      expect(oAuthProviderCreate).not.toHaveBeenCalled();
      expect(sendOAuthRegistrationNotification).not.toHaveBeenCalled();
    });

    it('привязывает провайдера к существующему подтверждённому User', async () => {
      findUnique.mockResolvedValue({
        id: USER_ID,
        email: googleProfile.email,
        isConfirmed: true,
      });

      await service.loginWithOAuth(OAUTH_PROVIDER_GOOGLE, googleProfile);

      expect(oAuthProviderCreate).toHaveBeenCalledWith({
        data: {
          userId: USER_ID,
          provider: OAUTH_PROVIDER_GOOGLE,
          providerId: googleProfile.providerId,
        },
      });
      expect(userCreate).not.toHaveBeenCalled();
      expect(sendOAuthRegistrationNotification).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });

    it('подтверждает неподтверждённого User и не шлёт welcome-письмо', async () => {
      findUnique.mockResolvedValue({
        id: USER_ID,
        email: googleProfile.email,
        isConfirmed: false,
      });

      await service.loginWithOAuth(OAUTH_PROVIDER_GOOGLE, googleProfile);

      expect(oAuthProviderCreate).toHaveBeenCalledTimes(1);
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { isConfirmed: true },
      });
      expect(emailConfirmationDeleteMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
      });
      expect(sendOAuthRegistrationNotification).not.toHaveBeenCalled();
    });

    it('создаёт User без пароля, username client1 и шлёт уведомление', async () => {
      userCreate.mockResolvedValue({
        id: USER_ID,
        email: googleProfile.email,
      });

      await service.loginWithOAuth(OAUTH_PROVIDER_GOOGLE, googleProfile);

      const [[createArgs]] = userCreate.mock.calls as [
        [
          {
            data: {
              username: string;
              passwordHash: string | null;
              isConfirmed: boolean;
              firstName: string;
              lastName: string;
            };
          },
        ],
      ];
      expect(createArgs.data.username).toBe('client1');
      expect(createArgs.data.passwordHash).toBeNull();
      expect(createArgs.data.isConfirmed).toBe(true);
      expect(createArgs.data.firstName).toBe('Иван');
      expect(createArgs.data.lastName).toBe('Петров');
      expect(sendOAuthRegistrationNotification).toHaveBeenCalledWith(
        googleProfile.email,
      );
    });

    it('берёт следующий свободный client{N} при занятых username', async () => {
      userFindMany.mockResolvedValue([
        { username: 'client1' },
        { username: 'client3' },
        { username: 'client_skip' },
      ]);
      userCreate.mockResolvedValue({
        id: USER_ID,
        email: googleProfile.email,
      });

      await service.loginWithOAuth(OAUTH_PROVIDER_GOOGLE, googleProfile);

      const [[createArgs]] = userCreate.mock.calls as [
        [{ data: { username: string } }],
      ];
      expect(createArgs.data.username).toBe('client4');
    });
  });
});
