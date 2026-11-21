import { ParseStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { CvRepository } from './cv.repo';
import { Cv } from '../domain/entities/cv.entity';
import {
  CvFileAlreadySavedError,
  CvLimitReachedError,
} from '../domain/repositories/cv-management.repo.interface';
import { ParseStatus as DomainParseStatus } from '../domain/enums/cv.enum';

jest.mock('../../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('../../../../generated/prisma/client', () => ({
  Prisma: { DbNull: 'DB_NULL_SENTINEL' },
}));

describe('CvRepository parse methods', () => {
  const updateMany = jest.fn<Promise<unknown>, [unknown]>();
  const findFirst = jest.fn<Promise<unknown>, [unknown]>();
  const update = jest.fn<Promise<unknown>, [unknown]>();
  const repository = new CvRepository({
    cv: { updateMany, findFirst, update },
  } as unknown as PrismaService);

  const row = {
    id: 7,
    publicId: 'cv-1',
    userId: 1,
    fileName: 'cv.pdf',
    fileUrl: 'https://res.cloudinary.com/demo/x.pdf',
    cloudinaryPublicId: 'cvs/u/f',
    fileSize: 1000,
    rawText: null,
    parsedData: null,
    parseStatus: ParseStatus.PROCESSING,
    parserVersion: null,
    isActive: true,
    createdAt: new Date('2026-10-23T00:00:00Z'),
    updatedAt: new Date('2026-10-23T00:00:00Z'),
  };
  const staleBefore = new Date('2026-10-23T00:00:00Z');

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('tryStartParse', () => {
    it('claims only a CV of the owner that is PENDING, FAILED or stale PROCESSING', async () => {
      updateMany.mockResolvedValue({ count: 1 });
      findFirst.mockResolvedValue(row);

      await repository.tryStartParse('user-1', 'cv-1', staleBefore);

      expect(updateMany).toHaveBeenCalledWith({
        where: {
          publicId: 'cv-1',
          user: { publicId: 'user-1' },
          OR: [
            { parseStatus: { in: [ParseStatus.PENDING, ParseStatus.FAILED] } },
            {
              parseStatus: ParseStatus.PROCESSING,
              updatedAt: { lt: staleBefore },
            },
          ],
        },
        data: { parseStatus: ParseStatus.PROCESSING },
      });
    });

    it('returns started with the CV when the claim worked', async () => {
      updateMany.mockResolvedValue({ count: 1 });
      findFirst.mockResolvedValue(row);

      const outcome = (
        await repository.tryStartParse('user-1', 'cv-1', staleBefore)
      )._unsafeUnwrap();

      expect(outcome.status).toBe('started');
      if (outcome.status === 'started') {
        expect(outcome.cv.publicId).toBe('cv-1');
      }
    });

    it('returns not_parsable when the CV exists but nothing was claimed', async () => {
      updateMany.mockResolvedValue({ count: 0 });
      findFirst.mockResolvedValue({
        ...row,
        parseStatus: ParseStatus.COMPLETED,
      });

      const outcome = (
        await repository.tryStartParse('user-1', 'cv-1', staleBefore)
      )._unsafeUnwrap();

      expect(outcome).toEqual({ status: 'not_parsable' });
    });

    it('returns not_found when the CV does not exist for this owner', async () => {
      updateMany.mockResolvedValue({ count: 0 });
      findFirst.mockResolvedValue(null);

      const outcome = (
        await repository.tryStartParse('user-1', 'cv-1', staleBefore)
      )._unsafeUnwrap();

      expect(outcome).toEqual({ status: 'not_found' });
    });

    it('turns a database error into a generic error', async () => {
      updateMany.mockRejectedValue(new Error('connection string leaked'));

      const result = await repository.tryStartParse('u', 'c', staleBefore);

      expect(result._unsafeUnwrapErr().message).not.toContain('leaked');
    });
  });

  describe('saveParseResult', () => {
    const parsedData = {
      summary: 'x',
      skills: { languages: [], frameworks: [], databases: [], tools: [] },
      experiences: [],
      education: [],
      projects: [],
    };
    const cv = (): Cv =>
      Cv.getCv({
        ...row,
        parseStatus: DomainParseStatus.PROCESSING,
      });

    it('stores status, text, data and version of a finished parse', async () => {
      update.mockResolvedValue({ ...row, parseStatus: ParseStatus.COMPLETED });

      await repository.saveParseResult(
        cv().completeParsing({
          rawText: 'text',
          parsedData,
          parserVersion: 'v1',
        }),
      );

      expect(update).toHaveBeenCalledWith({
        where: { publicId: 'cv-1' },
        data: {
          parseStatus: ParseStatus.COMPLETED,
          rawText: 'text',
          parsedData,
          parserVersion: 'v1',
        },
      });
    });

    it('writes SQL NULL (not the JSON value null) when a parse failed', async () => {
      update.mockResolvedValue({ ...row, parseStatus: ParseStatus.FAILED });

      await repository.saveParseResult(cv().failParsing());

      const data = (
        update.mock.calls[0][0] as { data: { parsedData: unknown } }
      ).data;
      expect(data.parsedData).toBe('DB_NULL_SENTINEL');
    });
  });

  describe('saveParsedData', () => {
    it('updates only the parsed data', async () => {
      update.mockResolvedValue(row);
      const edited = Cv.getCv({
        ...row,
        parseStatus: DomainParseStatus.COMPLETED,
      }).withParsedData({
        summary: 'edited',
        skills: { languages: [], frameworks: [], databases: [], tools: [] },
        experiences: [],
        education: [],
        projects: [],
      });

      await repository.saveParsedData(edited);

      const call = update.mock.calls[0][0] as { data: Record<string, unknown> };
      expect(Object.keys(call.data)).toEqual(['parsedData']);
    });
  });
});

