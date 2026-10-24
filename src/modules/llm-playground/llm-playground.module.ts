import { Module } from '@nestjs/common';
import { LlmModule } from '../../shared/llm/llm.module';
import { LlmPlaygroundController } from './api/llm-playground.controller';
import { LlmPlaygroundEnabledGuard } from './api/llm-playground-enabled.guard';
import { ILlmPlaygroundService } from './application/interfaces/llm-playground.service.interface';
import { LlmPlaygroundService } from './application/services/llm-playground.service';

@Module({
  imports: [LlmModule],
  controllers: [LlmPlaygroundController],
  providers: [
    LlmPlaygroundEnabledGuard,
    { provide: ILlmPlaygroundService, useClass: LlmPlaygroundService },
  ],
})
export class LlmPlaygroundModule {}
