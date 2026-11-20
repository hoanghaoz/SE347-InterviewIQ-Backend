import { Observable } from 'rxjs';

export type ScoringJobEventType = 'answer-scored' | 'answer-failed';

export interface ScoringJobEventPayload {
  readonly sessionId: string;
  readonly overallScore?: number;
  readonly error?: string;
}

export interface ScoringJobEvent {
  readonly userId: string;
  readonly jobId: string;
  readonly type: ScoringJobEventType;
  readonly payload: ScoringJobEventPayload;
}

export abstract class IScoringEventBus {
  abstract publish(event: ScoringJobEvent): void;
  abstract subscribeForUser(userId: string): Observable<ScoringJobEvent>;
}
