import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AUTH_ERROR_CODE, AUTH_ERROR_MESSAGE, AppException } from '@app/common';
import { PrismaService } from '@app/prisma';
import { BCRYPT_ROUNDS } from './auth.constants';
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
const CREATED_AT = '2026-01-17T08:42:00.000Z';

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
  let signAsync: jest.Mock;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(VALID_PASSWORD, BCRYPT_ROUNDS);
  });

  beforeEach(() => {
    jest.mocked(bcrypt.compare).mockClear();
    findUnique = jest.fn();
    signAsync = jest.fn().mockResolvedValue('signed-token');

    service = new AuthService(
      { user: { findUnique } } as unknown as PrismaService,
      { signAsync } as unknown as JwtService,
      {
        getOrThrow: jest.fn((key: string) => `value-of-${key}`),
      } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('возвращает пару токенов при верных учётных данных', async () => {
    // Arrange
    findUnique.mockResolvedValue({ id: USER_ID, email: EMAIL, passwordHash });

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
    findUnique.mockResolvedValue({ id: USER_ID, email: EMAIL, passwordHash });

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
    findUnique.mockResolvedValue({ id: USER_ID, email: EMAIL, passwordHash });

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
    findUnique.mockResolvedValue({ id: USER_ID, email: EMAIL, passwordHash });

    // Act
    const error = await captureError(
      service.login({ email: EMAIL, password: WRONG_PASSWORD }),
    );

    // Assert
    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(AUTH_ERROR_CODE.INVALID_CREDENTIALS);
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('не раскрывает, зарегистрирован ли email: ответы на оба отказа совпадают', async () => {
    // Arrange
    findUnique.mockResolvedValueOnce(null);
    findUnique.mockResolvedValueOnce({
      id: USER_ID,
      email: EMAIL,
      passwordHash,
    });

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
    findUnique.mockResolvedValue({
      id: USER_ID,
      email: EMAIL,
      createdAt: new Date(CREATED_AT),
    });

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

  it('отдаёт дату регистрации строкой ISO 8601 в UTC', async () => {
    // Arrange: через RabbitMQ едет JSON, и Date до gateway не доживает —
    // сериализуем на этой стороне, чтобы тип не расходился с реальностью.
    findUnique.mockResolvedValue({
      id: USER_ID,
      email: EMAIL,
      createdAt: new Date(CREATED_AT),
    });

    // Act
    const user = await service.findAuthenticatedUser(USER_ID);

    // Assert
    expect(user?.createdAt).toBe(CREATED_AT);
  });
});
