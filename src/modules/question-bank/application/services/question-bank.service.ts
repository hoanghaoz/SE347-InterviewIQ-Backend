import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { PageResult } from '../../../../shared/common/pagination';
import {
  IQuestionBankRepository,
  type QuestionBankItemData,
} from '../../domain/repositories/question-bank.repo.interface';
import type { QuestionBankQueryDto } from '../dtos/question-bank.request.dto';
import type { QuestionBankItemDto } from '../dtos/question-bank.response.dto';
import { IQuestionBankService } from '../interfaces/question-bank.service.interface';

function toItemDto(item: QuestionBankItemData): QuestionBankItemDto {
  return {
    id: item.publicId,
    content: item.content,
    domain: item.domain,
    difficulty: item.difficulty,
    createdAt: item.createdAt.toISOString(),
  };
}

@Injectable()
export class QuestionBankService implements IQuestionBankService {
  constructor(private readonly questionBankRepo: IQuestionBankRepository) {}

  async listAsync(
    userPublicId: string,
    query: QuestionBankQueryDto,
  ): Promise<Result<PageResult<QuestionBankItemDto>, AppError>> {
    const result = await this.questionBankRepo.listItems(
      userPublicId,
      { pageNumber: query.pageNumber, pageSize: query.pageSize },
      {
        domain: query.domain,
        difficulty: query.difficulty,
        // Chuỗi chỉ có khoảng trắng đã thành '' sau khi cắt: coi như không lọc.
        search: query.search ? query.search : undefined,
      },
    );
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to load the question bank',
        ),
      );
    }

    const page = result.value;
    return ok(
      new PageResult(
        page.items.map(toItemDto),
        page.totalItems,
        query.pageNumber,
        query.pageNumber,
        query.pageSize,
      ),
    );
  }
}
