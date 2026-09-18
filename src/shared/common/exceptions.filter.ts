import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiErrorResponse,
  ValidationErrorDetail,
} from '../response/apiResponse';
import { ErrorCode } from './errorCode';

type ExceptionResponse = {
  code?: unknown;
  message?: unknown;
  errors?: unknown;
};

const STATUS_ERROR_CODE_MAP: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.UNAUTHORIZED]: ErrorCode.Unauthorized,
  [HttpStatus.FORBIDDEN]: ErrorCode.Forbidden,
  [HttpStatus.NOT_FOUND]: ErrorCode.NotFound,
  [HttpStatus.CONFLICT]: ErrorCode.Conflict,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TooManyRequests,
};

function getErrorCode(statusCode: number, code: unknown): ErrorCode {
  if (
    typeof code === 'string' &&
    Object.values(ErrorCode).includes(code as ErrorCode)
  ) {
    return code as ErrorCode;
  }

  const mappedCode = STATUS_ERROR_CODE_MAP[statusCode];

  if (mappedCode !== undefined) {
    return mappedCode;
  }

  return statusCode >= 500
    ? ErrorCode.InternalServerError
    : ErrorCode.BadRequest;
}

function isValidationErrorDetails(
  errors: unknown,
): errors is ValidationErrorDetail[] {
  if (!Array.isArray(errors)) {
    return false;
  }

  return errors.every((error: unknown) => {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const detail = error as Record<string, unknown>;

    return (
      typeof detail.field === 'string' &&
      Array.isArray(detail.messages) &&
      detail.messages.every((message: unknown) => typeof message === 'string')
    );
  });
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const payload: ExceptionResponse =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? exceptionResponse
        : {};

    const code = getErrorCode(statusCode, payload.code);
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : exception instanceof HttpException &&
            typeof exceptionResponse === 'string'
          ? exceptionResponse
          : 'Internal Server Error';
    const errors = isValidationErrorDetails(payload.errors)
      ? payload.errors
      : undefined;

    if (exception instanceof Error) {
      this.logger.error(
        `[${request.method}] ${request.path} - Status: ${statusCode} - Lỗi: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `[${request.method}] ${request.path} - Lỗi không xác định`,
        exception,
      );
    }

    response
      .status(statusCode)
      .json(
        new ApiErrorResponse(statusCode, code, message, request.path, errors),
      );
  }
}
