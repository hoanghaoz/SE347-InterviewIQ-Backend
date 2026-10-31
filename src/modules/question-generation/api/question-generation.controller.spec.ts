import { HttpException, HttpStatus } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { AppError, ErrorCode } from '../../../shared/common/errorCode';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { SessionQuestionsResponseDto } from '../application/dtos/question.response.dto';
import type { IQuestionGenerationService } from '../application/interfaces/question-generation.service.interface';
import { QuestionGenerationController } from './question-generation.controller';

describe('QuestionGenerationController', () => {
  const generateQuestionsAsync = jest.fn<
    ReturnType<IQuestionGenerationService['generateQuestionsAsync']>,
    Parameters<IQuestionGenerationService['generateQuestionsAsync']>
  >();
  const getQuestionsAsync = jest.fn<
    ReturnType<IQuestionGenerationService['getQuestionsAsync']>,
    Parameters<IQuestionGenerationService['getQuestionsAsync']>
  >();
  const controller = new QuestionGenerationController({
    generateQuestionsAsync,
    getQuestionsAsync,
  });
  const user = {
    sub: 'user-1',
    email: 'a@b.c',
    role: CommonUserRole.USER,
  } as unknown as JwtPayload;
  const data: SessionQuestionsResponseDto = {
    sessionPublicId: 's-1',
    questions: [],
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('wraps generated questions in the success envelope', async () => {
    generateQuestionsAsync.mockResolvedValue(ok(data));

    const response = await controller.generateQuestionsAsync(user, 's-1', {
      count: 4,
    });

    expect(generateQuestionsAsync).toHaveBeenCalledWith('user-1', 's-1', {
      count: 4,
    });
    expect(response).toMatchObject({
      statusCode: HttpStatus.OK,
      success: true,
      data,
      message: 'Interview questions generated successfully',
    });
  });

  it('maps a generation error to its HTTP status', async () => {
    generateQuestionsAsync.mockResolvedValue(
      err(new AppError(ErrorCode.Conflict, 'CV has not been parsed yet')),
    );

    const call = controller.generateQuestionsAsync(user, 's-1', {});

    await expect(call).rejects.toBeInstanceOf(HttpException);
    await expect(call).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
  });

  it('wraps stored questions in the success envelope', async () => {
    getQuestionsAsync.mockResolvedValue(ok(data));

    const response = await controller.getQuestionsAsync(user, 's-1');

    expect(getQuestionsAsync).toHaveBeenCalledWith('user-1', 's-1');
    expect(response).toMatchObject({
      statusCode: HttpStatus.OK,
      data,
      message: 'Interview questions retrieved successfully',
    });
  });

  it('maps a missing session to 404', async () => {
    getQuestionsAsync.mockResolvedValue(
      err(new AppError(ErrorCode.NotFound, 'Interview session not found')),
    );

    await expect(
      controller.getQuestionsAsync(user, 's-1'),
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });
});
