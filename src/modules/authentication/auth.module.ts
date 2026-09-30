import { Module } from '@nestjs/common';
import { IEmailOtpStore } from './domain/repositories/email-otp-store.interface';
import { RedisEmailOtpStore } from './infrastructure/redis-email-otp-store';

@Module({
  controllers: [],
  providers: [
    {
      provide: IEmailOtpStore,
      useClass: RedisEmailOtpStore,
    },
  ],
  exports: [IEmailOtpStore],
})
export class AuthModule {}
