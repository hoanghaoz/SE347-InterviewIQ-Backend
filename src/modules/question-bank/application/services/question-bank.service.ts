import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { AppError, ErrorCode } from '../../../../shared/common/errorCode';
import { PageResult } from '../../../../shared/common/pagination';
import { MAX_BANK_ITEMS_PER_USER } from '../../domain/constants/question-bank.constants';
import {
  QuestionBankFullError,
  QuestionBankUnavailableError,
} from '../../domain/errors/question-bank.error';
import { hashQuestionContent } from '../../domain/question-content';
import {
  IQuestionBankRepository,
  type QuestionBankItemData,
} from '../../domain/repositories/question-bank.repo.interface';
import type {
  QuestionBankQueryDto,
  SaveQuestionBankRequestDto,
} from '../dtos/question-bank.request.dto';
import type {
  QuestionBankItemDto,
  SaveQuestionBankResponseDto,
} from '../dtos/question-bank.response.dto';
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

  async saveFromSessionAsync(
    userPublicId: string,
    request: SaveQuestionBankRequestDto,
  ): Promise<Result<SaveQuestionBankResponseDto, AppError>> {
    const loaded = await this.questionBankRepo.getSessionQuestions(
      userPublicId,
      request.sessionPublicId,
    );
    if (loaded.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to load the session questions',
        ),
      );
    }
    // Phiên không tồn tại và phiên của người khác trả cùng một 404.
    if (loaded.value === null) {
      return err(
        new AppError(ErrorCode.NotFound, 'Interview session not found'),
      );
    }

    let selected = loaded.value;
    if (request.questionPublicIds) {
      const wanted = new Set(request.questionPublicIds);
      selected = selected.filter((question) => wanted.has(question.publicId));
      // Có id không thuộc phiên này: từ chối cả yêu cầu thay vì lưu một phần.
      if (selected.length !== wanted.size) {
        return err(
          new AppError(
            ErrorCode.NotFound,
            'Interview question not found or unavailable',
          ),
        );
      }
    }
    if (selected.length === 0) {
      return err(
        new AppError(
          ErrorCode.BadRequest,
          'The session has no questions to save',
        ),
      );
    }

    const saved = await this.questionBankRepo.addItems(
      userPublicId,
      selected.map((question) => ({
        content: question.content,
        contentHash: hashQuestionContent(question.content),
        domain: question.domain,
        difficulty: question.difficulty,
      })),
      MAX_BANK_ITEMS_PER_USER,
    );
    if (saved.isErr()) {
      if (saved.error instanceof QuestionBankFullError) {
        return err(new AppError(ErrorCode.Conflict, saved.error.message));
      }
      if (saved.error instanceof QuestionBankUnavailableError) {
        return err(new AppError(ErrorCode.NotFound, saved.error.message));
      }
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to save to the question bank',
        ),
      );
    }
    return ok(saved.value);
  }

  async deleteAsync(
    userPublicId: string,
    itemPublicId: string,
  ): Promise<Result<void, AppError>> {
    const result = await this.questionBankRepo.deleteItem(
      userPublicId,
      itemPublicId,
    );
    if (result.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to delete the question',
        ),
      );
    }
    return ok(undefined);
  }
}
