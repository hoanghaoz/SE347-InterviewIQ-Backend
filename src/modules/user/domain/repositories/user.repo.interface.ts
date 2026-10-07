import { Result } from 'neverthrow';

export abstract class IUserRepository {
  abstract getUserEmail(
    email: string,
  ): Promise<Result<{ id: number } | null, Error>>;
}
