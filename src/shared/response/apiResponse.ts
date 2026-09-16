export class ApiResponse<T> {
  private status: number;
  private success: boolean;
  private data: T;
  private message: string;
  private timestamp: Date;

  constructor(status: number, success: boolean, data: T, message: string) {
    this.status = status;
    this.success = success;
    this.data = data;
    this.message = message;
    this.timestamp = new Date();
  }

  public getStatus(): number {
    return this.status;
  }

  public getSuccess(): boolean {
    return this.success;
  }

  public getData(): T {
    return this.data;
  }

  public getMessage(): string {
    return this.message;
  }

  public getTimestamp(): Date {
    return this.timestamp;
  }
}
