import { Result } from 'neverthrow';
import type { CvParsedData } from '../../domain/types/cv-parsed-data.type';

export type CvParseOutput = {
  parsedData: CvParsedData;
  parserVersion: string;
};

export abstract class ICvParser {
  abstract parseAsync(rawText: string): Promise<Result<CvParseOutput, Error>>;
}
