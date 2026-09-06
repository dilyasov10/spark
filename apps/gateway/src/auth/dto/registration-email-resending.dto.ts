import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEmail } from 'class-validator';

/** Тело запроса на повторную отправку письма подтверждения. */
export class RegistrationEmailResendingDto {
  @ApiProperty({
    example: 'anna.kovaleva@gmail.com',
    description: 'Email неподтверждённого пользователя',
  })
  @IsDefined({ message: 'Email обязателен' })
  @IsEmail({}, { message: 'Некорректный email' })
  email: string;
}