describe('CvRepository management methods', () => {
  const queryRaw = jest.fn<Promise<unknown>, unknown[]>();
  const count = jest.fn<Promise<number>, [unknown]>();
  const findUnique = jest.fn<Promise<unknown>, [unknown]>();
  const create = jest.fn<Promise<unknown>, [unknown]>();
  const updateMany = jest.fn<Promise<unknown>, [unknown]>();
  const deleteMany = jest.fn<Promise<unknown>, [unknown]>();
  const cvDelegate = { count, findUnique, create, updateMany, deleteMany };
  const prisma = {
    cv: cvDelegate,
    $queryRaw: queryRaw,
    // Runs the callback against the same fake client, like a real interactive transaction.
    $transaction: <T>(callback: (tx: unknown) => Promise<T>) =>
      callback({ cv: cvDelegate, $queryRaw: queryRaw }),
  };
  const repository = new CvRepository(prisma as unknown as PrismaService);

  const row = {
    id: 7,
    publicId: 'cv-1',
    userId: 1,
    fileName: 'cv.pdf',
    fileUrl: 'https://res.cloudinary.com/demo/x.pdf',
    cloudinaryPublicId: 'cvs/u/f',
    fileSize: 1000,
    rawText: null,
    parsedData: null,
    parseStatus: ParseStatus.PENDING,
    parserVersion: null,
    isActive: true,
    createdAt: new Date('2026-11-16T00:00:00Z'),
    updatedAt: new Date('2026-11-16T00:00:00Z'),
  };
  const newCv = Cv.create({
    userId: 1,
    fileName: 'cv.pdf',
    fileUrl: 'https://res.cloudinary.com/demo/x.pdf',
    cloudinaryPublicId: 'cvs/u/f',
    fileSize: 1000,
  })._unsafeUnwrap();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('createCv', () => {
    it('locks the user row before counting, then inserts', async () => {
      queryRaw.mockResolvedValue([]);
      findUnique.mockResolvedValue(null);
      count.mockResolvedValue(9);
      create.mockResolvedValue(row);

      const result = await repository.createCv(newCv, 10);

      expect(result.isOk()).toBe(true);
      expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        count.mock.invocationCallOrder[0],
      );
      expect(count).toHaveBeenCalledWith({ where: { userId: 1 } });
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('refuses the insert when the user already has the maximum', async () => {
      queryRaw.mockResolvedValue([]);
      findUnique.mockResolvedValue(null);
      count.mockResolvedValue(10);

      const result = await repository.createCv(newCv, 10);

      expect(result._unsafeUnwrapErr()).toBeInstanceOf(CvLimitReachedError);
      expect(create).not.toHaveBeenCalled();
    });

    it('reports a duplicate file before it looks at the limit', async () => {
      queryRaw.mockResolvedValue([]);
      findUnique.mockResolvedValue({ id: 3 });
      count.mockResolvedValue(10);

      const result = await repository.createCv(newCv, 10);

      expect(result._unsafeUnwrapErr()).toBeInstanceOf(CvFileAlreadySavedError);
      expect(count).not.toHaveBeenCalled();
    });

    it('maps a unique violation from the insert to the duplicate error', async () => {
      queryRaw.mockResolvedValue([]);
      findUnique.mockResolvedValue(null);
      count.mockResolvedValue(0);
      create.mockRejectedValue({ code: 'P2002' });

      const result = await repository.createCv(newCv, 10);

      expect(result._unsafeUnwrapErr()).toBeInstanceOf(CvFileAlreadySavedError);
    });

    it('turns another database error into a generic error', async () => {
      queryRaw.mockRejectedValue(new Error('connection string leaked'));

      const result = await repository.createCv(newCv, 10);

      expect(result._unsafeUnwrapErr().message).not.toContain('leaked');
    });
  });

  describe('replaceFile', () => {
    const staleBefore = new Date('2026-11-16T00:00:00Z');
    const replaced = Cv.getCv({
      ...row,
      parseStatus: DomainParseStatus.PENDING,
      cloudinaryPublicId: 'cvs/u/new',
    });

    it('swaps the file only when the old one is still there and no fresh parse runs', async () => {
      updateMany.mockResolvedValue({ count: 1 });
      findUnique.mockResolvedValue({ ...row, cloudinaryPublicId: 'cvs/u/new' });

      const result = await repository.replaceFile(
        replaced,
        'cvs/u/f',
        staleBefore,
      );

      expect(result._unsafeUnwrap()?.cloudinaryPublicId).toBe('cvs/u/new');
      const call = updateMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
      expect(call.where).toEqual({
        publicId: 'cv-1',
        userId: 1,
        cloudinaryPublicId: 'cvs/u/f',
        NOT: {
          parseStatus: ParseStatus.PROCESSING,
          updatedAt: { gte: staleBefore },
        },
      });
      expect(call.data).toMatchObject({
        cloudinaryPublicId: 'cvs/u/new',
        parseStatus: ParseStatus.PENDING,
        rawText: null,
        parsedData: 'DB_NULL_SENTINEL',
        parserVersion: null,
      });
    });

    it('returns null when nothing matched (parse running or another replace won)', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      const result = await repository.replaceFile(
        replaced,
        'cvs/u/f',
        staleBefore,
      );

      expect(result._unsafeUnwrap()).toBeNull();
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('maps a unique violation to the duplicate error', async () => {
      updateMany.mockRejectedValue({ code: 'P2002' });

      const result = await repository.replaceFile(
        replaced,
        'cvs/u/f',
        staleBefore,
      );

      expect(result._unsafeUnwrapErr()).toBeInstanceOf(CvFileAlreadySavedError);
    });
  });

  describe('deleteCv', () => {
    it('deletes only a CV of the owner, and a missing one is not an error', async () => {
      deleteMany.mockResolvedValue({ count: 0 });

      const result = await repository.deleteCv('user-1', 'cv-1');

      expect(result.isOk()).toBe(true);
      expect(deleteMany).toHaveBeenCalledWith({
        where: { publicId: 'cv-1', user: { publicId: 'user-1' } },
      });
    });

    it('turns a database error into a generic error', async () => {
      deleteMany.mockRejectedValue(new Error('connection string leaked'));

      const result = await repository.deleteCv('user-1', 'cv-1');

      expect(result._unsafeUnwrapErr().message).not.toContain('leaked');
    });
  });
});
