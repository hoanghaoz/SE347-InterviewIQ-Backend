import { err, ok } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { Cv } from '../../domain/entities/cv.entity';
import { ParseStatus } from '../../domain/enums/cv.enum';
import {
  CvFileAlreadySavedError,
  ICvManagementRepository,
} from '../../domain/repositories/cv-management.repo.interface';
import { ICvFileStorage } from '../interfaces/cv-file-storage.interface';
import { CvService } from './cv.service';

describe('CvService', () => {
  const userPublicId = '11111111-1111-4111-8111-111111111111';
  const ownFileId = `cvs/${userPublicId}/file-1`;

  const repo = {
    getUserIdByPublicId: jest.fn<
      ReturnType<ICvManagementRepository['getUserIdByPublicId']>,
      Parameters<ICvManagementRepository['getUserIdByPublicId']>
    >(),
    createCv: jest.fn<
      ReturnType<ICvManagementRepository['createCv']>,
      Parameters<ICvManagementRepository['createCv']>
    >(),
    getCvsByUser: jest.fn<
      ReturnType<ICvManagementRepository['getCvsByUser']>,
      Parameters<ICvManagementRepository['getCvsByUser']>
    >(),
    getCvByPublicId: jest.fn<
      ReturnType<ICvManagementRepository['getCvByPublicId']>,
      Parameters<ICvManagementRepository['getCvByPublicId']>
    >(),
  };
  const storage = {
    createSignedUpload: jest.fn<
      ReturnType<ICvFileStorage['createSignedUpload']>,
      Parameters<ICvFileStorage['createSignedUpload']>
    >(),
    getFile: jest.fn<
      ReturnType<ICvFileStorage['getFile']>,
      Parameters<ICvFileStorage['getFile']>
    >(),
  };
  const service = new CvService(repo, storage);

  // A CV as the repository returns it after saving (group A filled by the DB).
  const savedCv = (): Cv =>
    Cv.getCv({
      id: 7,
      publicId: '22222222-2222-4222-8222-222222222222',
      userId: 1,
      fileName: 'cv.pdf',
      fileUrl: 'https://res.cloudinary.com/demo/image/upload/v1/cvs/x.pdf',
      cloudinaryPublicId: ownFileId,
      fileSize: 1000,
      rawText: null,
      parsedData: null,
      parseStatus: ParseStatus.PENDING,
      parserVersion: null,
      isActive: true,
      createdAt: new Date('2026-09-28T10:00:00.000Z'),
      updatedAt: new Date('2026-09-28T10:00:00.000Z'),
    });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createSignedParamsAsync', () => {
    it("signs a file id under the user's own prefix", async () => {
      storage.createSignedUpload.mockImplementation((id) =>
        ok({
          uploadUrl: 'u',
          apiKey: 'k',
          timestamp: 1,
          signature: 's',
          cloudinaryPublicId: id,
          allowedFormats: 'pdf',
        }),
      );

      const result = await service.createSignedParamsAsync(userPublicId);

      if (result.isErr()) throw result.error;
      expect(result.value.cloudinaryPublicId).toMatch(
        new RegExp(`^cvs/${userPublicId}/`),
      );
    });
  });

  describe('createCvAsync', () => {
    it("rejects a file id outside the user's prefix without calling storage", async () => {
      const result = await service.createCvAsync(userPublicId, {
        fileName: 'cv.pdf',
        cloudinaryPublicId: 'cvs/someone-else/file-1',
      });

      expect(result.isErr() && result.error.code).toBe(ErrorCode.BadRequest);
      expect(storage.getFile).not.toHaveBeenCalled();
    });

    it('rejects a file that is not on the storage', async () => {
      storage.getFile.mockResolvedValue(ok(null));

      const result = await service.createCvAsync(userPublicId, {
        fileName: 'cv.pdf',
        cloudinaryPublicId: ownFileId,
      });

      expect(result.isErr() && result.error.code).toBe(ErrorCode.BadRequest);
    });

    it('rejects a non-PDF file', async () => {
      storage.getFile.mockResolvedValue(
        ok({ url: 'https://x', bytes: 1000, format: 'png' }),
      );

      const result = await service.createCvAsync(userPublicId, {
        fileName: 'cv.pdf',
        cloudinaryPublicId: ownFileId,
      });

      expect(result.isErr() && result.error.code).toBe(ErrorCode.BadRequest);
    });

    it('uses the real size from storage, so a file over 5 MB is rejected', async () => {
      storage.getFile.mockResolvedValue(
        ok({ url: 'https://x', bytes: 6 * 1024 * 1024, format: 'pdf' }),
      );
      repo.getUserIdByPublicId.mockResolvedValue(ok(1));

      const result = await service.createCvAsync(userPublicId, {
        fileName: 'cv.pdf',
        cloudinaryPublicId: ownFileId,
      });

      expect(result.isErr() && result.error.code).toBe(ErrorCode.BadRequest);
      expect(repo.createCv).not.toHaveBeenCalled();
    });

    it('saves a PENDING CV with the storage URL and size', async () => {
      storage.getFile.mockResolvedValue(
        ok({ url: 'https://stored.pdf', bytes: 1000, format: 'pdf' }),
      );
      repo.getUserIdByPublicId.mockResolvedValue(ok(1));
      repo.createCv.mockResolvedValue(ok(savedCv()));

      const result = await service.createCvAsync(userPublicId, {
        fileName: 'cv.pdf',
        cloudinaryPublicId: ownFileId,
      });

      if (result.isErr()) throw result.error;
      const created = repo.createCv.mock.calls[0][0];
      expect(created.fileUrl).toBe('https://stored.pdf');
      expect(created.fileSize).toBe(1000);
      expect(created.cloudinaryPublicId).toBe(ownFileId);
      expect(created.parseStatus).toBe(ParseStatus.PENDING);
      expect(result.value.createdAt).toBe('2026-09-28T10:00:00.000Z');
      // The storage id stays internal: it is not part of the API response.
      expect(result.value).not.toHaveProperty('cloudinaryPublicId');
    });

    it('returns 409 when the same file is saved twice', async () => {
      storage.getFile.mockResolvedValue(
        ok({ url: 'https://stored.pdf', bytes: 1000, format: 'pdf' }),
      );
      repo.getUserIdByPublicId.mockResolvedValue(ok(1));
      repo.createCv.mockResolvedValue(err(new CvFileAlreadySavedError()));

      const result = await service.createCvAsync(userPublicId, {
        fileName: 'cv.pdf',
        cloudinaryPublicId: ownFileId,
      });

      expect(result.isErr() && result.error.code).toBe(ErrorCode.Conflict);
    });

    it('hides database errors behind a generic 500', async () => {
      storage.getFile.mockResolvedValue(
        ok({ url: 'https://x', bytes: 1000, format: 'pdf' }),
      );
      repo.getUserIdByPublicId.mockResolvedValue(
        err(new Error('database secret')),
      );

      const result = await service.createCvAsync(userPublicId, {
        fileName: 'cv.pdf',
        cloudinaryPublicId: ownFileId,
      });

      if (result.isOk()) throw new Error('expected an error');
      expect(result.error.code).toBe(ErrorCode.InternalServerError);
      expect(result.error.message).not.toContain('database secret');
    });
  });

  describe('getCvAsync', () => {
    it('returns 404 when the CV is missing or owned by someone else', async () => {
      repo.getCvByPublicId.mockResolvedValue(ok(null));

      const result = await service.getCvAsync(userPublicId, 'any-id');

      expect(result.isErr() && result.error.code).toBe(ErrorCode.NotFound);
    });
  });
});
