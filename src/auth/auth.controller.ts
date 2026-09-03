import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppException } from '../common/errors/app.exception';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator';
import {
  ACCESS_TOKEN_COOKIE,
  OAUTH_GITHUB_STATE_COOKIE,
  OAUTH_GOOGLE_STATE_COOKIE,
  OAUTH_PROVIDER_GITHUB,
  OAUTH_PROVIDER_GOOGLE,
  REFRESH_TOKEN_COOKIE,
  accessCookieOptions,
  buildOAuthFrontendRedirectUrl,
  oauthStateCookieOptions,
  refreshCookieOptions,
} from './auth.constants';
import { AUTH_ERROR_CODE } from './auth.error-code';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { NewPasswordDto } from './dto/new-password.dto';
import { PasswordRecoveryDto } from './dto/password-recovery.dto';
import { RegistrationConfirmationDto } from './dto/registration-confirmation.dto';
import { RegistrationEmailResendingDto } from './dto/registration-email-resending.dto';
import { RegistrationDto } from './dto/registration.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GithubOAuthService } from './oauth/github-oauth.service';
import { GoogleOAuthService } from './oauth/google-oauth.service';
import type { AuthenticatedUser } from './types/jwt-payload';
import type { OAuthProfile, OAuthProviderName } from './types/oauth-profile';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly googleOAuthService: GoogleOAuthService,
    private readonly githubOAuthService: GithubOAuthService,
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
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Вход по email и паролю',
    description:
      'Ставит accessToken и refreshToken httpOnly-cookie. Тело ответа пустое.',
  })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Вход выполнен, токены в cookie',
  })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const tokens = await this.authService.login(dto);
    this.setAuthCookies(response, tokens);
  }

  @Get('oauth/google')
  @ApiOperation({
    summary: 'Вход через Google',
    description:
      'Редирект на страницу авторизации Google. После согласия браузер вернётся ' +
      'на /api/auth/oauth/google/callback.',
  })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirect на accounts.google.com',
  })
  startGoogleOAuth(@Res() response: Response): void {
    this.startOAuth(response, OAUTH_GOOGLE_STATE_COOKIE, (state) =>
      this.googleOAuthService.buildAuthorizationUrl(state),
    );
  }

  @Get('oauth/google/callback')
  @ApiOperation({
    summary: 'Callback Google OAuth',
    description:
      'Меняет code на профиль Google, логинит пользователя и редиректит на фронт. ' +
      'Токены уходят httpOnly-cookie. При ошибке query содержит error с машинным кодом.',
  })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirect на FRONTEND_URL/auth/oauth',
  })
  async googleOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.finishOAuth({
      code,
      state,
      providerError,
      request,
      response,
      cookieName: OAUTH_GOOGLE_STATE_COOKIE,
      provider: OAUTH_PROVIDER_GOOGLE,
      fetchProfile: (oauthCode) =>
        this.googleOAuthService.fetchProfile(oauthCode),
    });
  }

  @Get('oauth/github')
  @ApiOperation({
    summary: 'Вход через GitHub',
    description:
      'Редирект на страницу авторизации GitHub. После согласия браузер вернётся ' +
      'на /api/auth/oauth/github/callback.',
  })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirect на github.com/login/oauth/authorize',
  })
  startGithubOAuth(@Res() response: Response): void {
    this.startOAuth(response, OAUTH_GITHUB_STATE_COOKIE, (state) =>
      this.githubOAuthService.buildAuthorizationUrl(state),
    );
  }

  @Get('oauth/github/callback')
  @ApiOperation({
    summary: 'Callback GitHub OAuth',
    description:
      'Меняет code на профиль GitHub, логинит пользователя и редиректит на фронт. ' +
      'Токены уходят httpOnly-cookie. При ошибке query содержит error с машинным кодом.',
  })
  @ApiResponse({
    status: HttpStatus.FOUND,
    description: 'Redirect на FRONTEND_URL/auth/oauth',
  })
  async githubOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.finishOAuth({
      code,
      state,
      providerError,
      request,
      response,
      cookieName: OAUTH_GITHUB_STATE_COOKIE,
      provider: OAUTH_PROVIDER_GITHUB,
      fetchProfile: (oauthCode) =>
        this.githubOAuthService.fetchProfile(oauthCode),
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('accessToken')
  @ApiOperation({
    summary: 'Профиль текущего пользователя',
    description: 'Access-токен читается из httpOnly-cookie `accessToken`.',
  })
  @ApiOkResponse({ type: UserProfileDto, description: 'Профиль пользователя' })
  @ApiErrorResponses(HttpStatus.UNAUTHORIZED)
  me(@CurrentUser() user: AuthenticatedUser): UserProfileDto {
    return user;
  }

  private get isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private startOAuth(
    response: Response,
    cookieName: string,
    buildAuthorizationUrl: (state: string) => string,
  ): void {
    const state = randomUUID();
    response.cookie(
      cookieName,
      state,
      oauthStateCookieOptions(this.isProduction),
    );
    response.redirect(buildAuthorizationUrl(state));
  }

  private async finishOAuth(params: {
    code: string | undefined;
    state: string | undefined;
    providerError: string | undefined;
    request: Request;
    response: Response;
    cookieName: string;
    provider: OAuthProviderName;
    fetchProfile: (code: string) => Promise<OAuthProfile>;
  }): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const redirectToFrontend = (error?: string): void => {
      params.response.redirect(
        buildOAuthFrontendRedirectUrl(frontendUrl, error),
      );
    };

    if (params.providerError || !params.code) {
      redirectToFrontend(AUTH_ERROR_CODE.OAUTH_FAILED);
      return;
    }

    const expectedState = params.request.cookies?.[params.cookieName] as
      string | undefined;
    if (!params.state || params.state !== expectedState) {
      redirectToFrontend(AUTH_ERROR_CODE.OAUTH_FAILED);
      return;
    }

    params.response.clearCookie(
      params.cookieName,
      oauthStateCookieOptions(this.isProduction),
    );

    try {
      const profile = await params.fetchProfile(params.code);
      const tokens = await this.authService.loginWithOAuth(
        params.provider,
        profile,
      );

      this.setAuthCookies(params.response, tokens);
      redirectToFrontend();
    } catch (error) {
      const errorCode =
        error instanceof AppException
          ? error.code
          : AUTH_ERROR_CODE.OAUTH_FAILED;
      redirectToFrontend(errorCode);
    }
  }

  private setAuthCookies(
    response: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    response.cookie(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      accessCookieOptions(this.isProduction),
    );
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      refreshCookieOptions(this.isProduction),
    );
  }
}
