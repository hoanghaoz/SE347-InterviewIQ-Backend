import { err, ok } from 'neverthrow';
import { ErrorCode } from '../../../../shared/common/errorCode';
import { Cv, type CvGetParams } from '../../domain/entities/cv.entity';
import type { CvParsedData } from '../../domain/types/cv-parsed-data.type';
import { ParseStatus } from '../../domain/enums/cv.enum';
import {
  CvFileAlreadySavedError,
  ICvManagementRepository,
} from '../../domain/repositories/cv-management.repo.interface';
import { ICvFileStorage } from '../interfaces/cv-file-storage.interface';
import { ICvParser } from '../interfaces/cv-parser.interface';
import { ICvTextExtractor } from '../interfaces/cv-text-extractor.interface';
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
    tryStartParse: jest.fn<
      ReturnType<ICvManagementRepository['tryStartParse']>,
      Parameters<ICvManagementRepository['tryStartParse']>
    >(),
    saveParseResult: jest.fn<
      ReturnType<ICvManagementRepository['saveParseResult']>,
      Parameters<ICvManagementRepository['saveParseResult']>
    >(),
    saveParsedData: jest.fn<
      ReturnType<ICvManagementRepository['saveParsedData']>,
      Parameters<ICvManagementRepository['saveParsedData']>
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
    downloadFile: jest.fn<
      ReturnType<ICvFileStorage['downloadFile']>,
      Parameters<ICvFileStorage['downloadFile']>
    >(),
  };
  const extractor = {
    extractTextAsync: jest.fn<
      ReturnType<ICvTextExtractor['extractTextAsync']>,
      Parameters<ICvTextExtractor['extractTextAsync']>
    >(),
  };
  const parser = {
    parseAsync: jest.fn<
      ReturnType<ICvParser['parseAsync']>,
      Parameters<ICvParser['parseAsync']>
    >(),
  };
  const service = new CvService(repo, storage, extractor, parser);

  const cvText = 'Nguyen Van A. Backend developer. Skills: TypeScript, NestJS.';
  const parsedData: CvParsedData = {
    summary: 'Backend developer.',
    skills: {
      languages: ['TypeScript'],
      frameworks: ['NestJS'],
      databases: [],
      tools: [],
    },
    experiences: [],
    education: [],
    projects: [],
  };
  const editRequest = {
    ...parsedData,
    summary: 'Edited by the user.',
  } as Parameters<CvService['updateParsedDataAsync']>[2];

  // A CV as the repository returns it after saving (group A filled by the DB).
  const savedCv = (overrides: Partial<CvGetParams> = {}): Cv =>
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
      ...overrides,
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
          assetFolder: 'f',
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

  describe('parseCvAsync', () => {
    const cvId = '22222222-2222-4222-8222-222222222222';
    const pdfBytes = new Uint8Array([37, 80, 68, 70]);

    const happyPath = () => {
      repo.tryStartParse.mockResolvedValue(
        ok({ status: 'started', cv: savedCv() }),
      );
      storage.downloadFile.mockResolvedValue(ok(pdfBytes));
      extractor.extractTextAsync.mockResolvedValue(ok(cvText));
      parser.parseAsync.mockResolvedValue(
        ok({ parsedData, parserVersion: 'cv-v1/model' }),
      );
      repo.saveParseResult.mockImplementation((cv) => Promise.resolve(ok(cv)));
    };

    const savedStatus = (): ParseStatus =>
      repo.saveParseResult.mock.calls[0][0].parseStatus;

    it('returns 404 when the CV is missing or owned by someone else', async () => {
      repo.tryStartParse.mockResolvedValue(ok({ status: 'not_found' }));

      const result = await service.parseCvAsync(userPublicId, cvId);

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.NotFound);
      expect(storage.downloadFile).not.toHaveBeenCalled();
    });

    it('returns 409 when the CV is already parsed or being parsed', async () => {
      repo.tryStartParse.mockResolvedValue(ok({ status: 'not_parsable' }));

      const result = await service.parseCvAsync(userPublicId, cvId);

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.Conflict);
      expect(storage.downloadFile).not.toHaveBeenCalled();
      expect(repo.saveParseResult).not.toHaveBeenCalled();
    });

    it('hides a database error behind a generic 500', async () => {
      repo.tryStartParse.mockResolvedValue(err(new Error('connection lost')));

      const result = await service.parseCvAsync(userPublicId, cvId);

      const error = result._unsafeUnwrapErr();
      expect(error.code).toBe(ErrorCode.InternalServerError);
      expect(error.message).not.toContain('connection lost');
    });

    it('claims the CV with a stale limit in the past', async () => {
      happyPath();
      const before = Date.now();

      await service.parseCvAsync(userPublicId, cvId);

      const [user, cv, staleBefore] = repo.tryStartParse.mock.calls[0];
      expect([user, cv]).toEqual([userPublicId, cvId]);
      expect(staleBefore.getTime()).toBeLessThan(before);
    });

    it('downloads, extracts, parses and saves the CV as COMPLETED', async () => {
      happyPath();

      const result = await service.parseCvAsync(userPublicId, cvId);

      const dto = result._unsafeUnwrap();
      expect(dto.parseStatus).toBe(ParseStatus.COMPLETED);
      expect(dto.parsedData).toEqual(parsedData);
      expect(storage.downloadFile).toHaveBeenCalledWith(ownFileId);
      expect(extractor.extractTextAsync).toHaveBeenCalledWith(pdfBytes);
      expect(parser.parseAsync).toHaveBeenCalledWith(cvText);
      const saved = repo.saveParseResult.mock.calls[0][0];
      expect(saved.rawText).toBe(cvText);
      expect(saved.parserVersion).toBe('cv-v1/model');
    });

    it('saves FAILED (and answers normally) when the file is gone from storage', async () => {
      happyPath();
      storage.downloadFile.mockResolvedValue(ok(null));

      const result = await service.parseCvAsync(userPublicId, cvId);

      expect(result._unsafeUnwrap().parseStatus).toBe(ParseStatus.FAILED);
      expect(savedStatus()).toBe(ParseStatus.FAILED);
      expect(parser.parseAsync).not.toHaveBeenCalled();
    });

    it('saves FAILED when the download itself fails', async () => {
      happyPath();
      storage.downloadFile.mockResolvedValue(err(new Error('timeout')));

      const result = await service.parseCvAsync(userPublicId, cvId);

      expect(result._unsafeUnwrap().parseStatus).toBe(ParseStatus.FAILED);
      expect(extractor.extractTextAsync).not.toHaveBeenCalled();
    });

    it('saves FAILED when the PDF cannot be read', async () => {
      happyPath();
      extractor.extractTextAsync.mockResolvedValue(err(new Error('bad pdf')));

      const result = await service.parseCvAsync(userPublicId, cvId);

      expect(result._unsafeUnwrap().parseStatus).toBe(ParseStatus.FAILED);
      expect(parser.parseAsync).not.toHaveBeenCalled();
    });

    it('saves FAILED for a scanned PDF with almost no text, without calling the LLM', async () => {
      happyPath();
      extractor.extractTextAsync.mockResolvedValue(ok('  \n  12  \n '));

      const result = await service.parseCvAsync(userPublicId, cvId);

      expect(result._unsafeUnwrap().parseStatus).toBe(ParseStatus.FAILED);
      expect(parser.parseAsync).not.toHaveBeenCalled();
    });

    it('saves FAILED when the LLM or its output is unusable', async () => {
      happyPath();
      parser.parseAsync.mockResolvedValue(err(new Error('LLM unavailable')));

      const result = await service.parseCvAsync(userPublicId, cvId);

      const dto = result._unsafeUnwrap();
      expect(dto.parseStatus).toBe(ParseStatus.FAILED);
      expect(dto.parsedData).toBeNull();
    });

    it('turns an unexpected exception into FAILED instead of leaving PROCESSING', async () => {
      happyPath();
      storage.downloadFile.mockRejectedValue(new Error('boom'));

      const result = await service.parseCvAsync(userPublicId, cvId);

      expect(result._unsafeUnwrap().parseStatus).toBe(ParseStatus.FAILED);
      expect(savedStatus()).toBe(ParseStatus.FAILED);
    });

    it('returns 500 when the final state cannot be saved', async () => {
      happyPath();
      repo.saveParseResult.mockResolvedValue(err(new Error('db down')));

      const result = await service.parseCvAsync(userPublicId, cvId);

      expect(result._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
    });
  });

  describe('updateParsedDataAsync', () => {
    const cvId = '22222222-2222-4222-8222-222222222222';
    const parsedCv = (status: ParseStatus, data: CvParsedData | null): Cv =>
      savedCv({ parseStatus: status, parsedData: data });

    it('returns 404 when the CV is missing or owned by someone else', async () => {
      repo.getCvByPublicId.mockResolvedValue(ok(null));

      const result = await service.updateParsedDataAsync(
        userPublicId,
        cvId,
        editRequest,
      );

      expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.NotFound);
      expect(repo.saveParsedData).not.toHaveBeenCalled();
    });

    it.each([ParseStatus.PENDING, ParseStatus.PROCESSING, ParseStatus.FAILED])(
      'returns 409 for a CV that is %s',
      async (status) => {
        repo.getCvByPublicId.mockResolvedValue(ok(parsedCv(status, null)));

        const result = await service.updateParsedDataAsync(
          userPublicId,
          cvId,
          editRequest,
        );

        expect(result._unsafeUnwrapErr().code).toBe(ErrorCode.Conflict);
        expect(repo.saveParsedData).not.toHaveBeenCalled();
      },
    );

    it('replaces the parsed data of a COMPLETED CV with the cleaned request', async () => {
      repo.getCvByPublicId.mockResolvedValue(
        ok(parsedCv(ParseStatus.COMPLETED, parsedData)),
      );
      repo.saveParsedData.mockImplementation((cv) => Promise.resolve(ok(cv)));

      const result = await service.updateParsedDataAsync(userPublicId, cvId, {
        ...editRequest,
        summary: '  Edited by the user.  ',
      });

      const dto = result._unsafeUnwrap();
      expect(dto.parsedData?.summary).toBe('Edited by the user.');
      expect(dto.parseStatus).toBe(ParseStatus.COMPLETED);
    });

    it('hides a database error behind a generic 500', async () => {
      repo.getCvByPublicId.mockResolvedValue(
        ok(parsedCv(ParseStatus.COMPLETED, parsedData)),
      );
      repo.saveParsedData.mockResolvedValue(err(new Error('db down')));

      const result = await service.updateParsedDataAsync(
        userPublicId,
        cvId,
        editRequest,
      );

      expect(result._unsafeUnwrapErr().code).toBe(
        ErrorCode.InternalServerError,
      );
    });
  });
});
