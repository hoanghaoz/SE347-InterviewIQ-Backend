import { HttpException, HttpStatus } from '@nestjs/common';
import { err, ok } from 'neverthrow';
import { CommonUserRole } from '../../../shared/common/commonEnum';
import { AppError, ErrorCode } from '../../../shared/common/errorCode';
import type { JwtPayload } from '../../../shared/common/jwt.payload.interface';
import { ScoringJobStatus } from '../domain/enums/scoring-enum';
import { IScoringService } from '../application/interfaces/scoring.service.interface';
import {
  ScoringJobStatusResponseDto,
  SessionResultResponseDto,
} from '../application/dtos/scoring.response.dto';
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
  const getSessionResultAsyncMock = jest.fn<
    ReturnType<IScoringService['getSessionResultAsync']>,
    Parameters<IScoringService['getSessionResultAsync']>
  >();

  const scoringService: IScoringService = {
    enqueueAsync: enqueueAsyncMock,
    getJobStatusAsync: getJobStatusAsyncMock,
    getSessionResultAsync: getSessionResultAsyncMock,
  };

  const mockUser: JwtPayload = {
    sub: '11111111-1111-4111-8111-111111111111',
    email: 'test@example.com',
    role: CommonUserRole.USER,
  };
  const mockJobId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const mockSessionId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    enqueueAsyncMock.mockReset();
    getJobStatusAsyncMock.mockReset();
    getSessionResultAsyncMock.mockReset();
    controller = new ScoringController(scoringService);
  });

  describe('getJobStatus', () => {
    const mockStatusResponse: ScoringJobStatusResponseDto = {
      jobId: mockJobId,
      sessionId: mockSessionId,
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

    it('should throw HttpException when service returns NotFound error', async () => {
      getJobStatusAsyncMock.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.NotFound,
            `Scoring job with id '${mockJobId}' not found`,
          ),
        ),
      );

      await expect(
        controller.getJobStatus(mockJobId, mockUser),
      ).rejects.toThrow(HttpException);

      try {
        await controller.getJobStatus(mockJobId, mockUser);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should throw HttpException when service returns Forbidden error', async () => {
      getJobStatusAsyncMock.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.Forbidden,
            'You are not authorized to view this scoring job',
          ),
        ),
      );

      await expect(
        controller.getJobStatus(mockJobId, mockUser),
      ).rejects.toThrow(HttpException);

      try {
        await controller.getJobStatus(mockJobId, mockUser);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });
  });

  describe('getSessionResult', () => {
    const mockResultResponse: SessionResultResponseDto = {
      sessionId: mockSessionId,
      scores: {
        publicId: 'score-uuid-1',
        contentScore: 8.0,
        relevanceScore: 7.5,
        confidenceScore: 6.5,
        overallScore: 7.4,
        scoredAt: '2026-09-23T10:02:30.000Z',
      },
      summary: {
        publicId: 'summary-uuid-2',
        overallFeedback: 'Ứng viên có kiến thức tốt.',
        strengths: [
          {
            category: 'TECHNICAL_KNOWLEDGE',
            title: 'Backend',
            description: 'Good DI',
          },
        ],
        improvements: [
          {
            category: 'COMMUNICATION',
            title: 'Directness',
            description: 'Concise answers',
            suggestion: 'STAR method',
          },
        ],
        scoringModel: 'gemini-2.5-flash',
        promptVersion: 'v1.0',
        generatedAt: '2026-09-23T10:02:30.000Z',
      },
    };

    it('should return ApiSuccessResponse when session result is retrieved successfully', async () => {
      getSessionResultAsyncMock.mockResolvedValue(ok(mockResultResponse));

      const response = await controller.getSessionResult(
        mockSessionId,
        mockUser,
      );

      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockResultResponse);
      expect(response.message).toBe('Scoring result retrieved successfully');
      expect(getSessionResultAsyncMock).toHaveBeenCalledWith(
        mockSessionId,
        mockUser.sub,
        mockUser.role,
      );
    });

    it('should throw HttpException with 404 when session is not found', async () => {
      getSessionResultAsyncMock.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.NotFound,
            `Interview session with id '${mockSessionId}' not found`,
          ),
        ),
      );

      await expect(
        controller.getSessionResult(mockSessionId, mockUser),
      ).rejects.toThrow(HttpException);

      try {
        await controller.getSessionResult(mockSessionId, mockUser);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should throw HttpException with 403 when user is not authorized', async () => {
      getSessionResultAsyncMock.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.Forbidden,
            'You are not authorized to view the result of this session',
          ),
        ),
      );

      await expect(
        controller.getSessionResult(mockSessionId, mockUser),
      ).rejects.toThrow(HttpException);

      try {
        await controller.getSessionResult(mockSessionId, mockUser);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it('should throw HttpException with 400 when session scoring is not completed', async () => {
      getSessionResultAsyncMock.mockResolvedValue(
        err(
          new AppError(
            ErrorCode.BadRequest,
            'Session scoring is not completed (current status: SCORING)',
          ),
        ),
      );

      await expect(
        controller.getSessionResult(mockSessionId, mockUser),
      ).rejects.toThrow(HttpException);

      try {
        await controller.getSessionResult(mockSessionId, mockUser);
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.BAD_REQUEST,
        );
      }
    });
  });
});
