import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppException } from '../common/errors/app.exception';
import { ERROR_CODE, errorMessageByStatus } from '../common/errors/error-code';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator';
import {
  REFRESH_TOKEN_COOKIE,
  clearRefreshCookieOptions,
  readRefreshCookie,
  refreshCookieOptions,
  sessionContextFromRequest,
} from './auth.constants';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { NewPasswordDto } from './dto/new-password.dto';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { RegistrationConfirmationDto } from './dto/registration-confirmation.dto';
import { RegistrationEmailResendingDto } from './dto/registration-email-resending.dto';
import { RegistrationDto } from './dto/registration.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
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
    @Req() request: Request,
    // `passthrough` обязателен: без него Nest перестаёт сериализовать
    // возвращаемое значение и запрос повисает.
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const { accessToken, refreshToken } = await this.authService.login(
      dto,
      sessionContextFromRequest(request),
    );

    response.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      refreshCookieOptions(this.isProduction),
    );

    return { accessToken };
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({
    summary: 'Обновление пары токенов',
    description:
      'Читает refresh из httpOnly-cookie, сверяет хеш с Session, ротирует ' +
      'refresh и отдаёт новый accessToken в теле.',
  })
  @ApiOkResponse({ type: LoginResponseDto, description: 'Токены обновлены' })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
  async refreshToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const refreshToken = readRefreshCookie(request);
    if (!refreshToken) {
      throw new AppException({
        code: ERROR_CODE.UNAUTHORIZED,
        message: errorMessageByStatus(HttpStatus.UNAUTHORIZED),
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    const tokens = await this.authService.refreshSession(
      refreshToken,
      sessionContextFromRequest(request),
    );

    response.cookie(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      refreshCookieOptions(this.isProduction),
    );

    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_TOKEN_COOKIE)
  @ApiOperation({
    summary: 'Выход из аккаунта',
    description:
      'Удаляет Session текущего девайса (если refresh-cookie валидна) и гасит ' +
      'cookie. Access-токен в заголовке не нужен: выйти можно и с протухшим ' +
      'access. Сам access остаётся валидным до своего TTL — фронт стирает его у себя.',
  })
  @ApiOkResponse({ type: LogoutResponseDto, description: 'Выход выполнен' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponseDto> {
    await this.authService.logoutByRefresh(readRefreshCookie(request));
    response.clearCookie(
      REFRESH_TOKEN_COOKIE,
      clearRefreshCookieOptions(this.isProduction),
    );

    return { success: true };
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
