import { HttpException, HttpStatus } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import { AppError, ErrorCode } from '../../../shared/common/errorCode';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { ScoringJobStatus } from '../domain/enums/scoring-enum';
import { IScoringService } from '../application/interfaces/scoring.service.interface';
import { ScoringJobStatusResponseDto } from '../application/dtos/scoring.response.dto';
import { ScoringController } from './scoring.controller';

describe('ScoringController', () => {
  let controller: ScoringController;

  const enqueueAsyncMock = jest.fn<
    ReturnType<IScoringService['enqueueAsync']>,
    Parameters<IScoringService['enqueueAsync']>
  >();
  const getJobStatusAsyncMock = jest.fn<
    ReturnType<IScoringService['getJobStatusAsync']>,
    Parameters<IScoringService['getJobStatusAsync']>
  >();

  const scoringService: IScoringService = {
    enqueueAsync: enqueueAsyncMock,
    getJobStatusAsync: getJobStatusAsyncMock,
  };

  const mockUser: JwtPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    email: 'test@example.com',
    role: CommonUserRole.USER,
  };
  const mockJobId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(() => {
    enqueueAsyncMock.mockReset();
    getJobStatusAsyncMock.mockReset();
    controller = new ScoringController(scoringService);
  });

  describe('getJobStatus', () => {
    const mockStatusResponse: ScoringJobStatusResponseDto = {
      jobId: mockJobId,
      sessionId: '22222222-2222-4222-8222-222222222222',
      status: ScoringJobStatus.COMPLETED,
      createdAt: '2026-09-29T10:00:00.000Z',
      completedAt: '2026-09-29T10:02:30.000Z',
    };

    it('should return ApiSuccessResponse when job status is retrieved successfully', async () => {
      getJobStatusAsyncMock.mockResolvedValue(ok(mockStatusResponse));

      const response = await controller.getJobStatus(mockJobId, mockUser);

      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockStatusResponse);
      expect(response.message).toBe('Job status retrieved successfully');
      expect(getJobStatusAsyncMock).toHaveBeenCalledWith(
        mockJobId,
        mockUser.sub,
        mockUser.role,
      );
    });

    it('should throw HttpException with 404 when job is not found', async () => {
      getJobStatusAsyncMock.mockResolvedValue(
        err(new AppError(ErrorCode.NotFound, 'Job not found')),
      );

      await expect(
        controller.getJobStatus(mockJobId, mockUser),
      ).rejects.toThrow(HttpException);

      try {
        await controller.getJobStatus(mockJobId, mockUser);
      } catch (e) {
        const error = e as HttpException;
        expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should throw HttpException with 403 when user is forbidden', async () => {
      getJobStatusAsyncMock.mockResolvedValue(
        err(new AppError(ErrorCode.Forbidden, 'Forbidden')),
      );

      await expect(
        controller.getJobStatus(mockJobId, mockUser),
      ).rejects.toThrow(HttpException);

      try {
        await controller.getJobStatus(mockJobId, mockUser);
      } catch (e) {
        const error = e as HttpException;
        expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });
  });
});
