import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { MatchPasswordConfirmationConstraint } from './constraints/match-password-confirmation.constraint';
import {
  FIRST_NAME_MAX_LENGTH,
  FIRST_NAME_MIN_LENGTH,
  LAST_NAME_MAX_LENGTH,
  LAST_NAME_MIN_LENGTH,
  PASSWORD_COMPLEXITY_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from './constraints/registration.constraints';

/**
 * Тело запроса на регистрацию.
 *
 * Декоратор class-validator обязателен на каждом поле: глобальный пайп собран
 * с `whitelist` и `forbidNonWhitelisted`.
 */
export class RegistrationDto {
  @ApiProperty({
    example: 'anna_kovaleva',
    description: 'Уникальный username',
  })
  @IsDefined({ message: 'Username обязателен' })
  @IsString({ message: 'Username должен быть строкой' })
  @MinLength(USERNAME_MIN_LENGTH, {
    message: `Username не короче ${USERNAME_MIN_LENGTH} символов`,
  })
  @MaxLength(USERNAME_MAX_LENGTH, {
    message: `Username не длиннее ${USERNAME_MAX_LENGTH} символов`,
  })
  @Matches(USERNAME_PATTERN, {
    message:
      'Username: 6–30 символов, только латиница, цифры, подчёркивание или дефис',
  })
  username: string;

  @ApiProperty({
    example: 'anna.kovaleva@gmail.com',
    description: 'Email нового пользователя',
  })
  @IsDefined({ message: 'Email обязателен' })
  @IsEmail({}, { message: 'Некорректный email' })
  email: string;

  @ApiProperty({
    example: 'Password123!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'Пароль от аккаунта',
  })
  @IsDefined({ message: 'Пароль обязателен' })
  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Пароль не короче ${PASSWORD_MIN_LENGTH} символов`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: `Пароль не длиннее ${PASSWORD_MAX_LENGTH} символов`,
  })
  @Matches(PASSWORD_PATTERN, {
    message: 'Пароль содержит недопустимые символы',
  })
  @Matches(PASSWORD_COMPLEXITY_PATTERN, {
    message:
      'Пароль должен содержать хотя бы одну цифру, одну строчную и одну заглавную букву',
  })
  password: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Подтверждение пароля',
  })
  @IsDefined({ message: 'Подтверждение пароля обязательно' })
  @IsString({ message: 'Подтверждение пароля должно быть строкой' })
  @Validate(MatchPasswordConfirmationConstraint)
  passwordConfirmation: string;

  @ApiProperty({ example: 'Анна', description: 'Имя' })
  @IsDefined({ message: 'Имя обязательно' })
  @IsString({ message: 'Имя должно быть строкой' })
  @MinLength(FIRST_NAME_MIN_LENGTH, {
    message: 'Имя не может быть пустым',
  })
  @MaxLength(FIRST_NAME_MAX_LENGTH, {
    message: `Имя не длиннее ${FIRST_NAME_MAX_LENGTH} символов`,
  })
  firstName: string;

  @ApiProperty({ example: 'Ковалёва', description: 'Фамилия' })
  @IsDefined({ message: 'Фамилия обязательна' })
  @IsString({ message: 'Фамилия должна быть строкой' })
  @MinLength(LAST_NAME_MIN_LENGTH, {
    message: 'Фамилия не может быть пустой',
  })
  @MaxLength(LAST_NAME_MAX_LENGTH, {
    message: `Фамилия не длиннее ${LAST_NAME_MAX_LENGTH} символов`,
  })
  lastName: string;
}
