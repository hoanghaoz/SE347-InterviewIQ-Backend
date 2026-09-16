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
  readonly message: string;
  readonly timestamp: string;

  constructor(statusCode: number, message: string) {
    this.statusCode = statusCode;
    this.message = message;
    this.timestamp = new Date().toISOString();
  }
}
