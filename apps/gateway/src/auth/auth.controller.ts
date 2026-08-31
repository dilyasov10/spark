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
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AUTH_PATTERN,
  ApiErrorResponses,
  RMQ_CLIENT,
  sendRpc,
} from '@app/common';
import type { AuthenticatedUser, LoginCommand, LoginResult } from '@app/common';
import {
  REFRESH_TOKEN_COOKIE,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from './auth.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(RMQ_CLIENT.AUTH) private readonly authClient: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

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
  @ApiOkResponse({ type: LogoutResponseDto, description: 'Выход выполнен' })
  logout(@Res({ passthrough: true }) response: Response): LogoutResponseDto {
    // Без `JwtAuthGuard` намеренно. Отзывать на сервере нечего — refresh-токен
    // нигде не хранится, — так что гарда добавила бы только 401 на протухшем
    // токене: пользователь остался бы с живой cookie и без способа её погасить.
    // Худшее, что даёт открытый эндпоинт, — чужой сайт может разлогинить
    // пользователя; данных это не раскрывает и прав не даёт.
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
