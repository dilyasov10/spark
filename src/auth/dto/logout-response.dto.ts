import { ApiProperty } from '@nestjs/swagger';

/**
 * Ответ на выход из аккаунта.
 *
 * Вся работа эндпоинта происходит в заголовке `Set-Cookie`, но пустое тело
 * фронтенду не на чем типизировать, а `204` контракт не предусматривает
 * (CLAUDE.md, правило 6) — поэтому отдаём явный флаг.
 */
export class LogoutResponseDto {
  @ApiProperty({
    example: true,
    description: 'Всегда true: выход идемпотентен и не может не удаться',
  })
  success: boolean;
}
