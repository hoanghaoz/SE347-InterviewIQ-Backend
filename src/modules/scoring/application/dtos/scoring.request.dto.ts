export interface ScoringJobData {
  sessionId: string;
  userId: string;
  enqueuedAt: string;
  /** W3C trace context of the enqueuing request, so the worker continues its trace. */
  traceContext?: Record<string, string>;
}
