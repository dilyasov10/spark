import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { MatchPasswordConfirmationConstraint } from './constraints/match-password-confirmation.constraint';
import {
  PASSWORD_COMPLEXITY_PATTERN,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
} from './constraints/registration.constraints';

/** Тело запроса на установку нового пароля по recovery-коду. */
export class NewPasswordDto {
  @ApiProperty({
    example: 'Password123!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
    description: 'Новый пароль',
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
  newPassword: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Подтверждение нового пароля',
  })
  @IsDefined({ message: 'Подтверждение пароля обязательно' })
  @IsString({ message: 'Подтверждение пароля должно быть строкой' })
  @Validate(MatchPasswordConfirmationConstraint)
  passwordConfirmation: string;

  @ApiProperty({
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
    description: 'Код восстановления из ссылки в письме',
  })
  @IsDefined({ message: 'Код восстановления обязателен' })
  @IsString({ message: 'Код восстановления должен быть строкой' })
  @IsUUID('all', { message: 'Код восстановления должен быть UUID' })
  recoveryCode: string;
}
