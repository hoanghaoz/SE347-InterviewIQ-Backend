import { Result } from 'neverthrow';
import { PendingRegistration } from '../entities/pending-registration.entity';

export abstract class IPendingRegistrationStore {
  abstract savePendingRegistration(
    data: any,
    ttlSeconds: number,
  ): Promise<Result<void, Error>>;

  abstract findPendingRegistration(
    email: string,
  ): Promise<Result<PendingRegistration | null, Error>>;

  abstract deletePendingRegistration(
    email: string,
  ): Promise<Result<void, Error>>;
}
