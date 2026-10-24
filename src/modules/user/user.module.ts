import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
import { UserProfileController } from './api/user-profile.controller';
import { IAvatarStorage } from './application/interfaces/avatar-storage.interface';
import { IUserProfileService } from './application/interfaces/user-profile.service.interface';
import { UserProfileService } from './application/services/user-profile.service';
import { IUserRepository } from './domain/repositories/user.repo.interface';
import { CloudinaryAvatarStorage } from './infrastructure/cloudinary-avatar-storage';
import { UserRepository } from './infrastructure/user.repo';

@Module({
  imports: [
    // JwtAuthGuard gọi verifyAsync không truyền secret nên secret phải nằm ở đây
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [UserProfileController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    {
      provide: IUserRepository,
      useClass: UserRepository,
    },
    {
      provide: IUserProfileService,
      useClass: UserProfileService,
    },
    {
      provide: IAvatarStorage,
      useClass: CloudinaryAvatarStorage,
    },
  ],
  // Module khác (AuthModule) chỉ cần repo, không cần service của trang hồ sơ
  exports: [IUserRepository],
})
export class UserModule {}
