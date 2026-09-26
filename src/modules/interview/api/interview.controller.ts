import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { JwtAuthGuard } from '../../../shared/common/jwt.guard';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { CreateInterviewRequestDto } from '../application/dtos/interview.request.dto';
import { InterviewResponseDto } from '../application/dtos/interview.response.dto';
import { IInterviewService } from '../application/interfaces/interview.service.interface';

@Controller('api/interview')
export class InterviewController {
  constructor(private readonly interviewService: IInterviewService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
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
