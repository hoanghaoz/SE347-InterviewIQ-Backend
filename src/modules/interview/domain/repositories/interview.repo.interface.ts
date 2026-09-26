import type { Result } from 'neverthrow';
import { Interview } from '../entities/interview.entity';

export abstract class IInterviewRepository {
  abstract createInterviewSession(
    newSession: Interview,
  ): Promise<Result<string, Error>>;
}
