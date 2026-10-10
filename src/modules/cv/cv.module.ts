import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
import { CvController } from './api/cv.controller';
import { ICvFileStorage } from './application/interfaces/cv-file-storage.interface';
import { ICvService } from './application/interfaces/cv.service.interface';
import { CvService } from './application/services/cv.service';
import { ICvManagementRepository } from './domain/repositories/cv-management.repo.interface';
import { ICvRepository } from './domain/repositories/cv.repo.interface';
import { CloudinaryFileStorage } from './infrastructure/cloudinary-file-storage';
import { CvRepository } from './infrastructure/cv.repo';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [CvController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    // One CvRepository instance serves both contracts.
    CvRepository,
    { provide: ICvRepository, useExisting: CvRepository },
    { provide: ICvManagementRepository, useExisting: CvRepository },
    { provide: ICvService, useClass: CvService },
    { provide: ICvFileStorage, useClass: CloudinaryFileStorage },
  ],
  // Other modules only get the narrow contract.
  exports: [ICvRepository],
})
export class CvModule {}
