import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { mapValidationErrors } from '../../../../shared/common/validation-error.mapper';
import { UpdateParsedDataRequestDto } from './cv.request.dto';

const valid = () => ({
  summary: 'Backend developer.',
  skills: {
    languages: ['TypeScript'],
    frameworks: ['NestJS'],
    databases: [],
    tools: ['Docker'],
  },
  experiences: [
    {
      company: 'ABC Tech',
      position: 'Intern',
      startDate: '2025-06',
      endDate: null,
      description: null,
      technologies: ['NestJS'],
    },
  ],
  education: [{ institution: 'UIT', degree: null, graduationYear: 2026 }],
  projects: [{ name: 'InterviewIQ', description: null, role: 'Backend' }],
});

const check = (body: unknown): Promise<ValidationError[]> =>
  validate(plainToInstance(UpdateParsedDataRequestDto, body), {
    whitelist: true,
  });

const fieldsOf = async (body: unknown): Promise<string[]> =>
  mapValidationErrors(await check(body)).map((detail) => detail.field);

describe('UpdateParsedDataRequestDto', () => {
  it('accepts a complete valid body', async () => {
    expect(await check(valid())).toHaveLength(0);
  });

  it('accepts null for the optional single values', async () => {
    const body = { ...valid(), summary: null };

    expect(await check(body)).toHaveLength(0);
  });

  it('accepts empty lists', async () => {
    const body = { ...valid(), experiences: [], education: [], projects: [] };

    expect(await check(body)).toHaveLength(0);
  });

  it('requires skills and the three lists', async () => {
    const fields = await fieldsOf({});

    expect(fields).toEqual(
      expect.arrayContaining([
        'skills',
        'experiences',
        'education',
        'projects',
      ]),
    );
  });

  it('reports the exact path of a bad value inside a nested item', async () => {
    const body = valid();
    body.experiences[0].startDate = '07/2025';

    expect(await fieldsOf(body)).toContain('experiences[0].startDate');
  });

  it('requires company and position of an experience', async () => {
    const body = valid();
    body.experiences[0].company = '';

    expect(await fieldsOf(body)).toContain('experiences[0].company');
  });

  it('rejects a graduation year that is not a whole number in range', async () => {
    for (const year of [1800, 2024.5, '2024']) {
      const body = valid();
      (body.education[0] as { graduationYear: unknown }).graduationYear = year;

      expect(await fieldsOf(body)).toContain('education[0].graduationYear');
    }
  });

  it('rejects a skill that is not a string or is too long', async () => {
    const body = valid();
    (body.skills.tools as unknown[]).push(42, 'x'.repeat(61));

    const fields = await fieldsOf(body);

    expect(fields).toContain('skills.tools');
  });

  it('rejects more items than the limit', async () => {
    const body: Record<string, unknown> = valid();
    body.projects = Array.from({ length: 21 }, (_, index) => ({
      name: `p${index}`,
    }));

    expect(await fieldsOf(body)).toContain('projects');
  });

  it('rejects a summary over 2000 characters', async () => {
    expect(await fieldsOf({ ...valid(), summary: 'a'.repeat(2001) })).toContain(
      'summary',
    );
  });
});
