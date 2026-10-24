import {
  BadRequestException,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID, type UUID } from 'crypto';
import { err, ok, type Result } from 'neverthrow';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UserProfileController } from '../src/modules/user/api/user-profile.controller';
import {
  AvatarUpload,
  IAvatarStorage,
  StoredAvatar,
} from '../src/modules/user/application/interfaces/avatar-storage.interface';
import { IUserProfileService } from '../src/modules/user/application/interfaces/user-profile.service.interface';
import { UserProfileService } from '../src/modules/user/application/services/user-profile.service';
import { MAX_AVATAR_BYTES } from '../src/modules/user/domain/constants/avatar.constant';
import { IUserRepository } from '../src/modules/user/domain/repositories/user.repo.interface';
import { CommonUserRole } from '../src/shared/common/commonEnum';
import { ErrorCode } from '../src/shared/common/errorCode';
import { AllExceptionsFilter } from '../src/shared/common/exceptions.filter';
import { mapValidationErrors } from '../src/shared/common/validation-error.mapper';
import { InMemoryUserRepository } from './support/in-memory-user.repository';

/**
 * Chạy 3 endpoint của trang hồ sơ qua HTTP thật với UserProfileService, JwtAuthGuard,
 * RolesGuard, ValidationPipe và AllExceptionsFilter thật.
 * Chỉ thay hạ tầng ngoài: Postgres (Map) và Cloudinary (ghi lại lần upload).
 */
const JWT_SECRET = 'e2e-test-secret';

// Chỉ ghi lại lần upload rồi trả URL có version tăng dần, giống Cloudinary ghi đè ảnh
class FakeAvatarStorage implements IAvatarStorage {
  readonly uploads: { userPublicId: string; file: AvatarUpload }[] = [];
  failWith: Error | null = null;
  private version = 0;

  uploadAvatar(
    userPublicId: string,
    file: AvatarUpload,
  ): Promise<Result<StoredAvatar, Error>> {
    if (this.failWith) {
      return Promise.resolve(err(this.failWith));
    }
    this.uploads.push({ userPublicId, file });
    this.version += 1;
    return Promise.resolve(
      ok({
        url: `https://res.cloudinary.com/demo/image/upload/v${this.version}/avatars/${userPublicId}.jpg`,
      }),
    );
  }
}

