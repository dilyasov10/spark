import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { ClientsModule } from '@nestjs/microservices';
import { RMQ_CLIENT, RMQ_QUEUE, rmqClientOptions } from '@app/common';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * HTTP-вход в авторизацию. Ни `JwtModule`, ни Prisma здесь нет: пароли
 * проверяет и токены выпускает auth-микросервис, gateway только принимает
 * запрос, валидирует тело и раскладывает ответ по cookie.
 *
 * Подпись access-токена при этом всё равно проверяется на месте, в
 * `JwtStrategy`: гонять каждый запрос через брокер ради `jwt.verify` — лишний
 * сетевой хоп на любом защищённом эндпоинте.
 */
@Module({
  imports: [
    PassportModule,
    ClientsModule.registerAsync([
      {
        name: RMQ_CLIENT.AUTH,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) =>
          rmqClientOptions({
            url: configService.getOrThrow<string>('RABBITMQ_URL'),
            queue: configService.get<string>(
              'RABBITMQ_AUTH_QUEUE',
              RMQ_QUEUE.AUTH,
            ),
          }),
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [JwtStrategy],
})
export class AuthModule {}
