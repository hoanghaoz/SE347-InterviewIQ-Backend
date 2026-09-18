import { ValidationError as ClassValidatorError } from 'class-validator';
import { ValidationErrorDetail } from '../response/apiResponse';

function buildFieldPath(parentPath: string, property: string): string {
  if (parentPath.length === 0) {
    return property;
  }

  return /^\d+$/.test(property)
    ? `${parentPath}[${property}]`
    : `${parentPath}.${property}`;
}

export function mapValidationErrors(
  errors: ClassValidatorError[],
  parentPath = '',
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = buildFieldPath(parentPath, error.property);
    const currentError = error.constraints
      ? [
          {
            field,
            messages: Object.values(error.constraints),
          },
        ]
      : [];
    const childErrors = mapValidationErrors(error.children ?? [], field);

    return [...currentError, ...childErrors];
  });
}
