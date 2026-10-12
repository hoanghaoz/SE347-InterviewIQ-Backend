import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import {
  CreateInterviewRequestDto,
  SubmitInterviewSessionRequestDto,
} from '../application/dtos/interview.request.dto';
import { InterviewResponseDto } from '../application/dtos/interview.response.dto';
import { IInterviewService } from '../application/interfaces/interview.service.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { CommonUserRole } from '../../../shared/common/commonEnum';

@Controller('api/interview-session')
export class InterviewController {
  constructor(private readonly interviewService: IInterviewService) {}

  @Post(':sessionPublicId/submit')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async submitInterviewSessionAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
    @Body() request: SubmitInterviewSessionRequestDto,
  ): Promise<ApiSuccessResponse<null>> {
    const result = await this.interviewService.submitInterviewSessionAsync(
      user.sub,
      sessionPublicId,
      request,
    );
    return result.match(
      () =>
        new ApiSuccessResponse<null>(
          HttpStatus.OK,
          null,
          'Interview session submitted successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async createInterviewSessionAsync(
    @User() user: JwtPayload,
    @Body() request: CreateInterviewRequestDto,
  ): Promise<ApiSuccessResponse<InterviewResponseDto>> {
    const result = await this.interviewService.createInterviewSessionAsync(
      user.sub,
      request,
    );

    return result.match(
      (publicId) =>
        new ApiSuccessResponse(
          HttpStatus.CREATED,
          { publicId },
          'Interview session created successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
