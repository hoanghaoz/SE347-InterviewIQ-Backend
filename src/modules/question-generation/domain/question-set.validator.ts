import { err, ok, type Result } from 'neverthrow';
import { MAX_QUESTION_CONTENT_LENGTH } from './constants/question-generation.constants';
import { QuestionDifficulty, QuestionDomain } from './enums/question.enum';
import type { GeneratedQuestion } from './repositories/question-generation.repo.interface';

const DOMAINS = new Set<string>(Object.values(QuestionDomain));
const DIFFICULTIES = new Set<string>(Object.values(QuestionDifficulty));

export type QuestionSetConstraints = {
  // Every question must have this domain / difficulty.
  domain?: QuestionDomain;
  difficulty?: QuestionDifficulty;
  // Texts the set must not repeat.
  exclude?: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Same text up to case and spacing counts as a repeat.
function repeatKey(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Checks the raw model output against the contract and assigns order indexes.
 * The error message is for logs only and must never reach the client.
 */
export function validateQuestionSet(
  raw: unknown,
  expectedCount: number,
  constraints: QuestionSetConstraints = {},
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

  const seen = new Set<string>((constraints.exclude ?? []).map(repeatKey));
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
    // Both were checked against the enum values above.
    const domain = item.domain as QuestionDomain;
    const difficulty = item.difficulty as QuestionDifficulty;
    if (constraints.domain && domain !== constraints.domain) {
      return err(
        new Error(
          `Question ${index + 1} is not of domain ${constraints.domain}`,
        ),
      );
    }
    if (constraints.difficulty && difficulty !== constraints.difficulty) {
      return err(
        new Error(
          `Question ${index + 1} is not of difficulty ${constraints.difficulty}`,
        ),
      );
    }
    const key = repeatKey(content);
    if (seen.has(key)) {
      return err(new Error(`Question ${index + 1} is a duplicate`));
    }
    seen.add(key);
    questions.push({
      orderIndex: index + 1,
      content,
      domain,
      difficulty,
    });
  }

  return ok(questions);
}
