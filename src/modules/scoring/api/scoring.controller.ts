import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import {
  ScoringJobStatusResponseDto,
  SessionResultResponseDto,
} from '../application/dtos/scoring.response.dto';
import { IScoringService } from '../application/interfaces/scoring.service.interface';

@ApiTags('scoring')
@ApiBearerAuth()
@Controller('api/scoring')
export class ScoringController {
  constructor(private readonly scoringService: IScoringService) {}

  @Get('jobs/:jobId/status')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Get scoring job status',
    description:
      'Retrieve background scoring job processing status by pg-boss job ID.',
  })
  @ApiParam({
    name: 'jobId',
    type: 'string',
    format: 'uuid',
    description: 'pg-boss job UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Job status retrieved successfully',
    type: ScoringJobStatusResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'User not authorized to access this job',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Scoring job not found',
  })
  async getJobStatus(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @User() user: JwtPayload,
  ): Promise<ApiSuccessResponse<ScoringJobStatusResponseDto>> {
    const result = await this.scoringService.getJobStatusAsync(
      jobId,
      user.sub,
      user.role,
    );

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Job status retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }

  @Get('sessions/:sessionId/result')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
  @ApiOperation({
    summary: 'Get session scoring result',
    description:
      'Retrieve full score breakdown and feedback summary for a completed interview session.',
  })
  @ApiParam({
    name: 'sessionId',
    type: 'string',
    format: 'uuid',
    description: 'Interview session UUID',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Scoring result retrieved successfully',
    type: SessionResultResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Session scoring has not completed yet',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'User not authorized to access this session result',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Session or scoring result not found',
  })
  async getSessionResult(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @User() user: JwtPayload,
  ): Promise<ApiSuccessResponse<SessionResultResponseDto>> {
    const result = await this.scoringService.getSessionResultAsync(
      sessionId,
      user.sub,
      user.role,
    );

    return result.match(
      (data) =>
        new ApiSuccessResponse(
          HttpStatus.OK,
          data,
          'Scoring result retrieved successfully',
        ),
      (error) => {
        throw toHttpException(error);
      },
    );
  }
}
