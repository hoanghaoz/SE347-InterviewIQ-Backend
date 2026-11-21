import { ParseStatus } from '../enums/cv.enum';
import { Cv, type CvGetParams } from './cv.entity';

describe('Cv', () => {
  const stored = (overrides: Partial<CvGetParams> = {}): Cv =>
    Cv.getCv({
      id: 7,
      publicId: '22222222-2222-4222-8222-222222222222',
      userId: 1,
      fileName: 'old.pdf',
      fileUrl: 'https://res.cloudinary.com/demo/old.pdf',
      cloudinaryPublicId: 'cvs/u/old',
      fileSize: 1000,
      rawText: 'old text',
      parsedData: {
        summary: 'old',
        skills: { languages: [], frameworks: [], databases: [], tools: [] },
        experiences: [],
        education: [],
        projects: [],
      },
      parseStatus: ParseStatus.COMPLETED,
      parserVersion: 'cv-v1/model',
      isActive: false,
      createdAt: new Date('2026-11-01T00:00:00Z'),
      updatedAt: new Date('2026-11-01T00:00:00Z'),
      ...overrides,
    });
  const newFile = {
    fileName: 'new.pdf',
    fileUrl: 'https://res.cloudinary.com/demo/new.pdf',
    cloudinaryPublicId: 'cvs/u/new',
    fileSize: 2000,
  };

  describe('replaceFile', () => {
    it('takes the new file and forgets everything parsed from the old one', () => {
      const replaced = stored().replaceFile(newFile)._unsafeUnwrap();

      expect(replaced.fileName).toBe('new.pdf');
      expect(replaced.cloudinaryPublicId).toBe('cvs/u/new');
      expect(replaced.fileSize).toBe(2000);
      expect(replaced.parseStatus).toBe(ParseStatus.PENDING);
      expect(replaced.rawText).toBeNull();
      expect(replaced.parsedData).toBeNull();
      expect(replaced.parserVersion).toBeNull();
    });

    it('keeps the identity of the CV', () => {
      const replaced = stored().replaceFile(newFile)._unsafeUnwrap();

      expect(replaced.publicId).toBe('22222222-2222-4222-8222-222222222222');
      expect(replaced.userId).toBe(1);
      expect(replaced.isActive).toBe(false);
      expect(replaced.createdAt).toEqual(new Date('2026-11-01T00:00:00Z'));
    });

    it('applies the same file rules as a new CV', () => {
      expect(
        stored()
          .replaceFile({ ...newFile, fileSize: 6 * 1024 * 1024 })
          .isErr(),
      ).toBe(true);
      expect(
        stored()
          .replaceFile({ ...newFile, fileSize: 0 })
          .isErr(),
      ).toBe(true);
      expect(
        stored()
          .replaceFile({ ...newFile, fileName: '  ' })
          .isErr(),
      ).toBe(true);
    });
  });

  describe('isBeingParsed', () => {
    const staleBefore = new Date('2026-11-16T10:00:00Z');

    it('is true for a fresh PROCESSING CV', () => {
      const cv = stored({
        parseStatus: ParseStatus.PROCESSING,
        updatedAt: new Date('2026-11-16T10:01:00Z'),
      });

      expect(cv.isBeingParsed(staleBefore)).toBe(true);
    });

    it('is false for a PROCESSING CV whose parse crashed long ago', () => {
      const cv = stored({
        parseStatus: ParseStatus.PROCESSING,
        updatedAt: new Date('2026-11-16T09:00:00Z'),
      });

      expect(cv.isBeingParsed(staleBefore)).toBe(false);
    });

    it.each([ParseStatus.PENDING, ParseStatus.COMPLETED, ParseStatus.FAILED])(
      'is false when the status is %s',
      (parseStatus) => {
        const cv = stored({
          parseStatus,
          updatedAt: new Date('2026-11-16T10:01:00Z'),
        });

        expect(cv.isBeingParsed(staleBefore)).toBe(false);
      },
    );
  });
});
