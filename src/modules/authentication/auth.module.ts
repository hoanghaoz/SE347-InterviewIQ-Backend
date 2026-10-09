import { Module } from '@nestjs/common';
import { IEmailOtpStore } from './domain/repositories/email-otp-store.interface';
import { RedisEmailOtpStore } from './infrastructure/redis-email-otp-store';
import { IPendingRegistrationStore } from './domain/repositories/pending-registration-store.interface';
import { RedisPendingRegistrationStore } from './infrastructure/redis-pending-registration-store';

@Module({
  controllers: [],
  providers: [
    {
      provide: IEmailOtpStore,
      useClass: RedisEmailOtpStore,
    },
    {
      provide: IPendingRegistrationStore,
      useClass: RedisPendingRegistrationStore,
    },
  ],
  exports: [IEmailOtpStore, IPendingRegistrationStore],
})
export class AuthModule {}
