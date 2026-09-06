import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailModule } from './mailler/mail.module';
import { GithubOAuthService } from './oauth/github-oauth.service';
import { GoogleOAuthService } from './oauth/google-oauth.service';
import { RecaptchaService } from './recaptcha/recaptcha.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import type { JwtExpiresIn } from './types/jwt-payload';

/**
 * `PrismaModule` не импортируется намеренно: он помечен `@Global()`.
 *
 * Дефолтным секретом модуля становится access — refresh подписывается явным
 * оверрайдом в `AuthService`.
 *
 * `MailModule` нужен регистрации (письмо с кодом подтверждения).
 * `RecaptchaService` — проверка токена на password-recovery.
 * `GoogleOAuthService` / `GithubOAuthService` — обмен code на профиль.
 */
@Module({
  imports: [
    PassportModule,
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<JwtExpiresIn>(
            'JWT_ACCESS_EXPIRES_IN',
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RecaptchaService,
    GoogleOAuthService,
    GithubOAuthService,
  ],
})
export class AuthModule {}
