import { UUID } from 'crypto';
import { Request } from 'express';

export interface JwtPayload {
  email: string;
  sub: UUID;
  role: string; // consider using enum type for better type safety
}

export interface RequestWithUser extends Request {
  user: JwtPayload;
}
