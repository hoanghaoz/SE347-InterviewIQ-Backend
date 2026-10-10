import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { toHttpException } from '../../../shared/common/app-error.mapper';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { Auth } from '../../../shared/decorators/auth.decorator';
import { User } from '../../../shared/decorators/user.decorator';
import { ApiSuccessResponse } from '../../../shared/response/apiResponse';
import { ScoringJobStatusResponseDto } from '../application/dtos/scoring.response.dto';
import { IScoringService } from '../application/interfaces/scoring.service.interface';

@Controller('api/scoring')
export class ScoringController {
  constructor(private readonly scoringService: IScoringService) {}

  @Get('jobs/:jobId/status')
  @HttpCode(HttpStatus.OK)
  @Auth([CommonUserRole.ADMIN, CommonUserRole.USER])
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
}
