import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import {
  ERROR_CODE,
  errorMessageByStatus,
} from '../../common/errors/error-code';
import { AUTH_ERROR_CODE, AUTH_ERROR_MESSAGE } from '../auth.error-code';
import type { AuthenticatedUser } from '../types/jwt-payload';
import { JwtAuthGuard } from './jwt-auth.guard';

const USER: AuthenticatedUser = {
  id: '3f8c1a94-2e7b-4d61-9c0a-5b1e2d4a7f01',
  username: 'anna_kovaleva',
  email: 'anna.kovaleva@gmail.com',
  firstName: 'Анна',
  lastName: 'Ковалёва',
  createdAt: new Date('2026-01-17T08:42:00Z'),
};

/** Ошибка, которую отдал Passport при истёкшем токене. */
function tokenExpiredInfo(): Error {
  const info = new Error('jwt expired');
  info.name = 'TokenExpiredError';

  return info;
}

function captureError(call: () => unknown): AppException {
  try {
    call();
  } catch (error) {
    return error as AppException;
  }

  throw new Error('Ожидалась ошибка, но вызов завершился успешно');
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('пропускает пользователя, когда Passport его вернул', () => {
    // Arrange
    // Act
    const user = guard.handleRequest(null, USER, undefined);

    // Assert
    expect(user).toBe(USER);
  });

  it('отдаёт TOKEN_EXPIRED, когда срок действия токена истёк', () => {
    // Arrange
    const info = tokenExpiredInfo();

    // Act
    const error = captureError(() => guard.handleRequest(null, false, info));

    // Assert
    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(AUTH_ERROR_CODE.TOKEN_EXPIRED);
    expect(error.message).toBe(AUTH_ERROR_MESSAGE.TOKEN_EXPIRED);
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('отдаёт UNAUTHORIZED с русским текстом, когда токена нет', () => {
    // Arrange
    const info = new Error('No auth token');

    // Act
    const error = captureError(() => guard.handleRequest(null, false, info));

    // Assert
    expect(error.code).toBe(ERROR_CODE.UNAUTHORIZED);
    expect(error.message).toBe(errorMessageByStatus(HttpStatus.UNAUTHORIZED));
    // Английский текст Passport наружу не уходит.
    expect(error.message).not.toBe('Unauthorized');
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('отдаёт UNAUTHORIZED, когда Passport не передал info', () => {
    // Arrange
    // Act
    const error = captureError(() =>
      guard.handleRequest(null, false, undefined),
    );

    // Assert
    expect(error.code).toBe(ERROR_CODE.UNAUTHORIZED);
    expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('пробрасывает ошибку из validate() без подмены', () => {
    // Arrange
    const original = new AppException({
      code: ERROR_CODE.UNAUTHORIZED,
      message: 'Необходимо войти в аккаунт',
      status: HttpStatus.UNAUTHORIZED,
    });

    // Act
    const error = captureError(() =>
      guard.handleRequest(original, false, undefined),
    );

    // Assert
    expect(error).toBe(original);
  });
});
