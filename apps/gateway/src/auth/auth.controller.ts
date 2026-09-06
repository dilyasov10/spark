import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AUTH_ERROR_CODE,
  AUTH_ERROR_MESSAGE,
  AUTH_PATTERN,
  ApiErrorResponses,
  ERROR_CODE,
  RMQ_CLIENT,
  errorMessageByStatus,
  sendRpc,
} from '@app/common';
import type {
  AuthenticatedUser,
  LoginCommand,
  LoginResult,
  NewPasswordCommand,
  PasswordRecoveryCommand,
  RegistrationCommand,
  RegistrationConfirmationCommand,
  RegistrationEmailResendingCommand,
} from '@app/common';
import {
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from './auth.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { NewPasswordDto } from './dto/new-password.dto';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { RegistrationConfirmationDto } from './dto/registration-confirmation.dto';
import { RegistrationEmailResendingDto } from './dto/registration-email-resending.dto';
import { RegistrationDto } from './dto/registration.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RecaptchaService } from './recaptcha/recaptcha.service';

/**
 * Заголовок `Set-Cookie` в спеке: без него фронтенд не видит, что вход и выход
 * вообще трогают cookie, — в теле ответа refresh-токен не появляется.
 */
const SET_COOKIE_HEADER = {
  'Set-Cookie': {
    description:
      `httpOnly-cookie \`${REFRESH_TOKEN_COOKIE}\` на путь ` +
      `\`${REFRESH_TOKEN_COOKIE_PATH}\`. Из JS не читается; браузер приложит ` +
      'её сам, если запрос ушёл с `credentials: "include"`.',
    schema: { type: 'string' as const },
  },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(RMQ_CLIENT.AUTH) private readonly authClient: ClientProxy,
    private readonly configService: ConfigService,
    private readonly recaptchaService: RecaptchaService,
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
    await sendRpc<void, RegistrationCommand>(
      this.authClient,
      AUTH_PATTERN.REGISTRATION,
      {
        username: dto.username,
        email: dto.email,
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    );
  }

  @Post('registration-confirmation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Подтверждение email по коду из письма' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Email подтверждён' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async registrationConfirmation(
    @Body() dto: RegistrationConfirmationDto,
  ): Promise<void> {
    await sendRpc<void, RegistrationConfirmationCommand>(
      this.authClient,
      AUTH_PATTERN.REGISTRATION_CONFIRMATION,
      { code: dto.code },
    );
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
    await sendRpc<void, RegistrationEmailResendingCommand>(
      this.authClient,
      AUTH_PATTERN.REGISTRATION_EMAIL_RESENDING,
      { email: dto.email },
    );
  }

  @Post('password-recovery')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Восстановление пароля',
    description:
      'Проверяет reCAPTCHA и отправляет письмо со ссылкой для смены пароля.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Письмо отправлено' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async passwordRecovery(@Body() dto: PasswordRecoveryDto): Promise<void> {
    // reCAPTCHA — на входе, до брокера: токен приходит из браузера, это
    // edge-проверка. Дальше в auth уходит только email.
    await this.recaptchaService.verify(dto.recaptchaToken);

    await sendRpc<void, PasswordRecoveryCommand>(
      this.authClient,
      AUTH_PATTERN.PASSWORD_RECOVERY,
      { email: dto.email },
    );
  }

  @Post('new-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Новый пароль по recovery-коду',
    description: 'Меняет пароль и инвалидирует все сессии пользователя.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Пароль обновлён' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async newPassword(@Body() dto: NewPasswordDto): Promise<void> {
    await sendRpc<void, NewPasswordCommand>(
      this.authClient,
      AUTH_PATTERN.NEW_PASSWORD,
      { recoveryCode: dto.recoveryCode, newPassword: dto.newPassword },
    );
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
  @ApiOkResponse({
    type: LoginResponseDto,
    description: 'Вход выполнен',
    headers: SET_COOKIE_HEADER,
  })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, {
    status: HttpStatus.UNAUTHORIZED,
    // Один код и на несуществующий email, и на неверный пароль; отдельно —
    // «email не подтверждён»: по нему фронт предлагает переотправку письма.
    codes: [
      {
        code: AUTH_ERROR_CODE.INVALID_CREDENTIALS,
        message: AUTH_ERROR_MESSAGE.INVALID_CREDENTIALS,
      },
      {
        code: AUTH_ERROR_CODE.EMAIL_NOT_CONFIRMED,
        message: AUTH_ERROR_MESSAGE.EMAIL_NOT_CONFIRMED,
      },
    ],
  })
  async login(
    @Body() dto: LoginDto,
    // `passthrough` обязателен: без него Nest перестаёт сериализовать
    // возвращаемое значение и запрос повисает.
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponseDto> {
    const { accessToken, refreshToken } = await sendRpc<
      LoginResult,
      LoginCommand
    >(this.authClient, AUTH_PATTERN.LOGIN, {
      email: dto.email,
      password: dto.password,
    });

    response.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      refreshCookieOptions(this.isProduction),
    );

    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Выход из аккаунта',
    description:
      'Гасит cookie с refresh-токеном. Токена в заголовке не требует и всегда ' +
      'отвечает 200 — выйти нужно уметь и тогда, когда access-токен уже ' +
      'протух. Сам access-токен остаётся валидным до конца своего срока: ' +
      'сервер его не отзывает, фронтенду нужно стереть токен у себя.',
  })
  @ApiOkResponse({
    type: LogoutResponseDto,
    description: 'Выход выполнен',
    headers: SET_COOKIE_HEADER,
  })
  logout(@Res({ passthrough: true }) response: Response): LogoutResponseDto {
    response.clearCookie(
      REFRESH_TOKEN_COOKIE,
      clearRefreshCookieOptions(this.isProduction),
    );

    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Профиль текущего пользователя',
    description:
      'Требует заголовок `Authorization: Bearer <accessToken>`. По коду ' +
      '`TOKEN_EXPIRED` токен нужно молча обновить, по `UNAUTHORIZED` — ' +
      'показать форму входа.',
  })
  @ApiOkResponse({ type: UserProfileDto, description: 'Профиль пользователя' })
  @ApiErrorResponses({
    status: HttpStatus.UNAUTHORIZED,
    codes: [
      {
        code: AUTH_ERROR_CODE.TOKEN_EXPIRED,
        message: AUTH_ERROR_MESSAGE.TOKEN_EXPIRED,
      },
      {
        code: ERROR_CODE.UNAUTHORIZED,
        message: errorMessageByStatus(HttpStatus.UNAUTHORIZED),
      },
    ],
  })
  me(@CurrentUser() user: AuthenticatedUser): UserProfileDto {
    return user;
  }

  private get isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
