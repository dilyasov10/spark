import { ApiProperty } from '@nestjs/swagger';

/** Профиль текущего пользователя. `passwordHash` наружу не выходит никогда. */
export class UserProfileDto {
  @ApiProperty({
    example: '3f8c1a94-2e7b-4d61-9c0a-5b1e2d4a7f01',
    format: 'uuid',
    description: 'Идентификатор пользователя',
  })
  id: string;

  @ApiProperty({ example: 'anna_kovaleva' })
  username: string;

  @ApiProperty({ example: 'anna.kovaleva@gmail.com' })
  email: string;

  @ApiProperty({ example: 'Анна' })
  firstName: string;

  @ApiProperty({ example: 'Ковалёва' })
  lastName: string;

  // Строка, а не `Date`: профиль приезжает из auth-микросервиса через
  // RabbitMQ, то есть уже сериализованным. Формат от этого не меняется —
  // ISO 8601 в UTC, как требует контракт (CLAUDE.md, правило 3).
  @ApiProperty({
    example: '2026-01-17T08:42:00.000Z',
    format: 'date-time',
    description: 'Дата регистрации, ISO 8601 в UTC',
  })
  createdAt: string;
}
