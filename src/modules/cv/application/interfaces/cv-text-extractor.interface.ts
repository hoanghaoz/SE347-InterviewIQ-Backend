import { Result } from 'neverthrow';

export abstract class ICvTextExtractor {
  abstract extractTextAsync(pdf: Uint8Array): Promise<Result<string, Error>>;
}
