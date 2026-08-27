import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/jwt-payload';

/**
 * Достаёт пользователя, которого положил в запрос `JwtAuthGuard`.
 * Работает только на роутах под гвардом — без него `request.user` пуст.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();

    return request.user;
  },
);
