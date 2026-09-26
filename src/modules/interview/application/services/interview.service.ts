import { Injectable } from '@nestjs/common';
import { IInterviewService } from '../interfaces/interview.service.interface';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { CreateInterviewRequestDto } from '../dtos/interview.request.dto';
import { IInterviewRepository } from '../../domain/repositories/interview.repo.interface';
import { ICvRepository } from '../../../cv/domain/repositories/cv.repo.interface';
import { Interview } from '../../domain/entities/interview.entity';

@Injectable()
export class InterviewService implements IInterviewService {
  constructor(
    private readonly interviewRepo: IInterviewRepository,
    private readonly cvRepo: ICvRepository,
  ) {}
  async createInterviewSessionAsync(
    userPublicId: string,
    request: CreateInterviewRequestDto,
  ): Promise<Result<string, AppError>> {
    const authorizeResult = await this.cvRepo.authorizeUserCv(
      userPublicId,
      request.cvPublicId,
    );
    if (authorizeResult.isErr()) {
      return err(
        new AppError(ErrorCode.InternalServerError, 'Failed to authorize CV'),
      );
    }
    if (!authorizeResult.value) {
      return err(
        new AppError(ErrorCode.NotFound, 'CV not found or unavailable'),
      );
    }

    const validateInterviewRequest = Interview.create({
      userId: authorizeResult.value.userId,
      cvId: authorizeResult.value.cvId,
      title: request.title,
      jobDescription: request.jobDescription ?? null,
    });

    if (validateInterviewRequest.isErr()) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          validateInterviewRequest.error.message,
        ),
      );
    }

    const newInterviewSession = validateInterviewRequest.value;
    const result =
      await this.interviewRepo.createInterviewSession(newInterviewSession);
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to create interview',
        ),
      );
    }
    return ok(result.value);
  }
}
