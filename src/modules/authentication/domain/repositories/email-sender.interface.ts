import type { Result } from 'neverthrow';

export abstract class IEmailSender {
  abstract sendOtp(email: string, otp: string): Promise<Result<void, Error>>;
}
