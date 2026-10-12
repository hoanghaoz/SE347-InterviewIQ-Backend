import { Injectable } from '@nestjs/common';
import { ITokenHasher } from '../domain/repositories/token-hasher.interface';
import * as crypto from 'crypto';

@Injectable()
export class Sha256TokenHasher implements ITokenHasher {
  generateToken(): string {
    // Generate a random token (you can use any method you prefer)
    const randomBytes = crypto.randomBytes(32);
    return randomBytes.toString('hex');
  }
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
