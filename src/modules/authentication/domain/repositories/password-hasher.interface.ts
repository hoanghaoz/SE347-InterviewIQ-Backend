import type { Result } from 'neverthrow';

export abstract class IPasswordHasher {
  abstract hash(plain: string): Promise<Result<string, Error>>;
  abstract compare(
    plain: string,
    hashed: string,
  ): Promise<Result<boolean, Error>>;
}
