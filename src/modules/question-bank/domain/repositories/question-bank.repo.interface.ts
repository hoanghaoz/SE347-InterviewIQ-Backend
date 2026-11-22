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

// Một câu hỏi của phiên phỏng vấn, nguồn để lưu vào ngân hàng.
export type SessionQuestionData = {
  publicId: string;
  content: string;
  domain: QuestionDomain;
  difficulty: QuestionDifficulty;
};

export type NewQuestionBankItem = {
  content: string;
  // SHA-256 của nội dung đã chuẩn hóa (xem question-content.ts).
  contentHash: string;
  domain: QuestionDomain;
  difficulty: QuestionDifficulty;
};

export type AddItemsResult = {
  savedCount: number;
  // Câu đã có trong ngân hàng hoặc trùng nhau trong cùng yêu cầu.
  skippedCount: number;
};

export abstract class IQuestionBankRepository {
  // Chỉ trả câu hỏi của người dùng này, mới nhất trước.
  abstract listItems(
    userPublicId: string,
    pagination: PaginationRequest,
    filter: QuestionBankFilter,
  ): Promise<Result<QuestionBankPage, Error>>;

  // Resolves to null when the session does not exist or is not owned by the user.
  abstract getSessionQuestions(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<SessionQuestionData[] | null, Error>>;

  // Lưu trong một giao dịch có khóa hàng của người dùng để hai yêu cầu song song không cùng
  // vượt giới hạn. Fails with QuestionBankFullError when the bank would exceed `maxItems`
  // and with QuestionBankUnavailableError when the user no longer exists.
  abstract addItems(
    userPublicId: string,
    items: NewQuestionBankItem[],
    maxItems: number,
  ): Promise<Result<AddItemsResult, Error>>;

  // Xóa câu của chính người dùng; câu không tồn tại hoặc của người khác không phải lỗi.
  abstract deleteItem(
    userPublicId: string,
    itemPublicId: string,
  ): Promise<Result<void, Error>>;
}
