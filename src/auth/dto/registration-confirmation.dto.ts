import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString, IsUUID } from 'class-validator';

/** Тело запроса подтверждения email по коду из письма. */
export class RegistrationConfirmationDto {
  @ApiProperty({
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
    description: 'Код подтверждения из ссылки в письме',
  })
  @IsDefined({ message: 'Код подтверждения обязателен' })
  @IsString({ message: 'Код подтверждения должен быть строкой' })
  @IsUUID('all', { message: 'Код подтверждения должен быть UUID' })
  code: string;
}
