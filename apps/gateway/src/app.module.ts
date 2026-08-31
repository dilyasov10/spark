import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter, createValidationPipe } from '@app/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';

/**
 * `PrismaModule` здесь больше нет: в базу ходят микросервисы, gateway знает
 * только HTTP и очереди.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
  controllers: [AppController],
  providers: [
    AppService,
    // Валидация и формат ошибок регистрируются здесь, а не в main.ts, —
    // тогда e2e-тесты поднимают приложение с тем же поведением.
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
