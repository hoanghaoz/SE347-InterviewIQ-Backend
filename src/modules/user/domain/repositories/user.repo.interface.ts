import { Result } from 'neverthrow';

// Returned by createUser when the email is already taken (unique constraint).
export class UserAlreadyExistsError extends Error {
  constructor() {
    super('A user with this email already exists.');
  }
}

export type CreateUserData = {
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
};

export abstract class IUserRepository {
  abstract getUserByEmail(
    email: string,
  ): Promise<Result<{ id: number } | null, Error>>;

  // Fails with UserAlreadyExistsError on a duplicate email.
  abstract createUser(
    data: CreateUserData,
  ): Promise<Result<{ id: number }, Error>>;
}
