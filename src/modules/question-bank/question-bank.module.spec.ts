import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ok } from 'neverthrow';
import { PrismaModule } from '../../shared/infrastructure/database/prisma.module';
import { PrismaService } from '../../shared/infrastructure/database/prisma.service';
import { GeminiProvider } from '../../shared/llm/gemini.provider';
import { GroqProvider } from '../../shared/llm/groq.provider';
import { ILlmProvider } from '../../shared/llm/llm.provider';
import { IQuestionBankService } from './application/interfaces/question-bank.service.interface';
import { QuestionBankService } from './application/services/question-bank.service';
import { QuestionBankModule } from './question-bank.module';

jest.mock('../../shared/infrastructure/database/prisma.service', () => ({
  PrismaService: class {},
}));

// Kiểm tra đồ thị DI thật: module ngân hàng nhập module sinh câu hỏi để dùng repo của nó, rồi
// chạy một lượt "dùng câu từ ngân hàng" qua service và hai repo thật (Prisma được thay bằng giả).
describe('QuestionBankModule', () => {
  it('wires the bank service to the question-generation repository and sets a session from the bank', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const sessionId = '00000000-0000-4000-8000-000000000002';
    const itemIds = [
      '00000000-0000-4000-8000-0000000000a1',
      '00000000-0000-4000-8000-0000000000a2',
      '00000000-0000-4000-8000-0000000000a3',
    ];
    const storedRows = [
      {
        publicId: 'q-1',
        orderIndex: 1,
        content: 'B',
        domain: 'BEHAVIORAL',
        difficulty: 'HARD',
      },
      {
        publicId: 'q-2',
        orderIndex: 2,
        content: 'A',
        domain: 'TECHNICAL',
        difficulty: 'EASY',
      },
      {
        publicId: 'q-3',
        orderIndex: 3,
        content: 'C',
        domain: 'SITUATIONAL',
        difficulty: 'MEDIUM',
      },
    ];
    const createMany = jest.fn().mockResolvedValue({ count: 3 });
    const tx = {
      interviewSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      question: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany,
        findMany: jest.fn().mockResolvedValue(storedRows),
      },
    };
    const prisma = {
      interviewSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 7,
          status: 'CREATED',
          jobDescription: null,
          cv: null,
        }),
      },
      questionBankItem: {
        findMany: jest.fn().mockResolvedValue(
          // Cố ý trả lộn thứ tự.
          [
            {
              publicId: itemIds[1],
              content: 'A',
              domain: 'TECHNICAL',
              difficulty: 'EASY',
              createdAt: new Date(),
            },
            {
              publicId: itemIds[2],
              content: 'C',
              domain: 'SITUATIONAL',
              difficulty: 'MEDIUM',
              createdAt: new Date(),
            },
            {
              publicId: itemIds[0],
              content: 'B',
              domain: 'BEHAVIORAL',
              difficulty: 'HARD',
              createdAt: new Date(),
            },
          ],
        ),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: 'test-secret' })],
        }),
        PrismaModule,
        QuestionBankModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(ILlmProvider)
      .useValue({ generateJson: jest.fn() })
      .overrideProvider(GeminiProvider)
      .useValue({})
      .overrideProvider(GroqProvider)
      .useValue({})
      .compile();

    try {
      await module.init();
      const service = module.get(IQuestionBankService);
      expect(service).toBeInstanceOf(QuestionBankService);

      const result = await service.useInSessionAsync(userId, sessionId, {
        itemPublicIds: itemIds,
      });

      expect(result).toEqual(
        ok({
          sessionPublicId: sessionId,
          questions: [
            {
              publicId: 'q-1',
              orderIndex: 1,
              content: 'B',
              domain: 'BEHAVIORAL',
              difficulty: 'HARD',
            },
            {
              publicId: 'q-2',
              orderIndex: 2,
              content: 'A',
              domain: 'TECHNICAL',
              difficulty: 'EASY',
            },
            {
              publicId: 'q-3',
              orderIndex: 3,
              content: 'C',
              domain: 'SITUATIONAL',
              difficulty: 'MEDIUM',
            },
          ],
        }),
      );
      // Thứ tự lưu theo thứ tự người dùng chọn (B, A, C), dù DB trả A, C, B.
      expect(createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            sessionId: 7,
            orderIndex: 1,
            content: 'B',
          }),
          expect.objectContaining({
            sessionId: 7,
            orderIndex: 2,
            content: 'A',
          }),
          expect.objectContaining({
            sessionId: 7,
            orderIndex: 3,
            content: 'C',
          }),
        ],
      });
      expect(tx.interviewSession.updateMany).toHaveBeenCalledWith({
        where: { id: 7, status: 'CREATED' },
        data: { totalQuestions: 3 },
      });
    } finally {
      await module.close();
    }
  });
});
