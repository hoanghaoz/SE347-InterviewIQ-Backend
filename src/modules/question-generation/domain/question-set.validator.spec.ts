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
