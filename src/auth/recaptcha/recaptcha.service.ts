import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { AUTH_ERROR_CODE, AUTH_ERROR_MESSAGE } from '../auth.error-code';

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

interface SiteVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Проверка Google reCAPTCHA v2 (checkbox).
 * При `RECAPTCHA_ENABLED=false` вызов Google пропускается (local / tests).
 */
@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);

  constructor(private readonly configService: ConfigService) {}

  async verify(token: string): Promise<void> {
    const enabled =
      this.configService.get<string>('RECAPTCHA_ENABLED') === 'true';

    if (!enabled) {
      this.logger.debug('reCAPTCHA disabled — skip verify');
      return;
    }

    const secret = this.configService.getOrThrow<string>(
      'RECAPTCHA_SECRET_KEY',
    );

    let payload: SiteVerifyResponse;
    try {
      const body = new URLSearchParams({
        secret,
        response: token,
      });

      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      payload = (await response.json()) as SiteVerifyResponse;
    } catch (error) {
      this.logger.error(
        `reCAPTCHA siteverify failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw this.failedException();
    }

    if (!payload.success) {
      this.logger.warn(
        `reCAPTCHA rejected: ${(payload['error-codes'] ?? []).join(', ') || 'unknown'}`,
      );
      throw this.failedException();
    }
  }

  private failedException(): AppException {
    return new AppException({
      code: AUTH_ERROR_CODE.RECAPTCHA_FAILED,
      message: AUTH_ERROR_MESSAGE.RECAPTCHA_FAILED,
      status: HttpStatus.BAD_REQUEST,
      details: [
        {
          field: 'recaptchaToken',
          message: AUTH_ERROR_MESSAGE.RECAPTCHA_FAILED,
        },
      ],
    });
  }
}
