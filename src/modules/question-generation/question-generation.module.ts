import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
import { LlmModule } from '../../shared/llm/llm.module';
import { QuestionGenerationController } from './api/question-generation.controller';
import { IQuestionGenerationService } from './application/interfaces/question-generation.service.interface';
import { IQuestionGenerator } from './application/interfaces/question-generator.interface';
import { QuestionGenerationService } from './application/services/question-generation.service';
import { IQuestionGenerationRepository } from './domain/repositories/question-generation.repo.interface';
import { LlmQuestionGenerator } from './infrastructure/llm-question-generator';
import { QuestionGenerationRepository } from './infrastructure/question-generation.repo';

@Module({
  imports: [
    ConfigModule,
    LlmModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [QuestionGenerationController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    {
      provide: IQuestionGenerationService,
      useClass: QuestionGenerationService,
    },
    {
      provide: IQuestionGenerationRepository,
      useClass: QuestionGenerationRepository,
    },
    { provide: IQuestionGenerator, useClass: LlmQuestionGenerator },
  ],
})
export class QuestionGenerationModule {}
