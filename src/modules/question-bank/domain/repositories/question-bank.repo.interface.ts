import type { Result } from 'neverthrow';
import type { PaginationRequest } from '../../../../shared/common/pagination';
import type {
  QuestionDifficulty,
  QuestionDomain,
} from '../../../question-generation/domain/enums/question.enum';

export type QuestionBankItemData = {
  publicId: string;
  content: string;
  domain: QuestionDomain;
  difficulty: QuestionDifficulty;
  createdAt: Date;
};

export type QuestionBankFilter = {
  domain?: QuestionDomain;
  difficulty?: QuestionDifficulty;
  // Đã cắt khoảng trắng hai đầu và không rỗng; so khớp không phân biệt hoa thường.
  search?: string;
};

export type QuestionBankPage = {
  items: QuestionBankItemData[];
  totalItems: number;
};

export abstract class IQuestionBankRepository {
  // Chỉ trả câu hỏi của người dùng này, mới nhất trước.
  abstract listItems(
    userPublicId: string,
    pagination: PaginationRequest,
    filter: QuestionBankFilter,
  ): Promise<Result<QuestionBankPage, Error>>;
}
