export enum CvDomainError {
  FileNameIsNull = 'CV_FILE_NAME_IS_NULL',
  FileNameTooLong = 'CV_FILE_NAME_IS_TOO_LONG',
  FileSizeNotInt = 'CV_FILE_SIZE_IS_NOT_AN_INTEGER',
  FileSizeTooLarge = 'CV_FILE_SIZE_IS_TOO_LARGE',
  FileSizeTooSmall = 'CV_FILE_SIZE_IS_TOO_SMALL',
}

export class CvDomainErrorValidation extends Error {
  constructor(
    public readonly errorCode: CvDomainError,
    message: string,
  ) {
    super(message);
  }
}
