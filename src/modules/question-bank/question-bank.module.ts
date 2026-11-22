import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../shared/common/jwt.guard';
import { RolesGuard } from '../../shared/decorators/roles.guard';
import { QuestionBankController } from './api/question-bank.controller';
import { IQuestionBankService } from './application/interfaces/question-bank.service.interface';
import { QuestionBankService } from './application/services/question-bank.service';
import { IQuestionBankRepository } from './domain/repositories/question-bank.repo.interface';
import { QuestionBankRepository } from './infrastructure/question-bank.repo';

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
  controllers: [QuestionBankController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    { provide: IQuestionBankService, useClass: QuestionBankService },
    { provide: IQuestionBankRepository, useClass: QuestionBankRepository },
  ],
})
export class QuestionBankModule {}
