import { HttpStatus } from '@nestjs/common';
import { toHttpException } from './app-error.mapper';
import { AppError, ErrorCode } from './errorCode';

describe('toHttpException', () => {
  it.each([
    [ErrorCode.BadRequest, HttpStatus.BAD_REQUEST],
    [ErrorCode.Conflict, HttpStatus.CONFLICT],
    [ErrorCode.NotFound, HttpStatus.NOT_FOUND],
    [ErrorCode.Unauthorized, HttpStatus.UNAUTHORIZED],
    [ErrorCode.Forbidden, HttpStatus.FORBIDDEN],
    [ErrorCode.TooManyRequests, HttpStatus.TOO_MANY_REQUESTS],
    [ErrorCode.InternalServerError, HttpStatus.INTERNAL_SERVER_ERROR],
  ])('maps %s to HTTP status %s', (code, statusCode) => {
    const exception = toHttpException(new AppError(code, 'Test error'));

    expect(exception.getStatus()).toBe(statusCode);
    expect(exception.getResponse()).toEqual({
      code,
      message: 'Test error',
    });
  });
});
