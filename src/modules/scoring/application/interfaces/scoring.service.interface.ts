import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';

export interface EnqueueResult {
  jobId: string;
  status: 'QUEUED';
}

export abstract class IScoringService {
  abstract enqueueAsync(
    sessionId: string,
    userId: string,
  ): Promise<Result<EnqueueResult, AppError>>;
}
