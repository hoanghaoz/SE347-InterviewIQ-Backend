import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
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
import { InterviewHistoryQueryDto } from '../application/dtos/interview-history.request.dto';
import {
  InterviewHistoryDetailDto,
  InterviewHistoryItemDto,
} from '../application/dtos/interview-history.response.dto';
import { IInterviewHistoryService } from '../application/interfaces/interview-history.service.interface';

// Thin controller: read input, call the service, turn Result into HTTP.
// Chỉ đọc lịch sử của chính chủ token: không route nào nhận user id từ client.
@ApiTags('interviews')
@ApiExtraModels(InterviewHistoryItemDto)
@Controller('api/interviews')
export class InterviewHistoryController {
  constructor(
    private readonly interviewHistoryService: IInterviewHistoryService,
  ) {}

  // @Auth phải đặt trên từng method: RolesGuard đọc metadata bằng
  // reflector.get(Roles, context.getHandler()) nên không thấy metadata ở class.
  @Get()
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'List the interview history of the current user',
    description:
      'Replaces the deprecated GET /api/interview-session. Adds date/status filters, overallScore and a pageSize cap.',
  })
  @ApiOkResponse({
    description: 'Paginated interview history',
    schema: {
      type: 'object',
      required: ['statusCode', 'success', 'data', 'message', 'timestamp'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Interview history retrieved successfully',
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
              items: { $ref: getSchemaPath(InterviewHistoryItemDto) },
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
  async getInterviewHistoryAsync(
    @User() user: JwtPayload,
    @Query() query: InterviewHistoryQueryDto,
  ): Promise<ApiSuccessResponse<PageResult<InterviewHistoryItemDto>>> {
    const result = await this.interviewHistoryService.getInterviewHistoryAsync(
      user.sub,
      query,
    );

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview history retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Get(':id')
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Get one interview of the current user',
    description:
      'Skeleton for the detail page: score, summary and questions are reserved slots other modules fill in later.',
  })
  async getInterviewAsync(
    @User() user: JwtPayload,
    // Rejects non-UUID ids with 400 before they reach the database.
    @Param('id', ParseUUIDPipe) sessionPublicId: string,
  ): Promise<ApiSuccessResponse<InterviewHistoryDetailDto>> {
    const result = await this.interviewHistoryService.getInterviewAsync(
      user.sub,
      sessionPublicId,
    );

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
