import { Result } from 'neverthrow';

export abstract class IUserRepository {
  abstract getUserByEmail(
    email: string,
  ): Promise<Result<{ id: number } | null, Error>>;
}
