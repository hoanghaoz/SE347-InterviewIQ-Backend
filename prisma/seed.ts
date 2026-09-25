import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  Prisma,
  PrismaClient,
  UserRole,
  ParseStatus,
  SessionStatus,
  QuestionDomain,
  QuestionDifficulty,
  CheatEventType,
} from '../generated/prisma/client';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seed database...');

  // 1. Dọn dẹp dữ liệu cũ theo thứ tự quan hệ (tránh lỗi Foreign Key)
  console.log('Cleaning old data...');
  await prisma.cheatLog.deleteMany();
  await prisma.score.deleteMany();
  await prisma.interviewSummary.deleteMany();
  await prisma.answer.deleteMany();
  await prisma.question.deleteMany();
  await prisma.interviewSession.deleteMany();
  await prisma.cv.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  // 2. Hash mật khẩu cho các tài khoản test
  const saltRounds = 10;
  const userPasswordHash = await bcrypt.hash('password123', saltRounds);
  const adminPasswordHash = await bcrypt.hash('admin123', saltRounds);

  // 3. Seed Users
  console.log('Seeding Users...');
  const testUser = await prisma.user.create({
    data: {
      email: 'test@mockmate.dev',
      passwordHash: userPasswordHash,
      fullName: 'Test Candidate',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=candidate',
      role: UserRole.USER,
    },
  });

  const _adminUser = await prisma.user.create({
    data: {
      email: 'admin@mockmate.dev',
      passwordHash: adminPasswordHash,
      fullName: 'Admin User',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
      role: UserRole.ADMIN,
    },
  });

  console.log(`   Created user: ${testUser.email} (ID: ${testUser.id})`);
  console.log(`   Created admin: ${_adminUser.email} (ID: ${_adminUser.id})`);

  // 4. Seed CVs cho testUser
  console.log('Seeding CVs...');
  const completedCv = await prisma.cv.create({
    data: {
      userId: testUser.id,
      fileName: 'software_engineer_cv.pdf',
      fileUrl: 'https://storage.mockmate.dev/cvs/software_engineer_cv.pdf',
      fileSize: 102400,
      rawText:
        'Nguyễn Văn A - Backend Engineer. Kinh nghiệm 2 năm với NestJS, PostgreSQL, Redis, Docker. Sinh viên Kỹ thuật Phần mềm ĐHQG-HCM.',
      parsedData: {
        summary: 'Backend-oriented software engineering student',
        skills: {
          languages: ['TypeScript', 'JavaScript'],
          frameworks: ['NestJS', 'Express', 'React'],
          databases: ['PostgreSQL', 'Redis'],
          tools: ['Docker', 'Git', 'Postman'],
        },
        experiences: [
          {
            company: 'ABC Tech Solutions',
            position: 'Backend Developer Intern',
            startDate: '2025-06',
            endDate: '2025-12',
            description:
              'Developed REST APIs, optimized SQL queries, and integrated Redis cache.',
            technologies: ['NestJS', 'PostgreSQL', 'Docker'],
          },
        ],
        education: [
          {
            institution: 'Đại học Công nghệ Thông tin - ĐHQG TP.HCM',
            degree: 'Kỹ sư Kỹ thuật Phần mềm',
            graduationYear: 2026,
          },
        ],
        projects: [
          {
            name: 'MockMate AI',
            description: 'AI-powered mock interview practice platform',
            role: 'Backend Engineer',
          },
        ],
      },
      parseStatus: ParseStatus.COMPLETED,
      parserVersion: 'v1.0.0',
      isActive: true,
    },
  });

  const _pendingCv = await prisma.cv.create({
    data: {
      userId: testUser.id,
      fileName: 'frontend_resume.pdf',
      fileUrl: 'https://storage.mockmate.dev/cvs/frontend_resume.pdf',
      fileSize: 85400,
      rawText: null,
      parsedData: Prisma.DbNull,
      parseStatus: ParseStatus.PENDING,
      parserVersion: null,
      isActive: false,
    },
  });

  console.log(`   Created CV (COMPLETED): ID ${completedCv.id}`);
  console.log(`   Created CV (PENDING): ID ${_pendingCv.id}`);

  // 5. Seed Interview Session
  console.log('Seeding Interview Session...');
  const now = new Date();
  const session = await prisma.interviewSession.create({
    data: {
      userId: testUser.id,
      cvId: completedCv.id,
      cvSnapshot: {
        sourceCvPublicId: completedCv.publicId,
        fileName: completedCv.fileName,
        fileUrl: completedCv.fileUrl,
        fileSize: completedCv.fileSize,
        rawText: completedCv.rawText,
        parsedData: completedCv.parsedData,
        parserVersion: completedCv.parserVersion,
      },
      title: 'Thực hành phỏng vấn vị trí Backend Engineer (NestJS/PostgreSQL)',
      jobDescription:
        'Yêu cầu: Thành thạo TypeScript, NestJS framework, thiết kế cơ sở dữ liệu PostgreSQL chuẩn hóa, nắm vững caching với Redis và kiến trúc Microservices cơ bản.',
      status: SessionStatus.COMPLETED,
      totalQuestions: 5,
      durationSeconds: 900,
      startedAt: new Date(now.getTime() - 3600 * 1000),
      submittedAt: new Date(now.getTime() - 2700 * 1000),
      completedAt: new Date(now.getTime() - 2600 * 1000),
    },
  });

  console.log(`   Created Interview Session: ID ${session.id}`);

  // 6. Seed Questions & Answers
  console.log('Seeding Questions & Answers...');
  const questionsData = [
    {
      content:
        'Bạn hãy giải thích cơ chế Dependency Injection trong NestJS và lợi ích của nó trong việc kiểm thử đơn vị.',
      orderIndex: 0,
      domain: QuestionDomain.TECHNICAL,
      difficulty: QuestionDifficulty.MEDIUM,
      answer: {
        transcript:
          'Dependency Injection trong NestJS là một design pattern giúp IoC (Inversion of Control), trong đó các dependencies được inject vào class thay vì class tự khởi tạo. Nó giúp code loose coupling và dễ dàng mock dependencies khi viết unit test.',
        videoUrl: 'https://storage.mockmate.dev/videos/ans_q1.mp4',
        durationSeconds: 110,
        emotionSummary: {
          dominant: 'neutral',
          distribution: {
            neutral: 0.6,
            happy: 0.25,
            surprised: 0.05,
            sad: 0.05,
            angry: 0.03,
            fearful: 0.02,
          },
        },
      },
    },
    {
      content:
        'Làm thế nào để bạn tối ưu hóa hiệu năng một câu truy vấn chậm trong PostgreSQL?',
      orderIndex: 1,
      domain: QuestionDomain.TECHNICAL,
      difficulty: QuestionDifficulty.HARD,
      answer: {
        transcript:
          'Để tối ưu câu truy vấn chậm, trước tiên tôi sử dụng EXPLAIN ANALYZE để phân tích execution plan, kiểm tra Seq Scan và đánh index phù hợp như B-Tree hoặc Composite index. Đồng thời tránh SELECT * và cấu hình connection pool hợp lý.',
        videoUrl: 'https://storage.mockmate.dev/videos/ans_q2.mp4',
        durationSeconds: 135,
        emotionSummary: {
          dominant: 'neutral',
          distribution: {
            neutral: 0.7,
            happy: 0.15,
            surprised: 0.05,
            sad: 0.04,
            angry: 0.03,
            fearful: 0.03,
          },
        },
      },
    },
    {
      content:
        'Hãy kể về một lần bạn xảy ra bất đồng quan điểm kỹ thuật với đồng nghiệp trong nhóm và cách bạn giải quyết.',
      orderIndex: 2,
      domain: QuestionDomain.BEHAVIORAL,
      difficulty: QuestionDifficulty.MEDIUM,
      answer: {
        transcript:
          'Trong dự án trước, tôi và một bạn tranh luận giữa việc dùng REST API và GraphQL. Tôi đề xuất cả hai xây dựng Proof of Concept nhỏ và đo lường theo tiêu chí thời gian bàn giao và yêu cầu của mobile client, từ đó cả đội thống nhất chọn REST.',
        videoUrl: 'https://storage.mockmate.dev/videos/ans_q3.mp4',
        durationSeconds: 120,
        emotionSummary: {
          dominant: 'happy',
          distribution: {
            happy: 0.45,
            neutral: 0.45,
            surprised: 0.04,
            sad: 0.02,
            angry: 0.02,
            fearful: 0.02,
          },
        },
      },
    },
    {
      content:
        'Nếu một API trên production đột ngột bị chậm và response time tăng vọt gấp 10 lần, các bước xử lý sự cố của bạn là gì?',
      orderIndex: 3,
      domain: QuestionDomain.SITUATIONAL,
      difficulty: QuestionDifficulty.HARD,
      answer: {
        transcript:
          'Đầu tiên tôi kiểm tra hệ thống giám sát và log để xác định bottleneck ở database, CPU hay third-party. Nếu có bản deploy gần nhất nghi ngờ, tôi ưu tiên rollback. Tiếp đó kích hoạt cache tạm thời để giảm tải cho DB và điều tra root cause.',
        videoUrl: 'https://storage.mockmate.dev/videos/ans_q4.mp4',
        durationSeconds: 140,
        emotionSummary: {
          dominant: 'neutral',
          distribution: {
            neutral: 0.65,
            happy: 0.1,
            surprised: 0.1,
            sad: 0.05,
            angry: 0.05,
            fearful: 0.05,
          },
        },
      },
    },
    {
      content:
        'Bạn làm thế nào để quản lý thời gian khi có nhiều công việc khẩn cấp cùng rơi vào một thời điểm?',
      orderIndex: 4,
      domain: QuestionDomain.BEHAVIORAL,
      difficulty: QuestionDifficulty.EASY,
      answer: {
        transcript:
          'Tôi phân loại công việc theo ma trận Eisenhower để xác định việc quan trọng và khẩn cấp. Sau đó tôi trao đổi sớm với Tech Lead để cân đối lại độ ưu tiên và thông báo kịp thời nếu có rủi ro về tiến độ.',
        videoUrl: 'https://storage.mockmate.dev/videos/ans_q5.mp4',
        durationSeconds: 95,
        emotionSummary: {
          dominant: 'neutral',
          distribution: {
            neutral: 0.55,
            happy: 0.3,
            surprised: 0.05,
            sad: 0.04,
            angry: 0.03,
            fearful: 0.03,
          },
        },
      },
    },
  ];

  for (const qData of questionsData) {
    const question = await prisma.question.create({
      data: {
        sessionId: session.id,
        content: qData.content,
        orderIndex: qData.orderIndex,
        domain: qData.domain,
        difficulty: qData.difficulty,
        answer: {
          create: {
            transcript: qData.answer.transcript,
            videoUrl: qData.answer.videoUrl,
            durationSeconds: qData.answer.durationSeconds,
            emotionSummary: qData.answer.emotionSummary,
          },
        },
      },
    });
    console.log(
      `   Created Question #${question.orderIndex + 1} (Domain: ${question.domain}) + Answer`,
    );
  }

  // 7. Seed Score
  console.log('Seeding Score...');
  const score = await prisma.score.create({
    data: {
      sessionId: session.id,
      contentScore: 8.5,
      relevanceScore: 8.0,
      confidenceScore: 7.5,
      overallScore: 8.0,
      scoredAt: new Date(now.getTime() - 2600 * 1000),
    },
  });
  console.log(`   Created Score: Overall ${score.overallScore}/10`);

  // 8. Seed Interview Summary
  console.log('Seeding Interview Summary...');
  const summary = await prisma.interviewSummary.create({
    data: {
      sessionId: session.id,
      overallFeedback:
        'Ứng viên thể hiện kiến thức kỹ thuật backend vững vàng, nắm rõ nguyên lý NestJS và tư duy tối ưu cơ sở dữ liệu tốt. Phong thái tự tin, phản hồi mạch lạc. Cần chú ý thêm kỹ năng cấu trúc câu trả lời hành vi theo mô hình STAR.',
      strengths: [
        {
          category: 'TECHNICAL_KNOWLEDGE',
          title: 'Kiến thức NestJS & Database tốt',
          description:
            'Giải thích chính xác cơ chế Dependency Injection và phương pháp tối ưu PostgreSQL bằng EXPLAIN ANALYZE cùng indexing.',
        },
        {
          category: 'CONFIDENCE',
          title: 'Phong thái tự tin và chuyên nghiệp',
          description:
            'Trình bày câu trả lời lưu loát, giọng điệu tự tin, biểu cảm ổn định xuyên suốt phỏng vấn.',
        },
      ],
      improvements: [
        {
          category: 'COMMUNICATION',
          title: 'Cần áp dụng cấu trúc STAR chặt chẽ hơn',
          description:
            'Ở câu hỏi hành vi, nên nêu rõ hơn kết quả đo lường được (Result) thay vì chỉ dừng lại ở giải pháp (Action).',
          suggestion:
            'Bổ sung số liệu cụ thể về kết quả sau khi thống nhất giải pháp.',
        },
        {
          category: 'PROBLEM_SOLVING',
          title: 'Quy trình xử lý sự cố cần bổ sung bước rollback',
          description:
            'Khi API bị chậm trên production, nên cân nhắc phương án rollback bản release gần nhất trước nếu nguyên nhân do deploy mới.',
          suggestion:
            'Đưa quy trình Incident Management chuẩn vào checklist xử lý sự cố.',
        },
      ],
      scoringModel: 'gpt-4o',
      promptVersion: 'v1.0.0',
      generatedAt: new Date(now.getTime() - 2600 * 1000),
    },
  });
  console.log(`   Created Interview Summary (Model: ${summary.scoringModel})`);

  // 9. Seed Cheat Logs
  console.log('Seeding Cheat Logs...');
  await prisma.cheatLog.createMany({
    data: [
      {
        sessionId: session.id,
        eventType: CheatEventType.TAB_SWITCH,
        description: 'Người dùng chuyển tab trình duyệt trong câu hỏi số 2',
        occurredAt: new Date(now.getTime() - 3200 * 1000),
      },
      {
        sessionId: session.id,
        eventType: CheatEventType.WINDOW_BLUR,
        description: 'Cửa sổ trình duyệt mất tiêu điểm trong 3 giây',
        occurredAt: new Date(now.getTime() - 3150 * 1000),
      },
      {
        sessionId: session.id,
        eventType: CheatEventType.FACE_MISSING,
        description: 'Không phát hiện khuôn mặt trong camera trong 4 giây',
        occurredAt: new Date(now.getTime() - 2900 * 1000),
      },
    ],
  });
  console.log('   Created 3 Cheat Logs.');

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
