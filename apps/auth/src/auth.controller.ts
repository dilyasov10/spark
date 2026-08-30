import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AUTH_PATTERN } from '@app/common';
import type {
  FindAuthenticatedUserQuery,
  FindAuthenticatedUserResult,
  LoginCommand,
  LoginResult,
} from '@app/common';
import { AuthService } from './auth.service';

/**
 * Точка входа микросервиса: HTTP-роутов здесь нет, наружу сервис доступен
 * только через очередь RabbitMQ. Валидация тела запроса и формат ответа —
 * забота gateway, сюда payload приходит уже проверенным.
 */
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(AUTH_PATTERN.LOGIN)
  login(@Payload() command: LoginCommand): Promise<LoginResult> {
    return this.authService.login(command);
  }

  @MessagePattern(AUTH_PATTERN.FIND_AUTHENTICATED_USER)
  findAuthenticatedUser(
    @Payload() query: FindAuthenticatedUserQuery,
  ): Promise<FindAuthenticatedUserResult> {
    return this.authService.findAuthenticatedUser(query.userId);
  }
}
