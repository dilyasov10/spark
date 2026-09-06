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
import { setupApp } from '../src/common/bootstrap/setup-app';
import { ApiErrorDto } from '../src/common/dto/api-error.dto';
import { ERROR_CODE } from '../src/common/errors/error-code';
import { PrismaService } from '../src/prisma/prisma.service';

const PASSWORD = 'Password123!';
const CREATED_AT = '2026-01-17T08:42:00.000Z';
const OTHER_DEVICE_ID = '9e5a3b72-1f48-4c07-a5d9-3b8e1c6f2a04';

const USER = {
  id: '3f8c1a94-2e7b-4d61-9c0a-5b1e2d4a7f01',
  username: 'anna_kovaleva',
  email: 'anna.kovaleva@gmail.com',
  firstName: 'Анна',
  lastName: 'Ковалёва',
  createdAt: new Date(CREATED_AT),
};

type SessionRow = {
  id: string;
  userId: string;
  deviceId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  ip: string;
  deviceName: string;
  lastActiveDate: Date;
};

function refreshCookieValue(response: request.Response): string {
  const cookies = (response.headers['set-cookie'] ?? []) as unknown as string[];
  const cookie = cookies.find((item) =>
    item.startsWith(`${REFRESH_TOKEN_COOKIE}=`),
  );
  if (cookie === undefined) {
    throw new Error(`В ответе нет cookie ${REFRESH_TOKEN_COOKIE}`);
  }

  return cookie.slice(`${REFRESH_TOKEN_COOKIE}=`.length).split(';')[0];
}

