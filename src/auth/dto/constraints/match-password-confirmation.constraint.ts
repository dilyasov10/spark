import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'matchPasswordConfirmation', async: false })
export class MatchPasswordConfirmationConstraint implements ValidatorConstraintInterface {
  validate(passwordConfirmation: unknown, args: ValidationArguments): boolean {
    const object = args.object as { password?: string };
    return (
      typeof passwordConfirmation === 'string' &&
      passwordConfirmation === object.password
    );
  }

  defaultMessage(): string {
    return 'Пароли не совпадают';
  }
}
