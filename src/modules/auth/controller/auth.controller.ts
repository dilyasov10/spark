import { Controller, HttpCode, HttpStatus, Post, Body } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../common/swagger/api-error-responses.decorator';
import { RegistrationConfirmationDto } from '../dto/registration-confirmation.dto';
import { RegistrationEmailResendingDto } from '../dto/registration-email-resending.dto';
import { RegistrationDto } from '../dto/registration.dto';
import { AuthService } from '../service/auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('registration')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register a new user and send confirmation email' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'User created' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async registration(@Body() dto: RegistrationDto): Promise<void> {
    await this.authService.registration(dto);
  }

  @Post('registration-confirmation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirm email with code from the letter' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Email confirmed',
  })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async registrationConfirmation(
    @Body() dto: RegistrationConfirmationDto,
  ): Promise<void> {
    await this.authService.registrationConfirmation(dto);
  }

  @Post('registration-email-resending')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Resend confirmation email' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Confirmation email resent',
  })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async registrationEmailResending(
    @Body() dto: RegistrationEmailResendingDto,
  ): Promise<void> {
    await this.authService.registrationEmailResending(dto);
  }
}
