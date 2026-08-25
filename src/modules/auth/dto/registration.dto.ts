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

export class RegistrationDto {
  @ApiProperty({ example: 'anna_kovaleva' })
  @IsDefined()
  @IsString()
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  @Matches(USERNAME_PATTERN)
  username: string;

  @ApiProperty({ example: 'anna.kovaleva@gmail.com' })
  @IsDefined()
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsDefined()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_PATTERN)
  @Matches(PASSWORD_COMPLEXITY_PATTERN, {
    message:
      'Password must contain at least one digit, one lowercase and one uppercase letter',
  })
  password: string;

  @ApiProperty({ example: 'Password123!' })
  @IsDefined()
  @IsString()
  @Validate(MatchPasswordConfirmationConstraint)
  passwordConfirmation: string;

  @ApiProperty({ example: 'Anna' })
  @IsDefined()
  @IsString()
  @MinLength(FIRST_NAME_MIN_LENGTH)
  @MaxLength(FIRST_NAME_MAX_LENGTH)
  firstName: string;

  @ApiProperty({ example: 'Kovaleva' })
  @IsDefined()
  @IsString()
  @MinLength(LAST_NAME_MIN_LENGTH)
  @MaxLength(LAST_NAME_MAX_LENGTH)
  lastName: string;
}
