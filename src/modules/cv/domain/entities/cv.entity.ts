import { ParseStatus } from '../enums/cv.enum';
import { ok, err, Result } from 'neverthrow';
import { CvDomainError, CvDomainErrorValidation } from '../errors/cv-domain.error';

const MAX_FILE_NAME_LENGTH = 255;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export type CvGetParams = {
  readonly id: number;
  readonly publicId: string;
  readonly userId: number;
  readonly fileName: string;
  readonly fileUrl: string;
  readonly fileSize: number;
  readonly rawText: string | null;
  readonly parsedData: unknown;
  readonly parseStatus: ParseStatus;
  readonly parserVersion: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
export type CvProps = Omit<CvGetParams, 'id' | 'publicId' | 'createdAt' | 'updatedAt'> 
& Partial<Pick<CvGetParams,'id' | 'publicId' | 'createdAt' | 'updatedAt'>>;
export type CvCreateParams = Pick<CvGetParams,
 'userId' | 'fileName' | 'fileUrl' | 'fileSize'>;

export class Cv {
  private constructor (
    private readonly params: CvProps 
  ) {}
  /**
   * Creates a new CV instance.
   * @param params - The parameters for creating the CV.
   * @returns A Result containing the new CV instance or an error.
   */
  static create(params: CvCreateParams): Result<Cv, CvDomainErrorValidation>{
    const validation = Cv.validate(params);
    if (validation.isErr()) {
      return err(validation.error);
    }

    return ok(
      new Cv({
        ...params,
        parseStatus: ParseStatus.PENDING,
        rawText: null,
        parsedData: null,
        parserVersion: null,
        isActive: true,
      }),
    );
  }
  static getCv(params: CvGetParams): Cv {
    return new Cv(params);
  }

  private static validate(params: CvCreateParams): Result<void, CvDomainErrorValidation> {
    if (params.fileName.trim() === '') {
      return err(
        new CvDomainErrorValidation(
          CvDomainError.FileNameIsNull, "File name cannot be null or empty."
        )
      );
    }

    if (params.fileName.length > MAX_FILE_NAME_LENGTH) {
      return err(
        new CvDomainErrorValidation(
          CvDomainError.FileNameTooLong, `File name cannot exceed ${MAX_FILE_NAME_LENGTH} characters.`
        )
      );
    }

    if (!Number.isInteger(params.fileSize)) {
      return err(
        new CvDomainErrorValidation(
          CvDomainError.FileSizeNotInt, "File size must be an integer."
        )
      );
    }

    if (params.fileSize > MAX_FILE_SIZE_BYTES) {
      return err(
        new CvDomainErrorValidation(
          CvDomainError.FileSizeTooLarge, `File size cannot exceed ${MAX_FILE_SIZE_BYTES} bytes.`
        )
      );
    }

    if (params.fileSize <= 0) {
      return err(
        new CvDomainErrorValidation(
          CvDomainError.FileSizeTooSmall, "File size must be greater than zero."
      )
      );
    }

    return ok(undefined);
  }

  get fileName(): string {
    return this.params.fileName;
  }

  get fileUrl(): string {
    return this.params.fileUrl;
  }

  get fileSize(): number {
    return this.params.fileSize;
  }

  get parseStatus(): ParseStatus {
    return this.params.parseStatus;
  }

  get userId(): number {
    return this.params.userId;
  }
}