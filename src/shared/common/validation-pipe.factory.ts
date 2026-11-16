import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ErrorCode } from './errorCode';
import { mapValidationErrors } from './validation-error.mapper';

// One pipe config for HTTP (APP_PIPE) and WebSocket gateways, which do not
// inherit APP_PIPE and must attach it with @UsePipes.
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: ErrorCode.BadRequest,
        message: 'Request validation failed',
        errors: mapValidationErrors(errors),
      }),
  });
}
