import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { HistoryInsightStateDto } from '../application/dtos/history-insight.response.dto';
import { InterviewHistoryQueryDto } from '../application/dtos/interview-history.request.dto';
import {
  InterviewHistoryDetailDto,
  InterviewHistoryItemDto,
} from '../application/dtos/interview-history.response.dto';
import { InterviewStatsQueryDto } from '../application/dtos/interview-stats.request.dto';
import { InterviewStatsDto } from '../application/dtos/interview-stats.response.dto';
import { IHistoryInsightService } from '../application/interfaces/history-insight.service.interface';
import { IInterviewHistoryService } from '../application/interfaces/interview-history.service.interface';
import { IInterviewStatsService } from '../application/interfaces/interview-stats.service.interface';

// Thin controller: read input, call the service, turn Result into HTTP.
// Chỉ đọc lịch sử của chính chủ token: không route nào nhận user id từ client.
@ApiTags('interviews')
@ApiExtraModels(
  InterviewHistoryItemDto,
  InterviewHistoryDetailDto,
  InterviewStatsDto,
  HistoryInsightStateDto,
)
@Controller('api/interviews')
export class InterviewHistoryController {
  constructor(
    private readonly interviewHistoryService: IInterviewHistoryService,
    private readonly interviewStatsService: IInterviewStatsService,
    private readonly historyInsightService: IHistoryInsightService,
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

  // Phải khai báo trước @Get(':id'): Express khớp route theo thứ tự đăng ký,
  // đặt sau thì "stats" rơi vào :id và bị ParseUUIDPipe trả 400.
  @Get('stats')
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Score statistics of the current user',
    description:
      'Averages over every COMPLETED session in the createdAt range, the best session, a trend of the most recent sessions (oldest first) ' +
      'and latest vs previous comparison. Sessions scored 0 for having no answer are included. Empty history returns 200 with nulls.',
  })
  @ApiOkResponse({
    description: 'Score statistics',
    schema: {
      type: 'object',
      required: ['statusCode', 'success', 'data', 'message', 'timestamp'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Interview stats retrieved successfully',
        },
        timestamp: { type: 'string', format: 'date-time' },
        data: { $ref: getSchemaPath(InterviewStatsDto) },
      },
    },
  })
  async getInterviewStatsAsync(
    @User() user: JwtPayload,
    @Query() query: InterviewStatsQueryDto,
  ): Promise<ApiSuccessResponse<InterviewStatsDto>> {
    const result = await this.interviewStatsService.getInterviewStatsAsync(
      user.sub,
      query,
    );

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview stats retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  // Cùng lý do với stats: route tĩnh phải đứng trước @Get(':id').
  @Get('insight')
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Stored AI insight over the whole practice history',
    description:
      'Never calls the AI. insight is null until the first POST. isStale is true when sessions were completed after the insight was generated.',
  })
  @ApiOkResponse({
    description: 'Insight state',
    schema: {
      type: 'object',
      required: ['statusCode', 'success', 'data', 'message', 'timestamp'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Interview insight retrieved successfully',
        },
        timestamp: { type: 'string', format: 'date-time' },
        data: { $ref: getSchemaPath(HistoryInsightStateDto) },
      },
    },
  })
  async getInsightAsync(
    @User() user: JwtPayload,
  ): Promise<ApiSuccessResponse<HistoryInsightStateDto>> {
    const result = await this.historyInsightService.getInsightAsync(user.sub);

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview insight retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  // 200 chứ không 201: khi lịch sử không đổi thì không có gì mới được tạo, chỉ
  // trả lại bản đã lưu.
  @Post('insight')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Generate or refresh the AI insight',
    description:
      'Needs at least 2 completed sessions (400 otherwise). Returns the stored insight without calling the AI when no session was completed since. ' +
      'Otherwise calls the AI synchronously (can take several seconds); limited to 5 AI generations per user per hour (429).',
  })
  @ApiOkResponse({
    description: 'Insight state after the refresh',
    schema: {
      type: 'object',
      required: ['statusCode', 'success', 'data', 'message', 'timestamp'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Interview insight refreshed successfully',
        },
        timestamp: { type: 'string', format: 'date-time' },
        data: { $ref: getSchemaPath(HistoryInsightStateDto) },
      },
    },
  })
  async generateInsightAsync(
    @User() user: JwtPayload,
  ): Promise<ApiSuccessResponse<HistoryInsightStateDto>> {
    const result = await this.historyInsightService.generateInsightAsync(
      user.sub,
    );

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview insight refreshed successfully',
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
      'Questions with their recorded answers (video URL, transcript) in every status. ' +
      'Session-level score and AI summary only once status is COMPLETED; there is no per-question score. ' +
      'Missing and foreign interviews both return 404.',
  })
  @ApiOkResponse({
    description: 'Interview detail',
    schema: {
      type: 'object',
      required: ['statusCode', 'success', 'data', 'message', 'timestamp'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Interview retrieved successfully',
        },
        timestamp: { type: 'string', format: 'date-time' },
        data: { $ref: getSchemaPath(InterviewHistoryDetailDto) },
      },
    },
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
