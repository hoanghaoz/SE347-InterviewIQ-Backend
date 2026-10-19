import { Injectable } from '@nestjs/common';
import { IPasswordResetOtpStore } from '../domain/repositories/password-reset-otp-store.interface';
import { RedisEmailOtpStore } from './redis-email-otp-store';

@Injectable()
export class RedisPasswordResetOtpStore
  extends RedisEmailOtpStore
  implements IPasswordResetOtpStore
{
  protected readonly purpose = 'reset-password';
}
