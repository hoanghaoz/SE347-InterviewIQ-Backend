import bcrypt from 'bcrypt';
import { Injectable } from '@nestjs/common';
import { IPasswordHasher } from '../domain/repositories/password-hasher.interface';
import { Result, ok, err } from 'neverthrow';
import { Logger } from 'node_modules/@nestjs/common/services/logger.service';

const SALT_ROUNDS = 10;

@Injectable()
export class BcryptPasswordHasher implements IPasswordHasher {
  private readonly logger = new Logger(BcryptPasswordHasher.name);

  async hash(password: string): Promise<Result<string, Error>> {
    try {
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      return ok(hashedPassword);
    } catch (error) {
      this.logger.error(`Failed to hash password: ${(error as Error).message}`);
      return err(new Error('Failed to hash password'));
    }
  }
  async compare(
    password: string,
    hashedPassword: string,
  ): Promise<Result<boolean, Error>> {
    try {
      const isMatch = await bcrypt.compare(password, hashedPassword);
      return ok(isMatch);
    } catch (error) {
      this.logger.error(
        `Failed to compare password: ${(error as Error).message}`,
      );
      return err(new Error('Failed to compare password'));
    }
  }
}
