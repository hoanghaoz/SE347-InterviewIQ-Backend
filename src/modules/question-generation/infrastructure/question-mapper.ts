import {
  QuestionDifficulty as PrismaQuestionDifficulty,
  QuestionDomain as PrismaQuestionDomain,
} from '../../../../generated/prisma/enums';
import {
  QuestionDifficulty,
  QuestionDomain,
} from '../domain/enums/question.enum';

const domainToPrisma: Record<QuestionDomain, PrismaQuestionDomain> = {
  [QuestionDomain.TECHNICAL]: PrismaQuestionDomain.TECHNICAL,
  [QuestionDomain.BEHAVIORAL]: PrismaQuestionDomain.BEHAVIORAL,
  [QuestionDomain.SITUATIONAL]: PrismaQuestionDomain.SITUATIONAL,
};

const domainToDomain: Record<PrismaQuestionDomain, QuestionDomain> = {
  [PrismaQuestionDomain.TECHNICAL]: QuestionDomain.TECHNICAL,
  [PrismaQuestionDomain.BEHAVIORAL]: QuestionDomain.BEHAVIORAL,
  [PrismaQuestionDomain.SITUATIONAL]: QuestionDomain.SITUATIONAL,
};

const difficultyToPrisma: Record<QuestionDifficulty, PrismaQuestionDifficulty> =
  {
    [QuestionDifficulty.EASY]: PrismaQuestionDifficulty.EASY,
    [QuestionDifficulty.MEDIUM]: PrismaQuestionDifficulty.MEDIUM,
    [QuestionDifficulty.HARD]: PrismaQuestionDifficulty.HARD,
  };

const difficultyToDomain: Record<PrismaQuestionDifficulty, QuestionDifficulty> =
  {
    [PrismaQuestionDifficulty.EASY]: QuestionDifficulty.EASY,
    [PrismaQuestionDifficulty.MEDIUM]: QuestionDifficulty.MEDIUM,
    [PrismaQuestionDifficulty.HARD]: QuestionDifficulty.HARD,
  };

export function mapDomainToPrisma(domain: QuestionDomain) {
  return domainToPrisma[domain];
}

export function mapDomainToDomain(domain: PrismaQuestionDomain) {
  return domainToDomain[domain];
}

export function mapDifficultyToPrisma(difficulty: QuestionDifficulty) {
  return difficultyToPrisma[difficulty];
}

export function mapDifficultyToDomain(difficulty: PrismaQuestionDifficulty) {
  return difficultyToDomain[difficulty];
}
