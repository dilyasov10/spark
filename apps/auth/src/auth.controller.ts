import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AUTH_PATTERN } from '@app/common';
import type {
  FindAuthenticatedUserQuery,
  FindAuthenticatedUserResult,
  LoginCommand,
  LoginResult,
  NewPasswordCommand,
  PasswordRecoveryCommand,
  RegistrationCommand,
  RegistrationConfirmationCommand,
  RegistrationEmailResendingCommand,
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

  @MessagePattern(AUTH_PATTERN.REGISTRATION)
  registration(@Payload() command: RegistrationCommand): Promise<void> {
    return this.authService.registration(command);
  }

  @MessagePattern(AUTH_PATTERN.REGISTRATION_CONFIRMATION)
  registrationConfirmation(
    @Payload() command: RegistrationConfirmationCommand,
  ): Promise<void> {
    return this.authService.registrationConfirmation(command);
  }

  @MessagePattern(AUTH_PATTERN.REGISTRATION_EMAIL_RESENDING)
  registrationEmailResending(
    @Payload() command: RegistrationEmailResendingCommand,
  ): Promise<void> {
    return this.authService.registrationEmailResending(command);
  }

  @MessagePattern(AUTH_PATTERN.PASSWORD_RECOVERY)
  passwordRecovery(
    @Payload() command: PasswordRecoveryCommand,
  ): Promise<void> {
    return this.authService.passwordRecovery(command);
  }

  @MessagePattern(AUTH_PATTERN.NEW_PASSWORD)
  newPassword(@Payload() command: NewPasswordCommand): Promise<void> {
    return this.authService.newPassword(command);
  }
}
