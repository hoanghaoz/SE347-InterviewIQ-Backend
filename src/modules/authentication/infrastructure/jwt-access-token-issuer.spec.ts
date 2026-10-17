import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import { AccessTokenPayload } from '../domain/repositories/access-token-issuer.interface';
import { JwtAccessTokenIssuer } from './jwt-access-token-issuer';

const SECRET = 'test-jwt-secret';

const buildConfig = (env: Record<string, string | undefined>) =>
  ({
    getOrThrow: jest.fn((key: string) => {
      const value = env[key];
      if (value === undefined) throw new TypeError(`Missing ${key}`);
      return value;
    }),
  }) as unknown as ConfigService;

const validEnv = { JWT_SECRET: SECRET, JWT_ACCESS_EXPIRES_IN: '900' };

describe('JwtAccessTokenIssuer', () => {
  const jwtService = new JwtService();
  const payload: AccessTokenPayload = {
    sub: randomUUID(),
    role: CommonUserRole.USER,
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  describe('constructor', () => {
    it.each(['JWT_SECRET', 'JWT_ACCESS_EXPIRES_IN'])(
      'throws when %s is missing',
      (key) => {
        const config = buildConfig({ ...validEnv, [key]: undefined });

        expect(() => new JwtAccessTokenIssuer(jwtService, config)).toThrow();
      },
    );

    it.each(['abc', '0', '-5', '1.5'])(
      'throws when JWT_ACCESS_EXPIRES_IN is %p',
      (value) => {
        const config = buildConfig({
          ...validEnv,
          JWT_ACCESS_EXPIRES_IN: value,
        });

        expect(() => new JwtAccessTokenIssuer(jwtService, config)).toThrow(
          'JWT_ACCESS_EXPIRES_IN must be a positive integer',
        );
      },
    );
  });

  describe('issueAccessToken', () => {
    it('signs a token that verifies with the secret and carries sub, role and a 900s lifetime', async () => {
      const issuer = new JwtAccessTokenIssuer(
        jwtService,
        buildConfig(validEnv),
      );

      const result = await issuer.issueAccessToken(payload);

      if (result.isErr()) throw result.error;
      const decoded = await jwtService.verifyAsync<{
        sub: string;
        role: string;
        iat: number;
        exp: number;
      }>(result.value, { secret: SECRET });
      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.role).toBe(CommonUserRole.USER);
      expect(decoded.exp - decoded.iat).toBe(900);
    });

    it('only puts sub and role into the token even if extra fields are passed', async () => {
      const issuer = new JwtAccessTokenIssuer(
        jwtService,
        buildConfig(validEnv),
      );
      const withExtra = { ...payload, email: 'leak@example.com' };

      const result = await issuer.issueAccessToken(withExtra);

      if (result.isErr()) throw result.error;
      const decoded = jwtService.decode<Record<string, unknown>>(result.value);
      expect(Object.keys(decoded).sort()).toEqual([
        'exp',
        'iat',
        'role',
        'sub',
      ]);
    });

    it('returns a safe error when signing fails', async () => {
      const issuer = new JwtAccessTokenIssuer(
        jwtService,
        buildConfig(validEnv),
      );
      jest
        .spyOn(jwtService, 'signAsync')
        .mockRejectedValueOnce(new Error('jwt internal detail'));

      const result = await issuer.issueAccessToken(payload);

      if (result.isOk()) throw new Error('Expected an error result');
      expect(result.error.message).toBe('Failed to issue access token');
      expect(result.error.message).not.toContain('jwt internal detail');
    });
  });
});
