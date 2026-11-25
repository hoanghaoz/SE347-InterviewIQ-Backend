import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerMiddleware } from './shared/common/logger.middleware';
import { createValidationPipe } from './shared/common/validation-pipe.factory';
import { PrismaModule } from './shared/infrastructure/database/prisma.module';
import { InterviewHistoryModule } from './modules/interview-history/interview-history.module';
import { InterviewModule } from './modules/interview/interview.module';
import { CvModule } from './modules/cv/cv.module';
import { RedisModule } from './shared/infrastructure/redis/redis.module';
import { AuthModule } from './modules/authentication/auth.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { UserModule } from './modules/user/user.module';
import { LlmPlaygroundModule } from './modules/llm-playground/llm-playground.module';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { QuestionGenerationModule } from './modules/question-generation/question-generation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    ConfigModule,
    InterviewModule,
    InterviewHistoryModule,
    CvModule,
    RedisModule,
    AuthModule,
    ScoringModule,
    UserModule,
    LlmPlaygroundModule,
    QuestionGenerationModule,
    QuestionBankModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useFactory: createValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: 'api/*path', method: RequestMethod.ALL });
  }
}
