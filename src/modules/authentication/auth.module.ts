import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
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
import { IPasswordResetTokenStore } from './domain/repositories/password-reset-token-store.interface';
import { RedisPasswordResetTokenStore } from './infrastructure/redis-password-reset-token-store';

@Module({
  imports: [
    UserModule,
    // JwtAccessTokenIssuer tự truyền secret/expiresIn khi ký, nhưng JwtAuthGuard
    // (dùng cho password/change) gọi verifyAsync không truyền secret nên cần ở đây
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    {
      provide: IEmailOtpStore,
      useClass: RedisEmailOtpStore,
    },
    {
      provide: IPasswordResetOtpStore,
      useClass: RedisPasswordResetOtpStore,
    },
    {
      provide: IPasswordResetTokenStore,
      useClass: RedisPasswordResetTokenStore,
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
