import { MAX_CV_TEXT_LENGTH, normalizeCvText } from './cv-text';

describe('normalizeCvText', () => {
  it('removes NUL characters, which PostgreSQL text columns reject', () => {
    expect(normalizeCvText('Nguyen\u0000 Van A')).toBe('Nguyen Van A');
  });

  it('collapses runs of spaces and blank lines and trims the result', () => {
    expect(normalizeCvText('  Skills:   React \t TS\n\n\n\nExperience  ')).toBe(
      'Skills: React TS\n\nExperience',
    );
  });

  it('cuts the text to the maximum length', () => {
    expect(normalizeCvText('a'.repeat(MAX_CV_TEXT_LENGTH + 500))).toHaveLength(
      MAX_CV_TEXT_LENGTH,
    );
  });

  it('turns a blank text into an empty string', () => {
    expect(normalizeCvText(' \n\t ')).toBe('');
  });
});
