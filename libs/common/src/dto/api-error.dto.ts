import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Уточнение ошибки по конкретному полю запроса. */
export class ErrorDetailDto {
  @ApiProperty({
    example: 'email',
    description: 'Поле запроса, к которому относится ошибка',
  })
  field: string;

  @ApiProperty({
    example: 'Некорректный email',
    description: 'Текст ошибки для этого поля',
  })
  message: string;
}

/** Единое тело ответа для всех ошибок API (CLAUDE.md, правило 5). */
export class ApiErrorDto {
  @ApiProperty({
    example: 'VALIDATION_ERROR',
    description:
      'Стабильный машинный код ошибки в UPPER_SNAKE_CASE. Клиент ветвится по нему, а не по message',
  })
  code: string;

  @ApiProperty({
    example: 'Проверьте правильность заполнения полей',
    description: 'Человекочитаемый текст для пользователя',
  })
  message: string;

  @ApiPropertyOptional({
    type: [ErrorDetailDto],
    description: 'Уточнения по полям, если ошибка относится к конкретным полям',
  })
  details?: ErrorDetailDto[];
}
