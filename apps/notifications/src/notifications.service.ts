import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { AppException } from '@app/common';
import type { SendEmailCommand, SendEmailResult } from '@app/common';
import { NOTIFICATIONS_ERROR_CODE } from './notifications.error-code';

/**
 * `MailerService.sendMail` типизирован как `any`, поэтому ответ разбираем
 * вручную: нас интересует только идентификатор письма.
 */
function extractMessageId(info: unknown): string {
  if (
    typeof info === 'object' &&
    info !== null &&
    'messageId' in info &&
    typeof info.messageId === 'string'
  ) {
    return info.messageId;
  }

  // SMTP-сервер обязан вернуть Message-ID, но письмо уже ушло — падать здесь
  // значит сообщить об ошибке там, где ошибки не было.
  return '';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly mailerService: MailerService) {}

  /**
   * Отправляет письмо через SMTP.
   *
   * @throws AppException `EMAIL_DELIVERY_FAILED` со статусом 502
   */
  async sendEmail({
    to,
    subject,
    html,
  }: SendEmailCommand): Promise<SendEmailResult> {
    try {
      const info: unknown = await this.mailerService.sendMail({
        to,
        subject,
        html,
      });

      return { messageId: extractMessageId(info) };
    } catch (error: unknown) {
      // Адрес в лог не пишем: почта — персональные данные, а в логах она
      // переживёт и само письмо.
      this.logger.error(
        `Не удалось отправить письмо «${subject}»`,
        error instanceof Error ? error.stack : String(error),
      );

      throw new AppException({
        code: NOTIFICATIONS_ERROR_CODE.EMAIL_DELIVERY_FAILED,
        message: 'Не удалось отправить письмо. Попробуйте позже',
        // Отказал внешний SMTP, а не наш код, — 502 честнее, чем 500.
        status: HttpStatus.BAD_GATEWAY,
      });
    }
  }
}
