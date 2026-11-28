import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
import { LlmModule } from '../../shared/llm/llm.module';
import { InterviewHistoryController } from './api/interview-history.controller';
import { IHistoryInsightLlm } from './application/interfaces/history-insight-llm.interface';
import { IHistoryInsightService } from './application/interfaces/history-insight.service.interface';
import { IInterviewHistoryService } from './application/interfaces/interview-history.service.interface';
import { IInterviewStatsService } from './application/interfaces/interview-stats.service.interface';
import { HistoryInsightService } from './application/services/history-insight.service';
import { InterviewHistoryService } from './application/services/interview-history.service';
import { InterviewStatsService } from './application/services/interview-stats.service';
import { IHistoryInsightRepository } from './domain/repositories/history-insight.repo.interface';
import { IInsightRateLimiter } from './domain/repositories/insight-rate-limiter.interface';
import { IInterviewHistoryRepository } from './domain/repositories/interview-history.repo.interface';
import { IInterviewStatsRepository } from './domain/repositories/interview-stats.repo.interface';
import { HistoryInsightLlmAdapter } from './infrastructure/adapters/history-insight-llm.adapter';
import { HistoryInsightRepository } from './infrastructure/history-insight.repo';
import { InterviewHistoryRepository } from './infrastructure/interview-history.repo';
import { InterviewStatsRepository } from './infrastructure/interview-stats.repo';
import { RedisInsightRateLimiter } from './infrastructure/redis-insight-rate-limiter';

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
    // ILlmProvider (Gemini, fallback Groq) cho nhận xét tổng hợp
    LlmModule,
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
    {
      provide: IInterviewStatsService,
      useClass: InterviewStatsService,
    },
    {
      provide: IInterviewStatsRepository,
      useClass: InterviewStatsRepository,
    },
    {
      provide: IHistoryInsightService,
      useClass: HistoryInsightService,
    },
    {
      provide: IHistoryInsightRepository,
      useClass: HistoryInsightRepository,
    },
    {
      provide: IHistoryInsightLlm,
      useClass: HistoryInsightLlmAdapter,
    },
    // RedisService đến từ RedisModule (@Global) nên không cần import
    {
      provide: IInsightRateLimiter,
      useClass: RedisInsightRateLimiter,
    },
  ],
})
export class InterviewHistoryModule {}
