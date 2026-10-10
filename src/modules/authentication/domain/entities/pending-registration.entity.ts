export class PendingRegistration {
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
  createdAt: Date;
}
