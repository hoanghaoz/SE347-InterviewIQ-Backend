import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
import { CvModule } from '../cv/cv.module';
import { ScoringModule } from '../scoring/scoring.module';
import { InterviewController } from './api/interview.controller';
import { IInterviewService } from './application/interfaces/interview.service.interface';
import { InterviewService } from './application/services/interview.service';
import { IInterviewRepository } from './domain/repositories/interview.repo.interface';
import { InterviewRepository } from './infrastructure/interview.repo';
import { InterviewAnswerController } from './api/interview-answer.controller';
import { IInterviewAnswerService } from './application/interfaces/interview-answer.service.interface';
import { IInterviewVideoStorage } from './application/interfaces/interview-video-storage.interface';
import { InterviewAnswerService } from './application/services/interview-answer.service';
import { IInterviewAnswerRepository } from './domain/repositories/interview-answer.repo.interface';
import { CloudinaryInterviewVideoStorage } from './infrastructure/cloudinary-interview-video-storage';
import { InterviewAnswerRepository } from './infrastructure/interview-answer.repo';

@Module({
  imports: [
    ConfigModule,
    CvModule,
    ScoringModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [InterviewController, InterviewAnswerController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    { provide: IInterviewAnswerService, useClass: InterviewAnswerService },
    {
      provide: IInterviewAnswerRepository,
      useClass: InterviewAnswerRepository,
    },
    {
      provide: IInterviewVideoStorage,
      useClass: CloudinaryInterviewVideoStorage,
    },
    {
      provide: IInterviewService,
      useClass: InterviewService,
    },
    {
      provide: IInterviewRepository,
      useClass: InterviewRepository,
    },
  ],
  exports: [IInterviewService, IInterviewRepository, IInterviewAnswerService],
})
export class InterviewModule {}
