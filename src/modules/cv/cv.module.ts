import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
import { LlmModule } from '../../shared/llm/llm.module';
import { CvController } from './api/cv.controller';
import { ICvFileStorage } from './application/interfaces/cv-file-storage.interface';
import { ICvParser } from './application/interfaces/cv-parser.interface';
import { ICvTextExtractor } from './application/interfaces/cv-text-extractor.interface';
import { ICvService } from './application/interfaces/cv.service.interface';
import { CvService } from './application/services/cv.service';
import { ICvManagementRepository } from './domain/repositories/cv-management.repo.interface';
import { ICvRepository } from './domain/repositories/cv.repo.interface';
import { CloudinaryFileStorage } from './infrastructure/cloudinary-file-storage';
import { CvRepository } from './infrastructure/cv.repo';
import { LlmCvParser } from './infrastructure/llm-cv-parser';
import { UnpdfTextExtractor } from './infrastructure/unpdf-text-extractor';

@Module({
  imports: [
    LlmModule,
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
    { provide: ICvTextExtractor, useClass: UnpdfTextExtractor },
    { provide: ICvParser, useClass: LlmCvParser },
  ],
  // Other modules only get the narrow contract.
  exports: [ICvRepository],
})
export class CvModule {}
