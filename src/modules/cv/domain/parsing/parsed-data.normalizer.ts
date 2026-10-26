import { err, ok, Result } from 'neverthrow';
import type {
  CvEducation,
  CvExperience,
  CvParsedData,
  CvProject,
} from '../types/cv-parsed-data.type';

export const PARSED_DATA_LIMITS = {
  summaryLength: 2000,
  skillCount: 50,
  skillLength: 60,
  experienceCount: 20,
  educationCount: 10,
  projectCount: 20,
  technologyCount: 20,
  titleLength: 150,
  descriptionLength: 1000,
  roleLength: 100,
  minGraduationYear: 1950,
  maxGraduationYear: 2100,
} as const;

export const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const FULL_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.replaceAll('\u0000', '').trim();
  return text === '' ? null : text.slice(0, maxLength);
}

function cleanList(
  value: unknown,
  maxCount: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = cleanText(item, maxLength);
    if (text === null || seen.has(text.toLowerCase())) {
      continue;
    }
    seen.add(text.toLowerCase());
    result.push(text);
    if (result.length === maxCount) {
      break;
    }
  }
  return result;
}

function cleanYearMonth(value: unknown): string | null {
  const text = cleanText(value, 10);
  if (text === null) {
    return null;
  }
  if (YEAR_MONTH_PATTERN.test(text)) {
    return text;
  }
  return FULL_DATE_PATTERN.test(text) ? text.slice(0, 7) : null;
}

function cleanYear(value: unknown): number | null {
  const year =
    typeof value === 'string' && /^\d{4}$/.test(value.trim())
      ? Number(value.trim())
      : value;
  return typeof year === 'number' &&
    Number.isInteger(year) &&
    year >= PARSED_DATA_LIMITS.minGraduationYear &&
    year <= PARSED_DATA_LIMITS.maxGraduationYear
    ? year
    : null;
}

function collect<T>(
  value: unknown,
  maxCount: number,
  build: (raw: PlainObject) => T | null,
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: T[] = [];
  for (const raw of value) {
    const item = isPlainObject(raw) ? build(raw) : null;
    if (item === null) {
      continue;
    }
    items.push(item);
    if (items.length === maxCount) {
      break;
    }
  }
  return items;
}

function buildExperience(raw: PlainObject): CvExperience | null {
  const company = cleanText(raw.company, PARSED_DATA_LIMITS.titleLength);
  const position = cleanText(raw.position, PARSED_DATA_LIMITS.titleLength);
  if (company === null || position === null) {
    return null;
  }
  return {
    company,
    position,
    startDate: cleanYearMonth(raw.startDate),
    endDate: cleanYearMonth(raw.endDate),
    description: cleanText(
      raw.description,
      PARSED_DATA_LIMITS.descriptionLength,
    ),
    technologies: cleanList(
      raw.technologies,
      PARSED_DATA_LIMITS.technologyCount,
      PARSED_DATA_LIMITS.skillLength,
    ),
  };
}

function buildEducation(raw: PlainObject): CvEducation | null {
  const institution = cleanText(
    raw.institution,
    PARSED_DATA_LIMITS.titleLength,
  );
  if (institution === null) {
    return null;
  }
  return {
    institution,
    degree: cleanText(raw.degree, PARSED_DATA_LIMITS.titleLength),
    graduationYear: cleanYear(raw.graduationYear),
  };
}

function buildProject(raw: PlainObject): CvProject | null {
  const name = cleanText(raw.name, PARSED_DATA_LIMITS.titleLength);
  if (name === null) {
    return null;
  }
  return {
    name,
    description: cleanText(
      raw.description,
      PARSED_DATA_LIMITS.descriptionLength,
    ),
    role: cleanText(raw.role, PARSED_DATA_LIMITS.roleLength),
  };
}

export function normalizeParsedData(
  input: unknown,
): Result<CvParsedData, Error> {
  if (!isPlainObject(input)) {
    return err(new Error('Parsed data must be a JSON object'));
  }

  const skills = isPlainObject(input.skills) ? input.skills : {};
  const skillList = (value: unknown): string[] =>
    cleanList(
      value,
      PARSED_DATA_LIMITS.skillCount,
      PARSED_DATA_LIMITS.skillLength,
    );

  return ok({
    summary: cleanText(input.summary, PARSED_DATA_LIMITS.summaryLength),
    skills: {
      languages: skillList(skills.languages),
      frameworks: skillList(skills.frameworks),
      databases: skillList(skills.databases),
      tools: skillList(skills.tools),
    },
    experiences: collect(
      input.experiences,
      PARSED_DATA_LIMITS.experienceCount,
      buildExperience,
    ),
    education: collect(
      input.education,
      PARSED_DATA_LIMITS.educationCount,
      buildEducation,
    ),
    projects: collect(
      input.projects,
      PARSED_DATA_LIMITS.projectCount,
      buildProject,
    ),
  });
}

export function isParsedDataEmpty(data: CvParsedData): boolean {
  return (
    data.summary === null &&
    data.skills.languages.length === 0 &&
    data.skills.frameworks.length === 0 &&
    data.skills.databases.length === 0 &&
    data.skills.tools.length === 0 &&
    data.experiences.length === 0 &&
    data.education.length === 0 &&
    data.projects.length === 0
  );
}