describe('User profile (e2e)', () => {
  let app: INestApplication<App>;
  let users: InMemoryUserRepository;
  let avatarStorage: FakeAvatarStorage;

  const jwtService = new JwtService({ secret: JWT_SECRET });
  const profileRoute = '/api/users/me';
  const avatarRoute = '/api/users/me/avatar';

  const seed = {
    email: 'a@x.com',
    passwordHash: '$2b$10$notarealhashbutlongenoughforthetest.',
    fullName: 'Nguyen Van A',
  };

  // Token của chính user vừa seed; không endpoint nào nhận user id từ client
  const tokenFor = (publicId: UUID) =>
    jwtService.signAsync(
      { sub: publicId, role: CommonUserRole.USER },
      { secret: JWT_SECRET, expiresIn: 900 },
    );

  const seedUser = async (): Promise<{ publicId: UUID; token: string }> => {
    await users.createUser(seed);
    const publicId = users.users.get(seed.email)!.publicId;
    return { publicId, token: await tokenFor(publicId) };
  };

  const getProfile = (token: string) =>
    request(app.getHttpServer())
      .get(profileRoute)
      .set('Authorization', `Bearer ${token}`);
  const patchProfile = (token: string, payload: object) =>
    request(app.getHttpServer())
      .patch(profileRoute)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
  const uploadAvatar = (token: string) =>
    request(app.getHttpServer())
      .post(avatarRoute)
      .set('Authorization', `Bearer ${token}`);

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    users = new InMemoryUserRepository();
    avatarStorage = new FakeAvatarStorage();

    const module = await Test.createTestingModule({
      controllers: [UserProfileController],
      providers: [
        { provide: IUserProfileService, useClass: UserProfileService },
        { provide: IUserRepository, useValue: users },
        { provide: IAvatarStorage, useValue: avatarStorage },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        exceptionFactory: (errors) =>
          new BadRequestException({
            code: ErrorCode.BadRequest,
            message: 'Request validation failed',
            errors: mapValidationErrors(errors),
          }),
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  describe('GET /api/users/me', () => {
    it('returns the profile of the token owner and never the password hash', async () => {
      const { publicId, token } = await seedUser();

      const response = await getProfile(token).expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        success: true,
        message: 'Profile retrieved successfully',
        data: {
          id: publicId,
          email: seed.email,
          fullName: seed.fullName,
          avatarUrl: null,
        },
      });
      const data = (response.body as { data: Record<string, unknown> }).data;
      expect(data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(JSON.stringify(response.body)).not.toContain(seed.passwordHash);
    });

    it('returns 401 without a bearer token', async () => {
      await seedUser();

      await request(app.getHttpServer()).get(profileRoute).expect(401);
    });

    it('returns 401 when the token is valid but the account is gone', async () => {
      const token = await tokenFor(randomUUID());

      const response = await getProfile(token).expect(401);

      expect(response.body).toMatchObject({
        code: ErrorCode.Unauthorized,
        message: 'User no longer exists',
        path: profileRoute,
      });
    });
  });

  describe('PATCH /api/users/me', () => {
    it('updates only the field the request sent and returns the profile after the update', async () => {
      const { token } = await seedUser();

      const response = await patchProfile(token, {
        fullName: '  Tran Thi B ',
      }).expect(200);

      expect(response.body).toMatchObject({
        statusCode: 200,
        message: 'Profile updated successfully',
        // fullName đã được trim
        data: { fullName: 'Tran Thi B', email: seed.email },
      });
    });

    it('normalizes the new email before storing it', async () => {
      const { token } = await seedUser();

      const response = await patchProfile(token, {
        email: '  New.User@Example.COM ',
      }).expect(200);

      expect(response.body).toMatchObject({
        data: { email: 'new.user@example.com' },
      });
      expect(users.users.has('new.user@example.com')).toBe(true);
      expect(users.users.has(seed.email)).toBe(false);
    });

    it('returns 409 when the new email already belongs to someone else', async () => {
      const { token } = await seedUser();
      await users.createUser({ ...seed, email: 'taken@x.com' });

      const response = await patchProfile(token, {
        email: 'taken@x.com',
      }).expect(409);

      expect(response.body).toMatchObject({
        code: ErrorCode.Conflict,
        message: 'This email is already in use',
      });
      // Email cũ vẫn còn nguyên, không bị mất chỗ
      expect(users.users.has(seed.email)).toBe(true);
    });

    it('returns 400 when the body carries no updatable field', async () => {
      const { token } = await seedUser();

      const response = await patchProfile(token, {}).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'At least one of email or fullName must be provided',
      });
    });

    // whitelist của ValidationPipe bỏ field lạ, nên role không bao giờ tới service
    it('strips fields the DTO does not declare, so role cannot be escalated', async () => {
      const { token } = await seedUser();

      // Chỉ gửi field lạ: bị loại hết nên không còn gì để ghi
      await patchProfile(token, { role: CommonUserRole.ADMIN }).expect(400);

      const response = await patchProfile(token, {
        role: CommonUserRole.ADMIN,
        fullName: 'Tran Thi B',
      }).expect(200);

      expect(response.body).not.toHaveProperty('data.role');
      expect(users.users.get(seed.email)).not.toHaveProperty('role');
      expect(users.users.get(seed.email)?.fullName).toBe('Tran Thi B');
    });

    it('returns field errors without echoing the rejected values', async () => {
      const { token } = await seedUser();

      const response = await patchProfile(token, {
        email: 'not-an-email',
        fullName: '   ',
      }).expect(400);

      const fields = (
        response.body as { errors: { field: string }[] }
      ).errors.map((e) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'fullName']));
      expect(JSON.stringify(response.body)).not.toContain('not-an-email');
    });
  });

  describe('POST /api/users/me/avatar', () => {
    const png = Buffer.from('fake-png-bytes');

    it('uploads the file under the id of the token owner and stores the returned URL', async () => {
      const { publicId, token } = await seedUser();

      const response = await uploadAvatar(token)
        .attach('avatar', png, {
          filename: 'me.png',
          contentType: 'image/png',
        })
        .expect(200);

      const avatarUrl = (response.body as { data: { avatarUrl: string } }).data
        .avatarUrl;
      expect(avatarUrl).toContain(publicId);
      expect(avatarStorage.uploads).toHaveLength(1);
      expect(avatarStorage.uploads[0].userPublicId).toBe(publicId);
      expect(users.users.get(seed.email)?.avatarUrl).toBe(avatarUrl);
    });

    it('returns a different URL every time so the browser cache cannot win', async () => {
      const { token } = await seedUser();
      const attach = () =>
        uploadAvatar(token)
          .attach('avatar', png, {
            filename: 'me.png',
            contentType: 'image/png',
          })
          .expect(200);

      const first = await attach();
      const second = await attach();

      const urlOf = (response: { body: unknown }) =>
        (response.body as { data: { avatarUrl: string } }).data.avatarUrl;
      expect(urlOf(first)).not.toBe(urlOf(second));
    });

    it('returns 400 when no file is attached', async () => {
      const { token } = await seedUser();

      const response = await uploadAvatar(token).expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'An avatar file is required',
      });
      expect(avatarStorage.uploads).toHaveLength(0);
    });

    it('rejects a non-image file without calling the storage', async () => {
      const { token } = await seedUser();

      const response = await uploadAvatar(token)
        .attach('avatar', Buffer.from('%PDF-1.7'), {
          filename: 'cv.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        code: ErrorCode.BadRequest,
        message: 'Avatar must be a JPEG, PNG or WEBP image',
      });
      expect(avatarStorage.uploads).toHaveLength(0);
      expect(users.users.get(seed.email)?.avatarUrl).toBeNull();
    });

    it('rejects a file over the size limit before it reaches the storage', async () => {
      const { token } = await seedUser();
      const tooBig = Buffer.alloc(MAX_AVATAR_BYTES + 1, 1);

      const response = await uploadAvatar(token).attach('avatar', tooBig, {
        filename: 'huge.png',
        contentType: 'image/png',
      });

      // multer cắt ngang ở 413; service cũng có cùng luật cho đường không qua multer
      expect(response.status).toBe(413);
      expect(avatarStorage.uploads).toHaveLength(0);
      expect(users.users.get(seed.email)?.avatarUrl).toBeNull();
    });

    it('does not store any URL when the storage fails, and hides the storage error', async () => {
      const { token } = await seedUser();
      avatarStorage.failWith = new Error('Cloudinary is not configured.');

      const response = await uploadAvatar(token)
        .attach('avatar', png, {
          filename: 'me.png',
          contentType: 'image/png',
        })
        .expect(500);

      expect(response.body).toMatchObject({
        code: ErrorCode.InternalServerError,
        message: 'Failed to upload the avatar',
      });
      expect(JSON.stringify(response.body)).not.toContain('Cloudinary');
      expect(users.users.get(seed.email)?.avatarUrl).toBeNull();
    });
  });
});
