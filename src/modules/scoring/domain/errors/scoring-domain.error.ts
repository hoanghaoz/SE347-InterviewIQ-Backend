export enum ScoringDomainError {
  InvalidSessionId = 'INVALID_SESSION_ID',
  InvalidUserId = 'INVALID_USER_ID',
  JobAlreadyQueued = 'JOB_ALREADY_QUEUED',
  JobNotFound = 'JOB_NOT_FOUND',
  ScoreOutOfRange = 'SCORE_OUT_OF_RANGE',
  OverallFeedbackEmpty = 'OVERALL_FEEDBACK_EMPTY',
  OverallFeedbackTooLong = 'OVERALL_FEEDBACK_TOO_LONG',
  InvalidStrengths = 'INVALID_STRENGTHS',
  InvalidImprovements = 'INVALID_IMPROVEMENTS',
  InvalidScoringModel = 'INVALID_SCORING_MODEL',
}

export class ScoringDomainErrorValidation extends Error {
  constructor(
    public readonly errorCode: ScoringDomainError,
    message: string,
  ) {
    super(message);
    this.name = 'ScoringDomainErrorValidation';
  }
}
