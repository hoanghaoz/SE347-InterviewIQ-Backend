import type { UUID } from 'crypto';
import { err, ok } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { MAX_AVATAR_BYTES } from '../../domain/constants/avatar.constant';
import { UserAlreadyExistsError } from '../../domain/repositories/user.repo.interface';
import { UserProfileService } from './user-profile.service';

describe('UserProfileService', () => {
  const userRepository = {
    getUserByEmail: jest.fn(),
    createUser: jest.fn(),
    getUserCredentialsByEmail: jest.fn(),
    getUserCredentialsByPublicId: jest.fn(),
    getUserById: jest.fn(),
    getUserProfileByPublicId: jest.fn(),
    updateUserProfile: jest.fn(),
    updateUserAvatarUrl: jest.fn(),
    updateUserPassword: jest.fn(),
  };
  const avatarStorage = {
    uploadAvatar: jest.fn(),
  };

  // Các object mock khớp cấu trúc của contract nên truyền thẳng được, không cần ép kiểu
  const service = new UserProfileService(userRepository, avatarStorage);

  const userPublicId = '7f1c2a3b-4d5e-4f60-8a9b-0c1d2e3f4a5b' as UUID;
  const storedProfile = {
    publicId: userPublicId,
    email: 'a@x.com',
    fullName: 'Nguyen Van A',
    avatarUrl: null,
    createdAt: new Date('2026-01-05T08:30:00.000Z'),
    updatedAt: new Date('2026-02-11T03:15:42.000Z'),
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getProfileAsync', () => {
    it('maps publicId to id and the timestamps to ISO strings', async () => {
      userRepository.getUserProfileByPublicId.mockResolvedValue(
        ok(storedProfile),
      );

      const result = await service.getProfileAsync(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({
        id: userPublicId,
        email: 'a@x.com',
        fullName: 'Nguyen Van A',
        avatarUrl: null,
        createdAt: '2026-01-05T08:30:00.000Z',
        updatedAt: '2026-02-11T03:15:42.000Z',
      });
      expect(userRepository.getUserProfileByPublicId).toHaveBeenCalledWith(
        userPublicId,
      );
    });

    it('returns 401 when the token is valid but the account is gone', async () => {
      userRepository.getUserProfileByPublicId.mockResolvedValue(ok(null));

      const result = await service.getProfileAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.Unauthorized);
    });

    it('hides the repository message behind a 500', async () => {
      const repositoryMessage = 'Failed to find user profile';
      userRepository.getUserProfileByPublicId.mockResolvedValue(
        err(new Error(repositoryMessage)),
      );

      const result = await service.getProfileAsync(userPublicId);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).toBe('Failed to load the profile');
    });
  });

  describe('updateProfileAsync', () => {
    it('updates only the fields the request sent', async () => {
      userRepository.updateUserProfile.mockResolvedValue(
        ok({ ...storedProfile, fullName: 'Tran Thi B' }),
      );

      const result = await service.updateProfileAsync(userPublicId, {
        fullName: 'Tran Thi B',
      });

      if (result.isErr()) throw result.error;
      expect(result.value.fullName).toBe('Tran Thi B');
      expect(userRepository.updateUserProfile).toHaveBeenCalledWith(
        userPublicId,
        { email: undefined, fullName: 'Tran Thi B' },
      );
    });

    it('returns 400 and never touches the database when the body has no field', async () => {
      const result = await service.updateProfileAsync(userPublicId, {});

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(userRepository.updateUserProfile).not.toHaveBeenCalled();
    });

    it('returns 409 when the new email already belongs to someone else', async () => {
      userRepository.updateUserProfile.mockResolvedValue(
        err(new UserAlreadyExistsError()),
      );

      const result = await service.updateProfileAsync(userPublicId, {
        email: 'taken@x.com',
      });

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.Conflict);
      expect(result.error.message).toBe('This email is already in use');
    });

    it('returns 401 when the account is gone', async () => {
      userRepository.updateUserProfile.mockResolvedValue(ok(null));

      const result = await service.updateProfileAsync(userPublicId, {
        fullName: 'Tran Thi B',
      });

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.Unauthorized);
    });
  });

  describe('updateAvatarAsync', () => {
    const file = {
      buffer: Buffer.from('fake-image'),
      mimetype: 'image/png',
      size: 1024,
    };
    const uploadedUrl =
      'https://res.cloudinary.com/demo/image/upload/v2/avatars/u.jpg';

    it('uploads the file and saves the returned URL', async () => {
      avatarStorage.uploadAvatar.mockResolvedValue(ok({ url: uploadedUrl }));
      userRepository.updateUserAvatarUrl.mockResolvedValue(ok(true));

      const result = await service.updateAvatarAsync(userPublicId, file);

      if (result.isErr()) throw result.error;
      expect(result.value).toEqual({ avatarUrl: uploadedUrl });
      expect(avatarStorage.uploadAvatar).toHaveBeenCalledWith(
        userPublicId,
        file,
      );
      expect(userRepository.updateUserAvatarUrl).toHaveBeenCalledWith(
        userPublicId,
        uploadedUrl,
      );
    });

    it('returns 400 when the request has no file attached', async () => {
      const result = await service.updateAvatarAsync(userPublicId, undefined);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(avatarStorage.uploadAvatar).not.toHaveBeenCalled();
    });

    it('rejects a non-image file before calling the storage', async () => {
      const result = await service.updateAvatarAsync(userPublicId, {
        ...file,
        mimetype: 'application/pdf',
      });

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(avatarStorage.uploadAvatar).not.toHaveBeenCalled();
    });

    it('rejects a file larger than the limit before calling the storage', async () => {
      const result = await service.updateAvatarAsync(userPublicId, {
        ...file,
        size: MAX_AVATAR_BYTES + 1,
      });

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.BadRequest);
      expect(avatarStorage.uploadAvatar).not.toHaveBeenCalled();
    });

    it('does not write the avatar URL when the upload failed', async () => {
      avatarStorage.uploadAvatar.mockResolvedValue(
        err(new Error('Cloudinary is not configured.')),
      );

      const result = await service.updateAvatarAsync(userPublicId, file);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      // Lỗi hạ tầng không được lộ ra response
      expect(result.error.message).toBe('Failed to upload the avatar');
      expect(userRepository.updateUserAvatarUrl).not.toHaveBeenCalled();
    });

    it('returns 401 when the account disappeared between upload and save', async () => {
      avatarStorage.uploadAvatar.mockResolvedValue(ok({ url: uploadedUrl }));
      userRepository.updateUserAvatarUrl.mockResolvedValue(ok(false));

      const result = await service.updateAvatarAsync(userPublicId, file);

      if (result.isOk()) throw new Error('Expected an error');
      expect(result.error.code).toBe(ErrorCode.Unauthorized);
    });
  });
});
