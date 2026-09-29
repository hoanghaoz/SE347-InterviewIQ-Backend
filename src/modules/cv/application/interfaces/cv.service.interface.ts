import { Result } from 'neverthrow';
import { AppError } from '../../../../shared/common/errorCode';
import { CreateCvRequestDto } from '../dtos/cv.request.dto';
import {
  CvResponseDto,
  CvSignedParamsResponseDto,
  CvSummaryResponseDto,
} from '../dtos/cv.response.dto';

export abstract class ICvService {
  abstract createSignedParamsAsync(
    userPublicId: string,
  ): Promise<Result<CvSignedParamsResponseDto, AppError>>;

  abstract createCvAsync(
    userPublicId: string,
    request: CreateCvRequestDto,
  ): Promise<Result<CvResponseDto, AppError>>;

  abstract getCvsAsync(
    userPublicId: string,
  ): Promise<Result<CvSummaryResponseDto[], AppError>>;

  abstract getCvAsync(
    userPublicId: string,
    cvPublicId: string,
  ): Promise<Result<CvResponseDto, AppError>>;
}
