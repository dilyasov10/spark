import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { RpcExceptionsFilter } from '@app/common';
import type { JwtExpiresIn } from '@app/common';
import { PrismaModule } from '@app/prisma';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * Дефолтным секретом модуля становится access — refresh подписывается явным
 * оверрайдом в `AuthService`.
 *
 * Фильтр регистрируется здесь, а не в `main.ts`, — чтобы тесты, поднимающие
 * модуль, получали тот же формат ошибок, что и рантайм.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
    { provide: APP_FILTER, useClass: RpcExceptionsFilter },
  ],
})
export class AuthModule {}
