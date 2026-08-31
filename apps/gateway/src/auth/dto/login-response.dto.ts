import { ApiProperty } from '@nestjs/swagger';

/**
 * Ответ на успешный вход.
 *
 * Refresh-токена здесь намеренно нет: он уходит отдельной httpOnly-cookie,
 * недоступной из JS.
 */
export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'JWT для заголовка Authorization: Bearer <token>. Живёт 15 минут',
  })
  accessToken: string;
}
