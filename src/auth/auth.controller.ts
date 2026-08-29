import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator';
import { REFRESH_TOKEN_COOKIE, refreshCookieOptions } from './auth.constants';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { NewPasswordDto } from './dto/new-password.dto';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { RegistrationConfirmationDto } from './dto/registration-confirmation.dto';
import { RegistrationEmailResendingDto } from './dto/registration-email-resending.dto';
import { RegistrationDto } from './dto/registration.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './types/jwt-payload';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('registration')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Регистрация',
    description:
      'Создаёт пользователя с isConfirmed=false и отправляет письмо с кодом.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Пользователь создан',
  })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async registration(@Body() dto: RegistrationDto): Promise<void> {
    await this.authService.registration(dto);
  }

  @Post('registration-confirmation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Подтверждение email по коду из письма' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Email подтверждён',
  })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async registrationConfirmation(
    @Body() dto: RegistrationConfirmationDto,
  ): Promise<void> {
    await this.authService.registrationConfirmation(dto);
  }

  @Post('registration-email-resending')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Повторная отправка письма подтверждения' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Письмо отправлено повторно',
  })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async registrationEmailResending(
    @Body() dto: RegistrationEmailResendingDto,
  ): Promise<void> {
    await this.authService.registrationEmailResending(dto);
  }

  @Post('password-recovery')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Восстановление пароля',
    description: 'Отправляет письмо со ссылкой для смены пароля.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Письмо отправлено',
  })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async passwordRecovery(@Body() dto: PasswordRecoveryDto): Promise<void> {
    await this.authService.passwordRecovery(dto);
  }

  @Post('new-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Новый пароль по recovery-коду',
    description: 'Меняет пароль и инвалидирует все сессии пользователя.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Пароль обновлён',
  })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async newPassword(@Body() dto: NewPasswordDto): Promise<void> {
    await this.authService.newPassword(dto);
  }

  @Post('login')
  // Nest на POST по умолчанию отвечает 201, контракт требует 200
  // (CLAUDE.md, правило 6).
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Вход по email и паролю',
    description:
      'Возвращает accessToken в теле; refreshToken уходит httpOnly-cookie ' +
      'и в теле ответа не появляется.',
  })
  @ApiOkResponse({ type: LoginResponseDto, description: 'Вход выполнен' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  async login(
    @Body() dto: LoginDto,
    // `passthrough` обязателен: без него Nest перестаёт сериализовать
    // возвращаемое значение и запрос повисает.
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const { accessToken, refreshToken } = await this.authService.login(dto);

    response.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      refreshCookieOptions(this.isProduction),
    );

    return { accessToken };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Профиль текущего пользователя' })
  @ApiOkResponse({ type: UserProfileDto, description: 'Профиль пользователя' })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
  me(@CurrentUser() user: AuthenticatedUser): UserProfileDto {
    return user;
  }

  private get isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
