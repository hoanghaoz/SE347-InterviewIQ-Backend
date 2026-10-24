import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { PlaygroundRunResponseDto } from '../dtos/playground-run.response.dto';
import type { RunPlaygroundRequestDto } from '../dtos/run-playground.request.dto';

export abstract class ILlmPlaygroundService {
  abstract runAsync(
    request: RunPlaygroundRequestDto,
  ): Promise<Result<PlaygroundRunResponseDto, AppError>>;
}
