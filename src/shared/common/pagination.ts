import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PaginationQueryDto {
  /**
   * Declared explicitly (rather than relying on the `@nestjs/swagger` CLI
   * plugin's shim) because this file doesn't match the plugin's default
   * `dtoFileNameSuffix` (`.dto.ts`/`.entity.ts`), so it wouldn't otherwise
   * get auto-detected — routes using `@ApiQuery({ type: PaginationQueryDto })`
   * need this to show up in Swagger at all.
   */
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
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must be at least 1' })
  pageSize: number = 20;
}

export class PageResult<T> {
  items: T[];
  totalPages: number;
  currentPage: number;
  pageNumber: number;
  pageSize: number;
  hasPrevious: boolean;
  hasNext: boolean;

  constructor(
    items: T[],
    totalItems: number,
    pageNumber: number,
    currentPage: number,
    pageSize: number,
  ) {
    this.items = items;
    this.totalPages = Math.ceil(totalItems / pageSize);
    this.currentPage = currentPage;
    this.pageNumber = pageNumber;
    this.pageSize = pageSize;
    this.hasPrevious = currentPage > 1;
    this.hasNext = currentPage < this.totalPages;
  }
}

export type PaginationRequest = {
  pageNumber: number;
  pageSize: number;
};
