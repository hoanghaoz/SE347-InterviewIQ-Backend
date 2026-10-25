import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
import { InterviewHistoryController } from './api/interview-history.controller';
import { IInterviewHistoryService } from './application/interfaces/interview-history.service.interface';
import { InterviewHistoryService } from './application/services/interview-history.service';
import { IInterviewHistoryRepository } from './domain/repositories/interview-history.repo.interface';
import { InterviewHistoryRepository } from './infrastructure/interview-history.repo';

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
  controllers: [InterviewHistoryController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    {
      provide: IInterviewHistoryService,
      useClass: InterviewHistoryService,
    },
    {
      provide: IInterviewHistoryRepository,
      useClass: InterviewHistoryRepository,
    },
  ],
})
export class InterviewHistoryModule {}
