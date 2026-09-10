import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { MailerModule } from '@nestjs-modules/mailer';
import { RpcExceptionsFilter } from '@app/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

const DEFAULT_SMTP_PORT = 587;
/** 465 — implicit TLS; на остальных портах соединение поднимается STARTTLS. */
const IMPLICIT_TLS_PORT = 465;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const port = configService.get<number>('MAIL_PORT', DEFAULT_SMTP_PORT);

        return {
          transport: {
            host: configService.getOrThrow<string>('MAIL_HOST'),
            port,
            secure: Number(port) === IMPLICIT_TLS_PORT,
            auth: {
              user: configService.getOrThrow<string>('MAIL_USER'),
              pass: configService.getOrThrow<string>('MAIL_PASSWORD'),
            },
          },
          defaults: {
            from: configService.getOrThrow<string>('MAIL_FROM'),
          },
        };
      },
    }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: APP_FILTER, useClass: RpcExceptionsFilter },
  ],
})
export class NotificationsModule {}
