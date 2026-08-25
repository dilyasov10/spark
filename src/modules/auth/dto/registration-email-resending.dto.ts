import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsEmail } from 'class-validator';

export class RegistrationEmailResendingDto {
  @ApiProperty({ example: 'anna.kovaleva@gmail.com' })
  @IsDefined()
  @IsEmail()
  email: string;
}
