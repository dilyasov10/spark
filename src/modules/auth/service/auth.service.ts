import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AppException } from '../../../common/errors/app.exception';
import { ERROR_CODE } from '../../../common/errors/error-code';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../mail/email.service';
import {
  BCRYPT_SALT_ROUNDS,
  EMAIL_CONFIRMATION_TTL_MS,
} from '../dto/constraints/registration.constraints';
import { RegistrationConfirmationDto } from '../dto/registration-confirmation.dto';
import { RegistrationEmailResendingDto } from '../dto/registration-email-resending.dto';
import { RegistrationDto } from '../dto/registration.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  async registration(dto: RegistrationDto): Promise<void> {
    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const existingByUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });

    if (existingByEmail?.isConfirmed) {
      throw new AppException({
        code: ERROR_CODE.EMAIL_ALREADY_EXISTS,
        message: 'User with this email is already registered',
        details: [{ field: 'email', message: 'Email is already taken' }],
      });
    }

    if (existingByUsername?.isConfirmed) {
      throw new AppException({
        code: ERROR_CODE.USERNAME_ALREADY_EXISTS,
        message: 'User with this username is already registered',
        details: [{ field: 'username', message: 'Username is already taken' }],
      });
    }

    // Unconfirmed user with same email/username — replace (plan UC-1).
    const idsToDelete = new Set<string>();
    if (existingByEmail && !existingByEmail.isConfirmed) {
      idsToDelete.add(existingByEmail.id);
    }
    if (existingByUsername && !existingByUsername.isConfirmed) {
      idsToDelete.add(existingByUsername.id);
    }
    for (const id of idsToDelete) {
      await this.prisma.user.delete({ where: { id } });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const code = randomUUID();
    const expiresAt = new Date(Date.now() + EMAIL_CONFIRMATION_TTL_MS);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        isConfirmed: false,
        emailConfirmation: {
          create: { code, expiresAt },
        },
      },
    });

    await this.sendConfirmationEmail(user.email, code);
  }

  async registrationConfirmation(
    dto: RegistrationConfirmationDto,
  ): Promise<void> {
    const confirmation = await this.prisma.emailConfirmation.findUnique({
      where: { code: dto.code },
      include: { user: true },
    });

    if (!confirmation) {
      throw new AppException({
        code: ERROR_CODE.CONFIRMATION_CODE_INVALID,
        message: 'Confirmation code is invalid',
        details: [{ field: 'code', message: 'Invalid confirmation code' }],
      });
    }

    if (confirmation.expiresAt.getTime() < Date.now()) {
      throw new AppException({
        code: ERROR_CODE.CONFIRMATION_CODE_EXPIRED,
        message: 'Confirmation link has expired',
        details: [{ field: 'code', message: 'Confirmation code has expired' }],
      });
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: confirmation.userId },
        data: { isConfirmed: true },
      }),
      this.prisma.emailConfirmation.delete({
        where: { id: confirmation.id },
      }),
    ]);
  }

  async registrationEmailResending(
    dto: RegistrationEmailResendingDto,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { emailConfirmation: true },
    });

    if (!user) {
      throw new AppException({
        code: ERROR_CODE.USER_NOT_FOUND,
        message: 'User not found',
        // Без явного статуса AppException отдал бы 400, а по правилу 6
        // «ресурс не найден» — это 404.
        status: HttpStatus.NOT_FOUND,
        details: [{ field: 'email', message: 'User not found' }],
      });
    }

    if (user.isConfirmed) {
      throw new AppException({
        code: ERROR_CODE.EMAIL_ALREADY_CONFIRMED,
        message: 'Email is already confirmed',
        details: [{ field: 'email', message: 'Email is already confirmed' }],
      });
    }

    const code = randomUUID();
    const expiresAt = new Date(Date.now() + EMAIL_CONFIRMATION_TTL_MS);

    await this.prisma.emailConfirmation.upsert({
      where: { userId: user.id },
      create: { userId: user.id, code, expiresAt },
      update: { code, expiresAt },
    });

    await this.sendConfirmationEmail(user.email, code);
  }

  private async sendConfirmationEmail(
    email: string,
    code: string,
  ): Promise<void> {
    const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
    const confirmUrl = `${frontendUrl}/auth/registration-confirmation?code=${code}`;

    await this.emailService.sendRegistrationConfirmation(email, confirmUrl);
  }
}
