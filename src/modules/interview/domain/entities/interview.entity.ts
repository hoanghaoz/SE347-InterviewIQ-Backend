import { CommonSessionStatus } from '../enums/interview-enum';
import { err, ok, type Result } from 'neverthrow';
import {
  InterviewDomainError,
  InterviewDomainErrorValidation,
} from '../errors/interview-domain.error';

export type InterviewSessionGetParams = {
  readonly id: number;
  readonly publicId: string;
  readonly userId: number;
  readonly cvId: number;
  readonly title: string;
  readonly jobDescription: string | null;
  readonly status: CommonSessionStatus;
  readonly totalQuestion: number;
  readonly durationSeconds: number;
  readonly startedAt: Date | null;
  readonly submittedAt: Date | null;
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  updatedAt: Date;
};

export type InterviewSessionCreateParams = Omit<
  InterviewSessionGetParams,
  | 'id'
  | 'publicId'
  | 'totalQuestion'
  | 'durationSeconds'
  | 'startedAt'
  | 'submittedAt'
  | 'completedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export class Interview {
  private constructor(private params: InterviewSessionCreateParams) {}

  static create(
    params: InterviewSessionCreateParams,
  ): Result<Interview, InterviewDomainErrorValidation> {
    const validation = Interview.validate(params);
    if (validation.isErr()) {
      return err(validation.error);
    }

    return ok(new Interview(params));
  }

  private static validate(
    params: InterviewSessionCreateParams,
  ): Result<void, InterviewDomainErrorValidation> {
    if (params.title.length > 255) {
      return err(
        new InterviewDomainErrorValidation(
          InterviewDomainError.TitleTooLong,
          'Interview title must not exceed 255 characters.',
        ),
      );
    }

    if (
      params.jobDescription !== null &&
      params.jobDescription.length > 10_000
    ) {
      return err(
        new InterviewDomainErrorValidation(
          InterviewDomainError.JobDescriptionTooLong,
          'Job description must not exceed 10,000 characters.',
        ),
      );
    }

    if (!Object.values(CommonSessionStatus).includes(params.status)) {
      return err(
        new InterviewDomainErrorValidation(
          InterviewDomainError.InvalidStatus,
          'Invalid interview status.',
        ),
      );
    }

    return ok(undefined);
  }
}
