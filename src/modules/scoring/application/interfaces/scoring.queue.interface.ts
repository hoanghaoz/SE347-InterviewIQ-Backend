import { ScoringJobData } from '../dtos/scoring.request.dto';

export abstract class IScoringQueue {
  abstract enqueue(data: ScoringJobData): Promise<string | null>;
}
