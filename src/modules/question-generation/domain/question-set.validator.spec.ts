import { QuestionDifficulty, QuestionDomain } from './enums/question.enum';
import { validateQuestionSet } from './question-set.validator';

const question = (overrides: Record<string, unknown> = {}) => ({
  content: 'Describe a REST API you designed.',
  domain: 'TECHNICAL',
  difficulty: 'EASY',
  ...overrides,
});

describe('validateQuestionSet', () => {
  it('accepts a valid set, trims content and assigns order indexes', () => {
    const result = validateQuestionSet(
      {
        questions: [
          question({ content: '  First question?  ' }),
          question({ content: 'Second question?', domain: 'BEHAVIORAL' }),
        ],
      },
      2,
    );

    expect(result._unsafeUnwrap()).toEqual([
      {
        orderIndex: 1,
        content: 'First question?',
        domain: 'TECHNICAL',
        difficulty: 'EASY',
      },
      {
        orderIndex: 2,
        content: 'Second question?',
        domain: 'BEHAVIORAL',
        difficulty: 'EASY',
      },
    ]);
  });

  it.each([
    ['null output', null],
    ['an array output', []],
    ['missing questions', {}],
    ['questions that is not an array', { questions: 'x' }],
  ])('rejects %s', (_label, raw) => {
    expect(validateQuestionSet(raw, 1).isErr()).toBe(true);
  });

  it('rejects the wrong number of questions', () => {
    const result = validateQuestionSet({ questions: [question()] }, 2);

    expect(result.isErr()).toBe(true);
  });

  it.each([
    ['a non-object item', 'text'],
    ['empty content', question({ content: '   ' })],
    ['non-string content', question({ content: 5 })],
    ['content over 500 characters', question({ content: 'a'.repeat(501) })],
    ['an unknown domain', question({ domain: 'OTHER' })],
    ['an unknown difficulty', question({ difficulty: 'EXTREME' })],
  ])('rejects %s', (_label, item) => {
    expect(validateQuestionSet({ questions: [item] }, 1).isErr()).toBe(true);
  });

  it('accepts content of exactly 500 characters', () => {
    const result = validateQuestionSet(
      { questions: [question({ content: 'a'.repeat(500) })] },
      1,
    );

    expect(result.isOk()).toBe(true);
  });

  it('rejects duplicate questions ignoring case', () => {
    const result = validateQuestionSet(
      {
        questions: [
          question({ content: 'Same question?' }),
          question({ content: 'same QUESTION?' }),
        ],
      },
      2,
    );

    expect(result.isErr()).toBe(true);
  });
});

describe('validateQuestionSet constraints', () => {
  const setOf = (...overrides: Record<string, unknown>[]) => ({
    questions: overrides.map((override) => question(override)),
  });

  it('accepts questions that match the requested domain and difficulty', () => {
    const result = validateQuestionSet(
      setOf({ content: 'One?', domain: 'BEHAVIORAL', difficulty: 'HARD' }),
      1,
      {
        domain: QuestionDomain.BEHAVIORAL,
        difficulty: QuestionDifficulty.HARD,
      },
    );

    expect(result.isOk()).toBe(true);
  });

  it('rejects a question of another domain', () => {
    const result = validateQuestionSet(setOf({ domain: 'TECHNICAL' }), 1, {
      domain: QuestionDomain.BEHAVIORAL,
    });

    expect(result.isErr()).toBe(true);
  });

  it('rejects a question of another difficulty', () => {
    const result = validateQuestionSet(setOf({ difficulty: 'EASY' }), 1, {
      difficulty: QuestionDifficulty.HARD,
    });

    expect(result.isErr()).toBe(true);
  });

  it('does not constrain what is left unset', () => {
    const result = validateQuestionSet(
      setOf(
        { content: 'A?', domain: 'TECHNICAL' },
        { content: 'B?', domain: 'BEHAVIORAL' },
      ),
      2,
      { difficulty: QuestionDifficulty.EASY },
    );

    expect(result.isOk()).toBe(true);
  });

  it('rejects a question that repeats an excluded text, ignoring case and spacing', () => {
    const result = validateQuestionSet(
      setOf({ content: '  what is   a THREAD? ' }),
      1,
      { exclude: ['What is a thread?'] },
    );

    expect(result.isErr()).toBe(true);
  });

  it('accepts a question that is not among the excluded texts', () => {
    const result = validateQuestionSet(
      setOf({ content: 'What is a process?' }),
      1,
      {
        exclude: ['What is a thread?'],
      },
    );

    expect(result.isOk()).toBe(true);
  });
});
