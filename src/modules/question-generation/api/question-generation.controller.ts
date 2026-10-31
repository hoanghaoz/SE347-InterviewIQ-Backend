import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { GenerateQuestionsRequestDto } from '../application/dtos/generate-questions.request.dto';
import { SessionQuestionsResponseDto } from '../application/dtos/question.response.dto';
import { IQuestionGenerationService } from '../application/interfaces/question-generation.service.interface';

@Controller('api/interview-session/:sessionPublicId/questions')
export class QuestionGenerationController {
  constructor(private readonly questionService: IQuestionGenerationService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Generate (or regenerate) the interview questions of a session',
  })
  @ApiOkResponse({ type: SessionQuestionsResponseDto })
  async generateQuestionsAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
    @Body() body: GenerateQuestionsRequestDto = {},
  ): Promise<ApiSuccessResponse<SessionQuestionsResponseDto>> {
    const result = await this.questionService.generateQuestionsAsync(
      user.sub,
      sessionPublicId,
      body,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview questions generated successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Get()
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({ summary: 'Get the interview questions of a session' })
  @ApiOkResponse({ type: SessionQuestionsResponseDto })
  async getQuestionsAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
  ): Promise<ApiSuccessResponse<SessionQuestionsResponseDto>> {
    const result = await this.questionService.getQuestionsAsync(
      user.sub,
      sessionPublicId,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview questions retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
