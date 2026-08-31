import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { NOTIFICATIONS_PATTERN } from '@app/common';
import type { SendEmailCommand, SendEmailResult } from '@app/common';
import { NotificationsService } from './notifications.service';

/**
 * Наружу сервис доступен только через очередь RabbitMQ.
 *
 * Отправка сделана запросом-ответом, а не событием: вызывающему нужно знать,
 * что письмо ушло, — на событии отказ SMTP остался бы только в наших логах.
 */
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @MessagePattern(NOTIFICATIONS_PATTERN.SEND_EMAIL)
  sendEmail(@Payload() command: SendEmailCommand): Promise<SendEmailResult> {
    return this.notificationsService.sendEmail(command);
  }
}
