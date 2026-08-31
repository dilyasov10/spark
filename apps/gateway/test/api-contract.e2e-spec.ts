import {
  Body,
  Controller,
  Get,
  HttpStatus,
  INestApplication,
  Logger,
  Module,
  Post,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IsEmail, IsString, MinLength } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  AllExceptionsFilter,
  ApiErrorDto,
  AppException,
  ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
  createValidationPipe,
} from '@app/common';

const CREATED_AT = '2026-08-21T01:52:00.000Z';

class CreateUserDto {
  @IsString()
  @MinLength(3)
  userName: string;

  @IsEmail()
  email: string;
}

@Controller('users')
class UsersTestController {
  @Get()
  findAll(): { items: string[]; createdAt: Date } {
    return { items: [], createdAt: new Date(CREATED_AT) };
  }

  @Post()
  create(@Body() dto: CreateUserDto): { id: string; email: string } {
    return { id: '0f8fad5b-d9cb-469f-a165-70867728950e', email: dto.email };
  }

  @Get('taken')
  taken(): never {
    throw new AppException({
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'Пользователь с таким email уже зарегистрирован',
      details: [{ field: 'email', message: 'Email уже занят' }],
    });
  }

  @Get('boom')
  boom(): never {
    throw new Error('connect ECONNREFUSED db.neon.tech:5432');
  }
}

@Module({
  controllers: [UsersTestController],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
class ContractTestModule {}

describe('Контракт ответов API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const moduleFixture = await Test.createTestingModule({
      imports: [ContractTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('пустая коллекция уходит массивом, дата — строкой ISO 8601', async () => {
    const response = await request(app.getHttpServer())
      .get('/users')
      .expect(HttpStatus.OK);

    expect(response.body).toEqual({ items: [], createdAt: CREATED_AT });
  });

  it('ошибка валидации — 400 с деталями по полям', async () => {
    const response = await request(app.getHttpServer())
      .post('/users')
      .send({ userName: 'ab', email: 'not-an-email' })
      .expect(HttpStatus.BAD_REQUEST);

    const body = response.body as ApiErrorDto;

    expect(body.code).toBe(ERROR_CODE.VALIDATION_ERROR);
    expect(body.message).toBeTruthy();
    expect(body.details?.map((detail) => detail.field)).toEqual(
      expect.arrayContaining(['userName', 'email']),
    );
    expect(body).not.toHaveProperty('statusCode');
  });

  it('доменная ошибка отдаёт свой code и текст для пользователя', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/taken')
      .expect(HttpStatus.BAD_REQUEST);

    expect(response.body).toEqual({
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'Пользователь с таким email уже зарегистрирован',
      details: [{ field: 'email', message: 'Email уже занят' }],
    });
  });

  it('несуществующий маршрут — 404 в том же формате', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/does-not-exist')
      .expect(HttpStatus.NOT_FOUND);

    // Техническое `Cannot GET /...` от роутера наружу не уходит.
    expect(response.body).toEqual({
      code: ERROR_CODE.NOT_FOUND,
      message: 'Ресурс не найден',
    });
  });

  it('неожиданная ошибка — 500 без подробностей наружу', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/boom')
      .expect(HttpStatus.INTERNAL_SERVER_ERROR);

    expect(response.body).toEqual({
      code: ERROR_CODE.INTERNAL_SERVER_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    });
  });
});
