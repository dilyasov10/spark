import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'matchPasswordConfirmation', async: false })
export class MatchPasswordConfirmationConstraint implements ValidatorConstraintInterface {
  validate(passwordConfirmation: unknown, args: ValidationArguments): boolean {
    // RegistrationDto — `password`, NewPasswordDto — `newPassword`.
    const object = args.object as {
      password?: string;
      newPassword?: string;
    };
    const password = object.password ?? object.newPassword;
    return (
      typeof passwordConfirmation === 'string' &&
      passwordConfirmation === password
    );
  }

  defaultMessage(): string {
    return 'Пароли не совпадают';
  }
}
