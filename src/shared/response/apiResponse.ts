import { ErrorCode } from '../common/errorCode';

export class ApiSuccessResponse<T> {
  readonly statusCode: number;
  readonly success = true as const;
  readonly data: T;
  readonly message: string;
  readonly timestamp: string;

  constructor(statusCode: number, data: T, message: string) {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }
}

export class ApiErrorResponse {
  readonly statusCode: number;
  readonly success = false as const;
  readonly code: ErrorCode;
  readonly message: string;
  readonly errors?: ValidationErrorDetail[];
  readonly path: string;
  readonly timestamp: string;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    path: string,
    errors?: ValidationErrorDetail[],
  ) {
    this.statusCode = statusCode;
    this.code = code;
    this.message = message;
    this.errors = errors;
    this.path = path;
    this.timestamp = new Date().toISOString();
  }
}

export type ValidationErrorDetail = {
  field: string;
  messages: string[];
};
