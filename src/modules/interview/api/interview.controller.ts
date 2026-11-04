import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import {
  CreateInterviewRequestDto,
  SubmitInterviewSessionRequestDto,
} from '../application/dtos/interview.request.dto';
import {
  InterviewResponseDto,
  InterviewSessionResponse,
  StartInterviewSessionResponseDto,
  SubmitInterviewSessionResponseDto,
} from '../application/dtos/interview.response.dto';
import { IInterviewService } from '../application/interfaces/interview.service.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import {
  PageResult,
  PaginationQueryDto,
} from '../../../shared/common/pagination';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  getSchemaPath,
} from '@nestjs/swagger';

@ApiExtraModels(InterviewSessionResponse, StartInterviewSessionResponseDto)
@Controller('api/interview-session')
export class InterviewController {
  constructor(private readonly interviewService: IInterviewService) {}

  @Get()
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'List interview sessions owned by the current user',
    deprecated: true,
    description:
      'Deprecated: use GET /api/interviews (interview-history module) instead. ' +
      'That endpoint adds fromDate/toDate/status filters, overallScore and a pageSize cap. ' +
      'Field differences are listed in docs/api-contract-interview-history.md section 5.',
  })
  @ApiQuery({ type: PaginationQueryDto })
  @ApiOkResponse({
    description: 'Paginated interview sessions',
    schema: {
      type: 'object',
      required: ['statusCode', 'success', 'data', 'message', 'timestamp'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Interview sessions retrieved successfully',
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
              items: { $ref: getSchemaPath(InterviewSessionResponse) },
            },
            totalPages: { type: 'integer', example: 1 },
            currentPage: { type: 'integer', example: 1 },
            pageNumber: { type: 'integer', example: 1 },
            pageSize: { type: 'integer', example: 20 },
            hasPrevious: { type: 'boolean', example: false },
            hasNext: { type: 'boolean', example: false },
          },
        },
      },
    },
  })
  async getInterviewSessionAsync(
    @User() user: JwtPayload,
    @Query() pagination: PaginationQueryDto,
  ): Promise<ApiSuccessResponse<PageResult<InterviewSessionResponse>>> {
    const result = await this.interviewService.getInterviewSessionAsync(
      user.sub,
      pagination,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview sessions retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Post(':sessionPublicId/start')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Start an owned interview session in CREATED status',
  })
  @ApiOkResponse({
    description: 'Interview session started successfully',
    schema: {
      type: 'object',
      required: ['statusCode', 'success', 'data', 'message', 'timestamp'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        data: { $ref: getSchemaPath(StartInterviewSessionResponseDto) },
        message: {
          type: 'string',
          example: 'Interview session started successfully',
        },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  async startInterviewSessionAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
  ): Promise<ApiSuccessResponse<StartInterviewSessionResponseDto>> {
    const result = await this.interviewService.startInterviewSessionAsync(
      user.sub,
      sessionPublicId,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Interview session started successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Post(':sessionPublicId/submit')
  @HttpCode(HttpStatus.ACCEPTED)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  async submitInterviewSessionAsync(
    @User() user: JwtPayload,
    @Param('sessionPublicId', ParseUUIDPipe) sessionPublicId: string,
    @Body() request: SubmitInterviewSessionRequestDto,
  ): Promise<ApiSuccessResponse<SubmitInterviewSessionResponseDto>> {
    const result = await this.interviewService.submitInterviewSessionAsync(
      user.sub,
      sessionPublicId,
      request,
    );
    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.ACCEPTED,
          data,
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
