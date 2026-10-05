export enum ScoringDomainError {
  InvalidSessionId = 'INVALID_SESSION_ID',
  InvalidUserId = 'INVALID_USER_ID',
  JobAlreadyQueued = 'JOB_ALREADY_QUEUED',
  JobNotFound = 'JOB_NOT_FOUND',
}

export class ScoringDomainErrorValidation extends Error {
  constructor(
    public readonly errorCode: ScoringDomainError,
    message: string,
  ) {
    super(message);
  }
}
