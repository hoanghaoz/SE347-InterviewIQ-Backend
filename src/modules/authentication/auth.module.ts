import { Module } from '@nestjs/common';
import { IEmailOtpStore } from './domain/repositories/email-otp-store.interface';
import { RedisEmailOtpStore } from './infrastructure/redis-email-otp-store';
import { IPendingRegistrationStore } from './domain/repositories/pending-registration-store.interface';
import { RedisPendingRegistrationStore } from './infrastructure/redis-pending-registration-store';
import { IPasswordHasher } from './domain/repositories/password-hasher.interface';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { SmtpEmailSender } from './infrastructure/smtp-email-sender';
import { IEmailSender } from './domain/repositories/email-sender.interface';
import { AuthService } from './application/services/auth.service';
import { IAuthService } from './application/interfaces/auth.service.interface';
import { UserModule } from '../user/user.module';
import { AuthController } from './api/auth.controller';

@Module({
  imports: [UserModule],
  controllers: [AuthController],
  providers: [
    {
      provide: IEmailOtpStore,
      useClass: RedisEmailOtpStore,
    },
    {
      provide: IPendingRegistrationStore,
      useClass: RedisPendingRegistrationStore,
    },
    {
      provide: IPasswordHasher,
      useClass: BcryptPasswordHasher,
    },
    {
      provide: IEmailSender,
      useClass: SmtpEmailSender,
    },
    {
      provide: IAuthService,
      useClass: AuthService,
    },
  ],
  exports: [
    IEmailOtpStore,
    IPendingRegistrationStore,
    IPasswordHasher,
    IEmailSender,
    IAuthService,
  ],
})
export class AuthModule {}
