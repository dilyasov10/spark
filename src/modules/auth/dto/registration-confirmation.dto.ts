import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString, IsUUID } from 'class-validator';

export class RegistrationConfirmationDto {
  @ApiProperty({
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
    description: 'Confirmation code from email link query param',
  })
  @IsDefined()
  @IsString()
  @IsUUID()
  code: string;
}
