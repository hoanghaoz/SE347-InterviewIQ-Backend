import {
  hashQuestionContent,
  normalizeQuestionContent,
} from './question-content';

describe('normalizeQuestionContent', () => {
  it('ignores case and extra whitespace', () => {
    expect(
      normalizeQuestionContent('  Explain   a\tPROCESS\nvs a thread. '),
    ).toBe('explain a process vs a thread.');
  });

  it('treats unicode-equivalent forms as the same text', () => {
    // Cùng một chữ ý: ký tự ghép sẵn U+00FD và y cộng dấu sắc rời U+0301.
    const composed = String.fromCodePoint(0xfd);
    const decomposed = 'y' + String.fromCodePoint(0x301);
    expect(composed).not.toBe(decomposed);
    expect(normalizeQuestionContent(composed)).toBe(
      normalizeQuestionContent(decomposed),
    );
  });

  it('keeps Vietnamese diacritics: different words stay different', () => {
    expect(normalizeQuestionContent('ý tưởng')).not.toBe(
      normalizeQuestionContent('y tuong'),
    );
  });
});

describe('hashQuestionContent', () => {
  it('returns a 64 character lowercase hex SHA-256', () => {
    expect(hashQuestionContent('hello')).toMatch(/^[0-9a-f]{64}$/);
    // SHA-256("hello")
    expect(hashQuestionContent('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('gives the same hash for texts that only differ in case and spacing', () => {
    expect(hashQuestionContent('What is  a Thread?')).toBe(
      hashQuestionContent(' what is a thread? '),
    );
  });

  it('gives different hashes for different questions', () => {
    expect(hashQuestionContent('What is a thread?')).not.toBe(
      hashQuestionContent('What is a process?'),
    );
  });
});