describe('Сессии устройств (e2e)', () => {
  let app: INestApplication<App>;
  let sessions: Map<string, SessionRow>;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
    sessions = new Map();

    const sessionKey = (userId: string, deviceId: string): string =>
      `${userId}:${deviceId}`;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        user: {
          findUnique: jest.fn(
            ({ where }: { where: { id?: string; email?: string } }) => {
              if (where.email !== undefined) {
                return Promise.resolve(
                  where.email === USER.email
                    ? { ...USER, passwordHash, isConfirmed: true }
                    : null,
                );
              }

              return Promise.resolve(where.id === USER.id ? USER : null);
            },
          ),
        },
        session: {
          create: jest.fn(({ data }: { data: SessionRow }) => {
            const row = { ...data, id: data.deviceId };
            sessions.set(sessionKey(data.userId, data.deviceId), row);
            return Promise.resolve(row);
          }),
          findUnique: jest.fn(
            ({
              where,
            }: {
              where: { userId_deviceId: { userId: string; deviceId: string } };
            }) => {
              const { userId, deviceId } = where.userId_deviceId;
              return Promise.resolve(
                sessions.get(sessionKey(userId, deviceId)) ?? null,
              );
            },
          ),
          findFirst: jest.fn(({ where }: { where: { deviceId: string } }) => {
            for (const row of sessions.values()) {
              if (row.deviceId === where.deviceId) {
                return Promise.resolve(row);
              }
            }
            return Promise.resolve(null);
          }),
          findMany: jest.fn(({ where }: { where: { userId: string } }) => {
            const rows = [...sessions.values()].filter(
              (row) =>
                row.userId === where.userId &&
                row.expiresAt.getTime() > Date.now(),
            );
            return Promise.resolve(rows);
          }),
          update: jest.fn(
            ({
              where,
              data,
            }: {
              where: { userId_deviceId: { userId: string; deviceId: string } };
              data: Partial<SessionRow>;
            }) => {
              const key = sessionKey(
                where.userId_deviceId.userId,
                where.userId_deviceId.deviceId,
              );
              const prev = sessions.get(key);
              if (!prev) {
                return Promise.resolve(null);
              }
              const next = { ...prev, ...data };
              sessions.set(key, next);
              return Promise.resolve(next);
            },
          ),
          delete: jest.fn(({ where }: { where: { id: string } }) => {
            for (const [key, row] of sessions) {
              if (row.id === where.id) {
                sessions.delete(key);
              }
            }
            return Promise.resolve({});
          }),
          deleteMany: jest.fn(
            ({
              where,
            }: {
              where: { userId: string; deviceId?: { not: string } };
            }) => {
              for (const [key, row] of sessions) {
                if (row.userId !== where.userId) {
                  continue;
                }
                if (where.deviceId && row.deviceId === where.deviceId.not) {
                  continue;
                }
                sessions.delete(key);
              }
              return Promise.resolve({ count: 0 });
            },
          ),
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    sessions.clear();
  });

  async function login(): Promise<{ accessToken: string; cookie: string }> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: USER.email, password: PASSWORD })
      .expect(HttpStatus.OK);

    return {
      accessToken: (response.body as { accessToken: string }).accessToken,
      cookie: `${REFRESH_TOKEN_COOKIE}=${refreshCookieValue(response)}`,
    };
  }

  describe('GET /api/security/devices', () => {
    it('отдаёт список сессий текущего пользователя', async () => {
      // Arrange
      const { accessToken } = await login();

      // Act
      const response = await request(app.getHttpServer())
        .get('/api/security/devices')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Assert
      const body = response.body as Array<{ deviceId: string }>;
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].deviceId).toEqual(expect.any(String));
    });

    it('отвечает 401 без access-токена', async () => {
      // Arrange
      // Act
      const response = await request(app.getHttpServer())
        .get('/api/security/devices')
        .expect(HttpStatus.UNAUTHORIZED);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(ERROR_CODE.UNAUTHORIZED);
    });
  });

  describe('DELETE /api/security/devices/:deviceId', () => {
    it('отвечает 204 и удаляет свою сессию', async () => {
      // Arrange
      const { accessToken } = await login();
      const deviceId = [...sessions.values()][0].deviceId;

      // Act
      await request(app.getHttpServer())
        .delete(`/api/security/devices/${deviceId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Assert
      expect(sessions.size).toBe(0);
    });

    it('отвечает 404 на неизвестный deviceId', async () => {
      // Arrange
      const { accessToken } = await login();

      // Act
      const response = await request(app.getHttpServer())
        .delete(`/api/security/devices/${OTHER_DEVICE_ID}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(ERROR_CODE.NOT_FOUND);
    });

    it('отвечает 403, если сессия принадлежит другому пользователю', async () => {
      // Arrange
      const { accessToken } = await login();
      sessions.set(`other:${OTHER_DEVICE_ID}`, {
        id: OTHER_DEVICE_ID,
        userId: 'other-user-id',
        deviceId: OTHER_DEVICE_ID,
        refreshTokenHash: 'hash',
        expiresAt: new Date(Date.now() + 60_000),
        ip: '10.0.0.1',
        deviceName: 'other',
        lastActiveDate: new Date(),
      });

      // Act
      const response = await request(app.getHttpServer())
        .delete(`/api/security/devices/${OTHER_DEVICE_ID}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(ERROR_CODE.FORBIDDEN);
    });
  });

  describe('DELETE /api/security/devices', () => {
    it('удаляет все сессии кроме текущей', async () => {
      // Arrange
      const { accessToken, cookie } = await login();
      const currentId = [...sessions.values()][0].deviceId;
      sessions.set(`${USER.id}:${OTHER_DEVICE_ID}`, {
        id: OTHER_DEVICE_ID,
        userId: USER.id,
        deviceId: OTHER_DEVICE_ID,
        refreshTokenHash: 'other-hash',
        expiresAt: new Date(Date.now() + 60_000),
        ip: '10.0.0.2',
        deviceName: 'second',
        lastActiveDate: new Date(),
      });

      // Act
      await request(app.getHttpServer())
        .delete('/api/security/devices')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', cookie)
        .expect(HttpStatus.NO_CONTENT);

      // Assert
      expect([...sessions.values()].map((row) => row.deviceId)).toEqual([
        currentId,
      ]);
    });

    it('отвечает 401 без refresh-cookie', async () => {
      // Arrange
      const { accessToken } = await login();

      // Act
      const response = await request(app.getHttpServer())
        .delete('/api/security/devices')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.UNAUTHORIZED);

      // Assert
      expect((response.body as ApiErrorDto).code).toBe(ERROR_CODE.UNAUTHORIZED);
    });
  });
});
