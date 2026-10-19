import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { SaveInterviewAnswerRequestDto } from '../application/dtos/interview-answer.request.dto';
import {
  InterviewAnswerResponseDto,
  InterviewVideoSignedParamsResponseDto,
} from '../application/dtos/interview-answer.response.dto';
import { IInterviewAnswerService } from '../application/interfaces/interview-answer.service.interface';

@Controller(
  'api/interview-session/:sessionPublicId/questions/:questionPublicId/answer',
)
export class InterviewAnswerController {
  constructor(private readonly answerService: IInterviewAnswerService) {}

  @Post('signed-params')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async createSignedParamsAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
    @Param('questionPublicId', ParseUUIDPipe) questionPublicId: string,
  ): Promise<ApiSuccessResponse<InterviewVideoSignedParamsResponseDto>> {
    const result = await this.answerService.createSignedParamsAsync(
      user.sub,
      sessionPublicId,
      questionPublicId,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Video upload params signed',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async saveAnswerAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
    @Param('questionPublicId', ParseUUIDPipe) questionPublicId: string,
    @Body() request: SaveInterviewAnswerRequestDto,
  ): Promise<ApiSuccessResponse<InterviewAnswerResponseDto>> {
    const result = await this.answerService.saveAnswerAsync(
      user.sub,
      sessionPublicId,
      questionPublicId,
      request,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview answer saved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
