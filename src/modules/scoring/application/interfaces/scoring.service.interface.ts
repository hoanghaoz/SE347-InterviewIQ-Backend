import { Result } from 'neverthrow';
import { Observable } from 'rxjs';
import { AppError } from '../../../../shared/common/errorCode';
import {
  ScoringJobStatusResponseDto,
  SessionResultResponseDto,
} from '../dtos/scoring.response.dto';
import { ScoringJobEvent } from './scoring-event.interface';

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

  abstract getSessionResultAsync(
    sessionId: string,
    userId: string,
    userRole?: string,
  ): Promise<Result<SessionResultResponseDto, AppError>>;

  abstract streamUserEvents(userId: string): Observable<ScoringJobEvent>;
}
