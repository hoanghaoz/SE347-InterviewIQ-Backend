import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_STATS_TREND_LIMIT = 20;
export const MAX_STATS_TREND_LIMIT = 100;

export class InterviewStatsQueryDto {
  // Cùng nghĩa với filter của GET /api/interviews: lọc theo createdAt, bao gồm
  // cả hai mốc. So sánh fromDate với toDate là luật nghiệp vụ nên nằm ở service.
  @ApiPropertyOptional({
    description: 'Only count sessions created at or after this instant',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString({}, { message: 'fromDate must be an ISO 8601 date string' })
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Only count sessions created at or before this instant',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString({}, { message: 'toDate must be an ISO 8601 date string' })
  toDate?: string;

  @ApiPropertyOptional({
    description:
      'Number of most recent completed sessions returned in trend. Averages always cover every session in the date range.',
    default: DEFAULT_STATS_TREND_LIMIT,
    minimum: 1,
    maximum: MAX_STATS_TREND_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(MAX_STATS_TREND_LIMIT, {
    message: `limit must not exceed ${MAX_STATS_TREND_LIMIT}`,
  })
  limit: number = DEFAULT_STATS_TREND_LIMIT;
}
