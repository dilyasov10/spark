import {
  ArgumentsHost,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiErrorDto } from '../dto/api-error.dto';
import { AppException } from '../errors/app.exception';
import { ERROR_CODE, INTERNAL_ERROR_MESSAGE } from '../errors/error-code';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let host: ArgumentsHost;
  let sentStatus: number | undefined;
  let sentBody: ApiErrorDto | undefined;
  let logError: jest.SpyInstance;

  beforeEach(() => {
    sentStatus = undefined;
    sentBody = undefined;

    const json = (body: ApiErrorDto): void => {
      sentBody = body;
    };
    const status = (code: number): { json: typeof json } => {
      sentStatus = code;
      return { json };
    };

    host = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/auth/registration' }),
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    filter = new AllExceptionsFilter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('отдаёт code, message и details доменной ошибки', () => {
    filter.catch(
      new AppException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Пользователь с таким email уже зарегистрирован',
        details: [{ field: 'email', message: 'Email уже занят' }],
      }),
      host,
    );

    expect(sentStatus).toBe(HttpStatus.BAD_REQUEST);
    expect(sentBody).toEqual({
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'Пользователь с таким email уже зарегистрирован',
      details: [{ field: 'email', message: 'Email уже занят' }],
    });
  });

  it('сохраняет текст исключения Nest и выводит code из статуса', () => {
    filter.catch(new NotFoundException('Пользователь не найден'), host);

    expect(sentStatus).toBe(HttpStatus.NOT_FOUND);
    expect(sentBody).toEqual({
      code: ERROR_CODE.NOT_FOUND,
      message: 'Пользователь не найден',
    });
  });

  it('подставляет текст по статусу, если исключение брошено без сообщения', () => {
    filter.catch(new HttpException({}, HttpStatus.FORBIDDEN), host);

    expect(sentBody).toEqual({
      code: ERROR_CODE.FORBIDDEN,
      message: 'Недостаточно прав для этого действия',
    });
  });

  it('не отдаёт details там, где их нет', () => {
    filter.catch(new ForbiddenException(), host);

    expect(sentStatus).toBe(HttpStatus.FORBIDDEN);
    expect(sentBody).not.toHaveProperty('details');
  });

  it('прячет подробности неожиданной ошибки за общим текстом', () => {
    filter.catch(new Error('connect ECONNREFUSED db.neon.tech:5432'), host);

    expect(sentStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(sentBody).toEqual({
      code: ERROR_CODE.INTERNAL_SERVER_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    });
  });

  it('прячет подробности и у 500, брошенного явно', () => {
    filter.catch(
      new InternalServerErrorException('relation "users" does not exist'),
      host,
    );

    expect(sentBody?.message).toBe(INTERNAL_ERROR_MESSAGE);
  });

  it('пишет в лог только серверные ошибки', () => {
    filter.catch(new Error('boom'), host);
    expect(logError).toHaveBeenCalledTimes(1);

    filter.catch(new NotFoundException(), host);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
