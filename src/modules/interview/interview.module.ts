import { Module } from '@nestjs/common';
import { IInterviewRepository } from './domain/repositories/interview.repo.interface';
import { InterviewRepository } from './infrastructure/interview.repo';

@Module({
  controllers: [],
  providers: [
    {
      provide: IInterviewRepository,
      useClass: InterviewRepository,
    },
  ],
  exports: [IInterviewRepository],
})
export class InterviewModule {}
