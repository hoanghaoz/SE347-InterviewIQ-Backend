export class ApiResponse<T> {
  constructor(
    public status: number,
    public success: boolean,
    public data: T,
    public message: string,
    public timestamp: Date,
  ) {}
}
