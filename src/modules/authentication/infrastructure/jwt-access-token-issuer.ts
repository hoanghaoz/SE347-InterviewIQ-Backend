import { Injectable, Logger } from '@nestjs/common';
import {
  AccessTokenPayload,
  IAccessTokenIssuer,
} from '../domain/repositories/access-token-issuer.interface';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { err, ok, Result } from 'neverthrow';

@Injectable()
export class JwtAccessTokenIssuer implements IAccessTokenIssuer {
  private readonly logger = new Logger(JwtAccessTokenIssuer.name);
  private readonly secret: string;
  private readonly expiresInSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    // Thiếu hoặc sai env thì crash lúc khởi động, không để lỗi lộ ra lúc login
    this.secret = configService.getOrThrow<string>('JWT_SECRET');
    this.expiresInSeconds = Number(
      configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
    );
    if (
      !Number.isInteger(this.expiresInSeconds) ||
      this.expiresInSeconds <= 0
    ) {
      throw new Error('JWT_ACCESS_EXPIRES_IN must be a positive integer');
    }
  }

  async issueAccessToken(
    payload: AccessTokenPayload,
  ): Promise<Result<string, Error>> {
    try {
      const token = await this.jwtService.signAsync(
        { sub: payload.sub, role: payload.role },
        { secret: this.secret, expiresIn: this.expiresInSeconds },
      );
      return ok(token);
    } catch (error) {
      this.logger.error(`issueAccessToken failed: ${(error as Error).message}`);
      return err(new Error('Failed to issue access token'));
    }
  }
}
