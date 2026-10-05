import { ScoringJobStatus } from '../../domain/enums/scoring-enum';
import { ScoringJobData } from '../dtos/scoring.request.dto';

export interface ScoringJobInfo {
  id: string;
  data: ScoringJobData;
  status: ScoringJobStatus;
  createdOn: Date;
  completedOn: Date | null;
}

export abstract class IScoringQueue {
  abstract enqueue(data: ScoringJobData): Promise<string | null>;
  abstract getJob(jobId: string): Promise<ScoringJobInfo | null>;
}
