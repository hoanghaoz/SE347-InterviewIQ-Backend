import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { SessionQuestionsResponseDto } from '../../question-generation/application/dtos/question.response.dto';
import { UseBankQuestionsRequestDto } from '../application/dtos/question-bank.request.dto';
import { IQuestionBankService } from '../application/interfaces/question-bank.service.interface';

// Nằm dưới đường dẫn của phiên vì kết quả là bộ câu hỏi của phiên; logic thuộc module ngân hàng.
@ApiTags('question-bank')
@Controller('api/interview-session/:sessionPublicId/questions')
export class QuestionBankSessionController {
  constructor(private readonly questionBankService: IQuestionBankService) {}

  @Post('from-bank')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Use questions of the question bank as the questions of a session',
    description:
      'Replaces the whole question set of the session with the chosen bank items, in the given order (3 to 10, no repeats). Only while the session is CREATED.',
  })
  @ApiOkResponse({ type: SessionQuestionsResponseDto })
  async useInSessionAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
    @Body() request: UseBankQuestionsRequestDto,
  ): Promise<ApiSuccessResponse<SessionQuestionsResponseDto>> {
    const result = await this.questionBankService.useInSessionAsync(
      user.sub,
      sessionPublicId,
      request,
    );

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview questions set from the question bank',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
