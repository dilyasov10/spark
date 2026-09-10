import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEmail, IsString, MinLength } from 'class-validator';

/** Тело запроса на восстановление пароля (письмо с recovery-кодом). */
export class PasswordRecoveryDto {
  @ApiProperty({
    example: 'anna.kovaleva@gmail.com',
    description: 'Email пользователя',
  })
  @IsDefined({ message: 'Email обязателен' })
  @IsEmail({}, { message: 'Некорректный email' })
  email: string;

  @ApiProperty({
    example: '03AGdBq25...',
    description: 'Токен Google reCAPTCHA v2 (checkbox) с фронтенда',
  })
  @IsDefined({ message: 'Токен reCAPTCHA обязателен' })
  @IsString({ message: 'Токен reCAPTCHA должен быть строкой' })
  @MinLength(1, { message: 'Токен reCAPTCHA обязателен' })
  recaptchaToken: string;
}
