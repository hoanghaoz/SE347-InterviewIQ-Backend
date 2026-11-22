import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { PageResult } from '../../../shared/common/pagination';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { QuestionBankQueryDto } from '../application/dtos/question-bank.request.dto';
import { QuestionBankItemDto } from '../application/dtos/question-bank.response.dto';
import { IQuestionBankService } from '../application/interfaces/question-bank.service.interface';

// Thin controller. Chỉ đọc ngân hàng của chính chủ token: không route nào nhận user id từ client.
@ApiTags('question-bank')
@ApiExtraModels(QuestionBankItemDto)
@Controller('api/question-bank')
export class QuestionBankController {
  constructor(private readonly questionBankService: IQuestionBankService) {}

  // @Auth phải đặt trên từng method: RolesGuard đọc metadata bằng
  // reflector.get(Roles, context.getHandler()) nên không thấy metadata ở class.
  @Get()
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'List the question bank of the current user',
    description:
      'Newest first. Filter by domain, difficulty and a case-insensitive text search.',
  })
  @ApiOkResponse({
    description: 'Paginated question bank',
    schema: {
      type: 'object',
      required: ['statusCode', 'success', 'data', 'message', 'timestamp'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Question bank retrieved successfully',
        },
        timestamp: { type: 'string', format: 'date-time' },
        data: {
          type: 'object',
          required: [
            'items',
            'totalPages',
            'currentPage',
            'pageNumber',
            'pageSize',
            'hasPrevious',
            'hasNext',
          ],
          properties: {
            items: {
              type: 'array',
              items: { $ref: getSchemaPath(QuestionBankItemDto) },
            },
            totalPages: { type: 'integer', example: 3 },
            currentPage: { type: 'integer', example: 1 },
            pageNumber: { type: 'integer', example: 1 },
            pageSize: { type: 'integer', example: 20 },
            hasPrevious: { type: 'boolean', example: false },
            hasNext: { type: 'boolean', example: true },
          },
        },
      },
    },
  })
  async listAsync(
    @User() user: JwtPayload,
    @Query() query: QuestionBankQueryDto,
  ): Promise<ApiSuccessResponse<PageResult<QuestionBankItemDto>>> {
    const result = await this.questionBankService.listAsync(user.sub, query);

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Question bank retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
