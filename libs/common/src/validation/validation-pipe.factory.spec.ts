import 'reflect-metadata';
import { ArgumentMetadata, HttpStatus, ValidationError } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsString, MinLength, ValidateNested } from 'class-validator';
import { AppException } from '../errors/app.exception';
import { ERROR_CODE } from '../errors/error-code';
import {
  createValidationPipe,
  flattenValidationErrors,
} from './validation-pipe.factory';

class ProfileDto {
  @IsString()
  @MinLength(2)
  city: string;
}

class SignUpDto {
  @IsString()
  @MinLength(3)
  userName: string;

  @IsEmail()
  email: string;

  @ValidateNested()
  @Type(() => ProfileDto)
  profile: ProfileDto;
}

const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: SignUpDto,
  data: undefined,
};

async function catchAppException(
  promise: Promise<unknown>,
): Promise<AppException> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof AppException) {
      return error;
    }
    throw error;
  }

  throw new Error('Ожидалось AppException, но валидация прошла успешно');
}

describe('flattenValidationErrors', () => {
  it('разворачивает вложенные ошибки в путь через точку', () => {
    const errors: ValidationError[] = [
      {
        property: 'email',
        constraints: { isEmail: 'Некорректный email' },
        children: [],
      },
      {
        property: 'profile',
        children: [
          {
            property: 'city',
            constraints: { minLength: 'Слишком короткое название' },
            children: [],
          },
        ],
      },
    ];

    expect(flattenValidationErrors(errors)).toEqual([
      { field: 'email', message: 'Некорректный email' },
      { field: 'profile.city', message: 'Слишком короткое название' },
    ]);
  });

  it('на пустом списке возвращает пустой массив', () => {
    expect(flattenValidationErrors([])).toEqual([]);
  });
});

describe('createValidationPipe', () => {
  const pipe = createValidationPipe();

  it('превращает ошибки валидации в 400 с деталями по полям', async () => {
    const exception = await catchAppException(
      pipe.transform(
        { userName: 'ab', email: 'not-an-email', profile: { city: 'a' } },
        metadata,
      ),
    );

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.code).toBe(ERROR_CODE.VALIDATION_ERROR);
    expect(exception.details?.map((detail) => detail.field)).toEqual(
      expect.arrayContaining(['userName', 'email', 'profile.city']),
    );
  });

  it('отклоняет неизвестные поля', async () => {
    const exception = await catchAppException(
      pipe.transform(
        {
          userName: 'valid',
          email: 'user@example.com',
          profile: { city: 'Астана' },
          isAdmin: true,
        },
        metadata,
      ),
    );

    expect(exception.details?.map((detail) => detail.field)).toContain(
      'isAdmin',
    );
  });

  it('пропускает валидное тело запроса', async () => {
    const payload = {
      userName: 'valid',
      email: 'user@example.com',
      profile: { city: 'Астана' },
    };

    await expect(pipe.transform(payload, metadata)).resolves.toEqual(payload);
  });
});
