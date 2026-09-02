import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODE } from '../../common/errors/error-code';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const user = this.configService.getOrThrow<string>('EMAIL_USER');
    const pass = this.configService.getOrThrow<string>('EMAIL_PASS');

    this.from = `"Spark" <${user}>`;
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  async sendRegistrationConfirmation(
    email: string,
    confirmUrl: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Spark — confirm your email',
        text: `Confirm your registration: ${confirmUrl}`,
        html: `<p>Confirm your registration:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
      });

      this.logger.log(`Confirmation email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Email send failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new AppException({
        code: ERROR_CODE.BAD_REQUEST,
        message: 'Не удалось отправить письмо',
      });
    }
  }

  async sendPasswordRecovery(
    email: string,
    recoveryUrl: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: 'Spark — восстановление пароля',
        text: `Чтобы задать новый пароль, перейдите по ссылке: ${recoveryUrl}`,
        html: `<p>Чтобы задать новый пароль, перейдите по ссылке:</p><p><a href="${recoveryUrl}">${recoveryUrl}</a></p>`,
      });

      this.logger.log(`Password recovery email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Email send failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new AppException({
        code: ERROR_CODE.BAD_REQUEST,
        message: 'Не удалось отправить письмо',
      });
    }
  }
}
