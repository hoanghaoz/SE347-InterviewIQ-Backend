import { UUID } from 'crypto';
import { Request } from 'express';
import { CommonUserRole } from './commonEnum';

export interface JwtPayload {
  email: string;
  sub: UUID;
  role: CommonUserRole; // consider using enum type for better type safety
}

export interface RequestWithUser extends Request {
  user: JwtPayload;
}
