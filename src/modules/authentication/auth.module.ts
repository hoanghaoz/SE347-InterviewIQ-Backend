import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
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
import { IAccessTokenIssuer } from './domain/repositories/access-token-issuer.interface';
import { JwtAccessTokenIssuer } from './infrastructure/jwt-access-token-issuer';
import { ITokenHasher } from './domain/repositories/token-hasher.interface';
import { Sha256TokenHasher } from './infrastructure/sha256-token-hasher';
import { IRefreshTokenRepository } from './domain/repositories/refresh-token.repo.interface';
import { RefreshTokenRepository } from './infrastructure/refresh-token.repo';
import { IPasswordResetOtpStore } from './domain/repositories/password-reset-otp-store.interface';
import { RedisPasswordResetOtpStore } from './infrastructure/redis-password-reset-otp-store';

@Module({
  // JwtAccessTokenIssuer tự truyền secret/expiresIn khi ký nên không cấu hình ở đây
  imports: [UserModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    {
      provide: IEmailOtpStore,
      useClass: RedisEmailOtpStore,
    },
    {
      provide: IPasswordResetOtpStore,
      useClass: RedisPasswordResetOtpStore,
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
    {
      provide: IAccessTokenIssuer,
      useClass: JwtAccessTokenIssuer,
    },
    {
      provide: ITokenHasher,
      useClass: Sha256TokenHasher,
    },
    {
      provide: IRefreshTokenRepository,
      useClass: RefreshTokenRepository,
    },
  ],
  exports: [
    IEmailOtpStore,
    IPendingRegistrationStore,
    IPasswordHasher,
    IEmailSender,
    IAuthService,
    IAccessTokenIssuer,
  ],
})
export class AuthModule {}
