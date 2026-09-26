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
