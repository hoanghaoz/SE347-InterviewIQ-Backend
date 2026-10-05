import { Result } from 'neverthrow';
import { AppError } from '../../../../shared/common/errorCode';
import { ScoringJobStatusResponseDto } from '../dtos/scoring.response.dto';

export interface EnqueueResult {
  jobId: string;
  status: 'QUEUED';
}

export abstract class IScoringService {
  abstract enqueueAsync(
    sessionId: string,
    userId: string,
  ): Promise<Result<EnqueueResult, AppError>>;

  abstract getJobStatusAsync(
    jobId: string,
    userId: string,
    userRole?: string,
  ): Promise<Result<ScoringJobStatusResponseDto, AppError>>;
}
