import { ApiProperty } from '@nestjs/swagger';

/** Активная сессия устройства. Сырой refresh и его хеш наружу не выходят. */
export class DeviceSessionDto {
  @ApiProperty({
    example: '7a2d5e18-9c34-4b6f-8e2d-1f7a3c9b5d02',
    format: 'uuid',
  })
  deviceId: string;

  @ApiProperty({ example: '127.0.0.1' })
  ip: string;

  @ApiProperty({
    example: 'Mozilla/5.0',
    description: 'User-Agent на момент последнего refresh или login',
  })
  deviceName: string;

  @ApiProperty({
    example: '2026-08-21T01:52:00.000Z',
    format: 'date-time',
    description: 'Последняя активность, ISO 8601 в UTC',
  })
  lastActiveDate: Date;
}
