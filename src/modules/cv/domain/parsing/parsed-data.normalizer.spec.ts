import {
  isParsedDataEmpty,
  normalizeParsedData,
  PARSED_DATA_LIMITS,
} from './parsed-data.normalizer';

const valid = {
  summary: '  Sinh viên backend.  ',
  skills: {
    languages: ['TypeScript', 'typescript', ' Java '],
    frameworks: ['NestJS'],
    databases: [],
    tools: ['Docker'],
  },
  experiences: [
    {
      company: 'ABC Tech',
      position: 'Backend Intern',
      startDate: '2025-06',
      endDate: null,
      description: 'Built APIs.',
      technologies: ['NestJS', 'PostgreSQL'],
    },
  ],
  education: [{ institution: 'UIT', degree: 'Kỹ sư', graduationYear: 2026 }],
  projects: [{ name: 'InterviewIQ', description: null, role: 'Backend' }],
};

describe('normalizeParsedData', () => {
  it('keeps a valid object and trims and de-duplicates the values', () => {
    const result = normalizeParsedData(valid)._unsafeUnwrap();

    expect(result.summary).toBe('Sinh viên backend.');
    expect(result.skills.languages).toEqual(['TypeScript', 'Java']);
    expect(result.experiences[0]).toEqual(valid.experiences[0]);
    expect(result.education).toEqual(valid.education);
    expect(result.projects).toEqual(valid.projects);
  });

  it.each([null, undefined, 'text', 42, ['a'], true])(
    'rejects %p because it is not a JSON object',
    (input) => {
      expect(normalizeParsedData(input).isErr()).toBe(true);
    },
  );

  it('turns missing fields into null and empty lists, never undefined', () => {
    const result = normalizeParsedData({})._unsafeUnwrap();

    expect(result).toEqual({
      summary: null,
      skills: { languages: [], frameworks: [], databases: [], tools: [] },
      experiences: [],
      education: [],
      projects: [],
    });
  });

  it('ignores values of the wrong type instead of failing', () => {
    const result = normalizeParsedData({
      summary: 12,
      skills: { languages: 'TypeScript', tools: [1, null, 'Git'] },
      experiences: 'none',
      education: [null, 'x'],
      projects: { name: 'x' },
    })._unsafeUnwrap();

    expect(result.summary).toBeNull();
    expect(result.skills.languages).toEqual([]);
    expect(result.skills.tools).toEqual(['Git']);
    expect(result.experiences).toEqual([]);
    expect(result.education).toEqual([]);
    expect(result.projects).toEqual([]);
  });

  it('drops an experience that has no company or no position', () => {
    const result = normalizeParsedData({
      experiences: [
        { company: 'ABC', position: ' ' },
        { position: 'Dev' },
        { company: 'XYZ', position: 'Dev' },
      ],
    })._unsafeUnwrap();

    expect(result.experiences.map((item) => item.company)).toEqual(['XYZ']);
  });

  it('accepts YYYY-MM, shortens YYYY-MM-DD and nulls anything else', () => {
    const [a, b, c, d] = normalizeParsedData({
      experiences: [
        {
          company: 'A',
          position: 'P',
          startDate: '2024-07',
          endDate: '2025-13',
        },
        {
          company: 'B',
          position: 'P',
          startDate: '2024-07-15',
          endDate: 'now',
        },
        { company: 'C', position: 'P', startDate: '2024', endDate: '' },
        { company: 'D', position: 'P', startDate: 20240701, endDate: null },
      ],
    })._unsafeUnwrap().experiences;

    expect([a.startDate, a.endDate]).toEqual(['2024-07', null]);
    expect([b.startDate, b.endDate]).toEqual(['2024-07', null]);
    expect([c.startDate, c.endDate]).toEqual([null, null]);
    expect([d.startDate, d.endDate]).toEqual([null, null]);
  });

  it('accepts a graduation year as number or 4-digit string within range', () => {
    const result = normalizeParsedData({
      education: [
        { institution: 'A', graduationYear: 2026 },
        { institution: 'B', graduationYear: '2024' },
        { institution: 'C', graduationYear: 1800 },
        { institution: 'D', graduationYear: 2024.5 },
        { institution: 'E', graduationYear: 'soon' },
      ],
    })._unsafeUnwrap();

    expect(result.education.map((item) => item.graduationYear)).toEqual([
      2026,
      2024,
      null,
      null,
      null,
    ]);
  });

  it('limits how many items and how many characters are kept', () => {
    const result = normalizeParsedData({
      summary: 'a'.repeat(PARSED_DATA_LIMITS.summaryLength + 50),
      skills: {
        languages: Array.from({ length: 80 }, (_, index) => `lang-${index}`),
      },
      projects: Array.from({ length: 50 }, (_, index) => ({
        name: `project-${index}`,
      })),
    })._unsafeUnwrap();

    expect(result.summary).toHaveLength(PARSED_DATA_LIMITS.summaryLength);
    expect(result.skills.languages).toHaveLength(PARSED_DATA_LIMITS.skillCount);
    expect(result.projects).toHaveLength(PARSED_DATA_LIMITS.projectCount);
  });

  it('removes NUL characters from every string', () => {
    const result = normalizeParsedData({
      summary: 'a\u0000b',
      skills: { tools: ['Git\u0000'] },
    })._unsafeUnwrap();

    expect(result.summary).toBe('ab');
    expect(result.skills.tools).toEqual(['Git']);
  });
});

describe('isParsedDataEmpty', () => {
  it('is true when nothing was found and false as soon as one field has data', () => {
    const empty = normalizeParsedData({})._unsafeUnwrap();
    expect(isParsedDataEmpty(empty)).toBe(true);

    expect(isParsedDataEmpty({ ...empty, summary: 'x' })).toBe(false);
    expect(
      isParsedDataEmpty({
        ...empty,
        skills: { ...empty.skills, tools: ['Git'] },
      }),
    ).toBe(false);
    expect(
      isParsedDataEmpty({
        ...empty,
        projects: [{ name: 'P', description: null, role: null }],
      }),
    ).toBe(false);
  });
});
