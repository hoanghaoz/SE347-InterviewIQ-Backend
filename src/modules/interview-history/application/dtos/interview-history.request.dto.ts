import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { CommonSessionStatus } from '../../../interview/domain/enums/interview-enum';

// PaginationQueryDto dùng chung không có chặn trên cho pageSize, nên một request
// pageSize=1000000 sẽ kéo cả bảng về. Module này khai lại query DTO của riêng
// mình để chặn, thay vì sửa file shared và ảnh hưởng endpoint của module khác.
export const MAX_PAGE_SIZE = 100;

export class InterviewHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageNumber must be an integer' })
  @Min(1, { message: 'pageNumber must be at least 1' })
  pageNumber: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must be at least 1' })
  @Max(MAX_PAGE_SIZE, {
    message: `pageSize must not exceed ${MAX_PAGE_SIZE}`,
  })
  pageSize: number = 20;

  // Giữ nguyên dạng chuỗi ở đây rồi service mới đổi sang Date: như vậy chuỗi sai
  // format bị chặn ở ValidationPipe (400 kèm field errors), còn việc so sánh
  // fromDate với toDate là luật nghiệp vụ nên thuộc service.
  @ApiPropertyOptional({
    description: 'Filter sessions created at or after this instant',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString({}, { message: 'fromDate must be an ISO 8601 date string' })
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Filter sessions created at or before this instant',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString({}, { message: 'toDate must be an ISO 8601 date string' })
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by session status',
    enum: CommonSessionStatus,
    enumName: 'CommonSessionStatus',
  })
  @IsOptional()
  @IsEnum(CommonSessionStatus, {
    message: 'status must be a valid session status',
  })
  status?: CommonSessionStatus;
}
