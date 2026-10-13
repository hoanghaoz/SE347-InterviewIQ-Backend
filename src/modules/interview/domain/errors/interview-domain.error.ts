export enum InterviewDomainError {
  TitleTooLong = 'JOB_TITLE_TOO_LONG',
  JobDescriptionTooLong = 'JOB_DESCRIPTION_TOO_LONG',
}

export class InterviewDomainErrorValidation extends Error {
  constructor(
    public readonly errorCode: InterviewDomainError,
    message: string,
  ) {
    super(message);
  }
}

export class InterviewSubmissionConflictError extends Error {
  constructor() {
    super('Interview session cannot be submitted in its current state');
  }
}

export class InterviewStartConflictError extends Error {
  constructor() {
    super('Interview session cannot be started in its current state');
  }
}
