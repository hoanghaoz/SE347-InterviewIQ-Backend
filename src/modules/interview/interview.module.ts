import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { CvModule } from '../cv/cv.module';
import { InterviewController } from './api/interview.controller';
import { IInterviewService } from './application/interfaces/interview.service.interface';
import { InterviewService } from './application/services/interview.service';
import { IInterviewRepository } from './domain/repositories/interview.repo.interface';
import { InterviewRepository } from './infrastructure/interview.repo';

@Module({
  imports: [
    CvModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [InterviewController],
  providers: [
    JwtAuthGuard,
    {
      provide: IInterviewService,
      useClass: InterviewService,
    },
    {
      provide: IInterviewRepository,
      useClass: InterviewRepository,
    },
  ],
  exports: [IInterviewService, IInterviewRepository],
})
export class InterviewModule {}
