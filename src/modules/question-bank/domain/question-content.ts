import { createHash } from 'node:crypto';

/**
 * Dạng chuẩn để so trùng hai câu hỏi: bỏ khác biệt hoa thường, khoảng trắng thừa và các
 * biến thể unicode tương đương (NFKC). Dấu tiếng Việt được giữ nguyên: "ý" và "y" là hai câu.
 */
export function normalizeQuestionContent(content: string): string {
  return content.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** SHA-256 (hex, 64 ký tự) của nội dung đã chuẩn hóa; khớp cột `content_hash`. */
export function hashQuestionContent(content: string): string {
  return createHash('sha256')
    .update(normalizeQuestionContent(content))
    .digest('hex');
}
