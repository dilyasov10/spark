import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator';
import { AuthService } from './auth.service';
import { REFRESH_TOKEN_COOKIE, readRefreshCookie } from './auth.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { DeviceSessionDto } from './dto/device-session.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './types/jwt-payload';

@ApiTags('security')
@Controller('security')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SecurityController {
  constructor(private readonly authService: AuthService) {}

  @Get('devices')
  @ApiOperation({
    summary: 'Список активных сессий',
    description: 'Текущий пользователь. Просроченные Session не отдаём.',
  })
  @ApiOkResponse({ type: [DeviceSessionDto] })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
  async listDevices(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DeviceSessionDto[]> {
    return this.authService.listSessions(user.id);
  }

  @Delete('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({
    summary: 'Завершить все сессии кроме текущей',
    description:
      'Текущий deviceId берётся из refresh-cookie. Остальные Session пользователя удаляются.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Чужие сессии удалены',
  })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
  async terminateOtherDevices(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.authService.terminateOtherSessions(
      user.id,
      readRefreshCookie(request),
    );
  }

  @Delete('devices/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Завершить сессию устройства',
    description:
      '404 если сессии нет, 403 если она принадлежит другому пользователю.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Сессия удалена',
  })
  @ApiErrorResponses(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async terminateDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId', new ParseUUIDPipe({ version: '4' })) deviceId: string,
  ): Promise<void> {
    await this.authService.terminateSession(user.id, deviceId);
  }
}
