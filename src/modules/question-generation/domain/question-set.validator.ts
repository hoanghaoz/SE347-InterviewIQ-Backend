import { err, ok, type Result } from 'neverthrow';
import { MAX_QUESTION_CONTENT_LENGTH } from './constants/question-generation.constants';
import { QuestionDifficulty, QuestionDomain } from './enums/question.enum';
import type { GeneratedQuestion } from './repositories/question-generation.repo.interface';

const DOMAINS = new Set<string>(Object.values(QuestionDomain));
const DIFFICULTIES = new Set<string>(Object.values(QuestionDifficulty));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks the raw model output against the contract and assigns order indexes.
 * The error message is for logs only and must never reach the client.
 */
export function validateQuestionSet(
  raw: unknown,
  expectedCount: number,
): Result<GeneratedQuestion[], Error> {
  if (!isRecord(raw) || !Array.isArray(raw.questions)) {
    return err(new Error('Output has no questions array'));
  }
  if (raw.questions.length !== expectedCount) {
    return err(
      new Error(
        `Expected ${expectedCount} questions, got ${raw.questions.length}`,
      ),
    );
  }

  const seen = new Set<string>();
  const questions: GeneratedQuestion[] = [];

  for (const [index, item] of raw.questions.entries()) {
    if (!isRecord(item)) {
      return err(new Error(`Question ${index + 1} is not an object`));
    }
    const content = typeof item.content === 'string' ? item.content.trim() : '';
    if (content.length === 0 || content.length > MAX_QUESTION_CONTENT_LENGTH) {
      return err(new Error(`Question ${index + 1} has invalid content`));
    }
    if (typeof item.domain !== 'string' || !DOMAINS.has(item.domain)) {
      return err(new Error(`Question ${index + 1} has invalid domain`));
    }
    if (
      typeof item.difficulty !== 'string' ||
      !DIFFICULTIES.has(item.difficulty)
    ) {
      return err(new Error(`Question ${index + 1} has invalid difficulty`));
    }
    const key = content.toLowerCase();
    if (seen.has(key)) {
      return err(new Error(`Question ${index + 1} is a duplicate`));
    }
    seen.add(key);
    questions.push({
      orderIndex: index + 1,
      content,
      domain: item.domain as QuestionDomain,
      difficulty: item.difficulty as QuestionDifficulty,
    });
  }

  return ok(questions);
}
