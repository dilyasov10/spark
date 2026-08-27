import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

const PASSWORD_MIN_LENGTH = 8;

/**
 * Тело запроса на вход.
 *
 * Декоратор class-validator обязателен на каждом поле: глобальный пайп собран
 * с `whitelist` и `forbidNonWhitelisted`, поэтому поле без декоратора
 * вырезается из тела и тут же даёт `400` как лишнее.
 */
export class LoginDto {
  @ApiProperty({
    example: 'anna.kovaleva@gmail.com',
    description: 'Email зарегистрированного пользователя',
  })
  @IsEmail({}, { message: 'Некорректный email' })
  email: string;

  @ApiProperty({
    example: 'Password123!',
    minLength: PASSWORD_MIN_LENGTH,
    description: 'Пароль от аккаунта',
  })
  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Пароль не короче ${PASSWORD_MIN_LENGTH} символов`,
  })
  password: string;
}
