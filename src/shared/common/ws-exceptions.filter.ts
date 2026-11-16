import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiErrorResponse } from '../response/apiResponse';
import { getErrorCode, isValidationErrorDetails } from './exceptions.filter';

type ExceptionResponse = {
  code?: unknown;
  message?: unknown;
  errors?: unknown;
};

// WebSocket twin of AllExceptionsFilter: the error is sent through the
// message's ack callback with the same `ApiErrorResponse` shape as HTTP, and
// `path` carries the event name. Handler args are [client, data, ack, pattern].
@Catch()
export class WsAllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(WsAllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ack = host.getArgByIndex<unknown>(2) as
      | ((response: ApiErrorResponse) => void)
      | undefined;
    const pattern = host.getArgByIndex<unknown>(3);
    const event = typeof pattern === 'string' ? pattern : 'unknown';

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
        : 'Internal Server Error';
    const errors = isValidationErrorDetails(payload.errors)
      ? payload.errors
      : undefined;

    this.logger.error(
      `[WS] ${event} - Status: ${statusCode} - ${
        exception instanceof Error ? exception.message : 'Unknown error'
      }`,
      exception instanceof Error ? exception.stack : undefined,
    );

    if (typeof ack === 'function') {
      ack(new ApiErrorResponse(statusCode, code, message, event, errors));
    }
  }
}
