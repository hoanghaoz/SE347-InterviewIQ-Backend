import { HttpException, HttpStatus } from '@nestjs/common';
import { AppError, ErrorCode } from './errorCode';

export interface HttpErrorPayload {
  code: ErrorCode;
  message: string;
}

const ERROR_STATUS_MAP: Record<ErrorCode, HttpStatus> = {
  [ErrorCode.Conflict]: HttpStatus.CONFLICT,
  [ErrorCode.NotFound]: HttpStatus.NOT_FOUND,
  [ErrorCode.BadRequest]: HttpStatus.BAD_REQUEST,
  [ErrorCode.InternalServerError]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.TooManyRequests]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.Unauthorized]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.Forbidden]: HttpStatus.FORBIDDEN,
};

/**
 * Translates a domain/application `AppError` into the matching Nest HTTP
 * exception. Controllers use this in `result.match(...)` so the error channel
 * of a `Result` becomes the correct HTTP status.
 */
export function toHttpException(error: AppError): HttpException {
  const payload: HttpErrorPayload = {
    code: error.code,
    message: error.message,
  };

  return new HttpException(payload, ERROR_STATUS_MAP[error.code]);
}
