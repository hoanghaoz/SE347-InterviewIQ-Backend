export class ApiSuccessResponse<T> {
  readonly statusCode: number;
  readonly success: boolean = true;
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
  readonly success: boolean = false;
  readonly errors: ValidationError[];
  readonly message: string;
  readonly path: string;
  readonly timestamp: string;

  constructor(
    statusCode: number,
    errors: ValidationError[],
    message: string,
    path: string,
  ) {
    this.statusCode = statusCode;
    this.errors = errors;
    this.message = message;
    this.path = path;
    this.timestamp = new Date().toISOString();
  }
}

export type ValidationError = {
  field: string;
  messages: string[];
};
