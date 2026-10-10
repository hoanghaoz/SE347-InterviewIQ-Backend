import { ScoringJobStatus } from '../../domain/enums/scoring-enum';

export interface ScoringJobStatusResponseDto {
  jobId: string;
  sessionId: string;
  status: ScoringJobStatus;
  createdAt: string;
  completedAt: string | null;
}
