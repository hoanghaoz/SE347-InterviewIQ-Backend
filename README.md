# InterviewIQ Backend

API cho nền tảng luyện phỏng vấn với AI: ứng viên tải CV lên, nhận câu hỏi sinh
từ CV, trả lời bằng video và được chấm điểm tự động.

Một số tài liệu và dữ liệu mẫu còn dùng tên cũ **MockMate AI**.

## Tính năng

| Module                | Chức năng                                                             | Đường dẫn chính                                      | Tài liệu                                                 |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| `authentication`      | Đăng ký bằng OTP, đăng nhập, refresh token, quên và đổi mật khẩu      | `/api/auth`                                          | Swagger                                                  |
| `user`                | Hồ sơ cá nhân và ảnh đại diện                                         | `/api/users/me`                                      | Swagger                                                  |
| `cv`                  | Tải CV, phân tích nội dung, thay file, xóa                            | `/api/cvs`                                           | [CV](docs/api-contract-cv.md)                            |
| `question-generation` | Sinh và sinh lại câu hỏi phỏng vấn từ CV                              | `/api/interview-session/:sessionPublicId/questions`  | [Sinh câu hỏi](docs/api-contract-question-generation.md) |
| `question-bank`       | Ngân hàng câu hỏi riêng của người dùng                                | `/api/question-bank`                                 | [Ngân hàng câu hỏi](docs/api-contract-question-bank.md)  |
| `interview`           | Tạo, bắt đầu, nộp buổi phỏng vấn và tải video câu trả lời             | `/api/interview-session`                             | [Tải video](docs/interview-answer-upload.md)             |
| `interview` (cheat)   | Ghi sự kiện gian lận qua REST hoặc WebSocket (namespace `cheat-logs`) | `/api/interview-session/:sessionPublicId/cheat-logs` | [Cheat log](docs/api-contract-cheat-log.md)              |
| `scoring`             | Chấm điểm nền bằng hàng đợi, theo dõi tiến độ qua polling hoặc SSE    | `/api/scoring`                                       | [Chấm điểm](docs/api-contract-scoring.md)                |
| `interview-history`   | Lịch sử và chi tiết các buổi phỏng vấn                                | `/api/interviews`                                    | [Lịch sử](docs/api-contract-interview-history.md)        |
| `llm-playground`      | Công cụ thử prompt nội bộ, chỉ bật khi `ENABLE_LLM_PLAYGROUND=true`   | `/api/internal/llm-playground`                       | Swagger                                                  |

## Công nghệ

- NestJS 11, TypeScript, Node.js 24
- Prisma 7 và PostgreSQL (hàng đợi chấm điểm dùng `pg-boss` trên cùng database)
- Redis cho OTP và đăng ký đang chờ xác nhận
- Gemini và Groq (tự chuyển sang provider dự phòng khi lỗi)
- Cloudinary cho CV, ảnh đại diện và video
- Socket.IO, Swagger, `neverthrow`
- OpenTelemetry, Prometheus, Grafana, Loki, Jaeger

## Chạy ở máy local

Cần Node.js 24, npm và Docker.

### 1. Cài dependency và tạo `.env`

```bash
npm ci
cp .env.example .env
```

Cấu hình tối thiểu khi chạy app trên máy và database, Redis, Mailpit trong
Docker:

```env
POSTGRES_USER=interviewiq
POSTGRES_PASSWORD=change-me
POSTGRES_DB=interviewiq
DATABASE_URL=postgresql://interviewiq:change-me@localhost:5432/interviewiq
DIRECT_URL=postgresql://interviewiq:change-me@localhost:5432/interviewiq

REDIS_URL=redis://localhost:6379

JWT_SECRET=change-me-to-a-long-random-string
JWT_ACCESS_EXPIRES_IN=900
JWT_REFRESH_EXPIRES_IN=604800

MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_SECURE=false
MAIL_FROM=dev@localhost
```

Thay giá trị trong `.env` đã copy, đừng thêm dòng trùng. Không commit `.env`.

### 2. Khởi động dịch vụ phụ thuộc

```bash
docker compose up -d database redis mailpit
```

Email gửi ra (ví dụ OTP) xem tại Mailpit: <http://localhost:8025>.

### 3. Chuẩn bị database

```bash
npx prisma generate
npx prisma migrate deploy
```

`generated/prisma` không được commit, nên cần chạy `prisma generate` sau khi
clone và sau mỗi lần đổi schema.

Tùy chọn, nạp dữ liệu mẫu:

```bash
npx prisma db seed
```

> **Cảnh báo:** seed **xóa toàn bộ dữ liệu** trước khi nạp. Chỉ dùng cho database
> local.

| Tài khoản mẫu        | Mật khẩu      | Vai trò |
| -------------------- | ------------- | ------- |
| `test@mockmate.dev`  | `password123` | `USER`  |
| `admin@mockmate.dev` | `admin123`    | `ADMIN` |

### 4. Chạy app

```bash
npm run start:dev
```

- API: <http://localhost:3000> (đổi bằng `PORT`)
- Swagger: <http://localhost:3000/docs>

CORS hiện chỉ cho phép `http://localhost:5173` và `http://localhost:3000`
([`cors.config.ts`](src/shared/common/cors.config.ts)).

## Biến môi trường

Danh sách đầy đủ ở [`.env.example`](.env.example).

| Biến                                                                   | Khi nào cần                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`, `REDIS_URL`                                            | Bắt buộc                                                 |
| `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`        | Bắt buộc                                                 |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_FROM`                                  | Bắt buộc                                                 |
| `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_SECURE`                            | Khi dùng SMTP thật                                       |
| `DIRECT_URL`                                                           | Khi migration cần kết nối trực tiếp tới database         |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Tải CV, ảnh đại diện, video                              |
| `GEMINI_API_KEY`, `GROQ_API_KEY`, `LLM_PRIMARY_PROVIDER`               | Các tính năng AI (phân tích CV, sinh câu hỏi, chấm điểm) |
| `ENABLE_LLM_PLAYGROUND`                                                | Bật công cụ thử prompt (tốn quota AI thật)               |
| `SCORING_*`                                                            | Tinh chỉnh worker chấm điểm                              |
| `OTEL_*`                                                               | Telemetry                                                |

`npm run doctor` hiện còn yêu cầu các biến S3/Cloudflare R2 (`S3_BUCKET_NAME`,
`CLOUDFLARE_*`, `S3_API_ENDPOINT`), nên có thể báo thiếu dù app vẫn chạy được.

## Scripts

| Lệnh                          | Tác dụng                                      |
| ----------------------------- | --------------------------------------------- |
| `npm run start:dev`           | Chạy ở chế độ watch                           |
| `npm run start:dev:otel`      | Chạy watch kèm OpenTelemetry                  |
| `npm run build`               | Build vào `dist/`                             |
| `npm run start:prod:otel`     | Chạy bản build (`dist/src/main.js`)           |
| `npm run lint` / `lint:check` | ESLint, có / không tự sửa                     |
| `npm run format`              | Prettier cho `src/` và `test/`                |
| `npm test`                    | Unit test (`src/**/*.spec.ts`)                |
| `npm run test:e2e`            | E2E test (`test/*.e2e-spec.ts`), mock service |
| `npm run test:cov`            | Unit test kèm coverage                        |
| `npm run scaffold -- <tên>`   | Tạo khung module mới                          |

## Docker

Build image:

```bash
docker build -t interviewiq-api:local .
```

Chạy cả stack (API và monitoring):

```bash
docker compose up -d --build
```

Khi API chạy trong Compose:

- `DATABASE_URL` phải trỏ tới host `database` thay vì `localhost`, và
  `MAIL_HOST=mailpit`. `REDIS_URL` được `compose.yml` tự ghi đè.
- Alertmanager cần `SMTP_USERNAME` và `SMTP_PASSWORD`.

Image **không tự chạy migration**. Chạy `npx prisma migrate deploy` từ source
trước khi triển khai bản mới.

## CI/CD

Workflow [`Backend CI`](.github/workflows/backend_ci.yml) chạy khi mở pull
request hoặc push vào `main`:

1. Kiểm tra schema Prisma, lint, `actionlint`.
2. Unit test, e2e test, build và kiểm tra cấu hình Compose.
3. Build Docker image và quét bằng Trivy (chỉ báo cáo, không chặn).
4. Khi push vào `main`: đẩy `<DOCKERHUB_USERNAME>/interviewiq-api` lên Docker Hub
   với tag `sha-<commit>`, và `latest` nếu đó là commit mới nhất.

Pull request chỉ build image khi thay đổi code hoặc file liên quan tới image.
Chi tiết: [GitHub Workflows](docs/github-workflows.md).

## Observability

| Công cụ      | Địa chỉ mặc định         |
| ------------ | ------------------------ |
| Grafana      | <http://localhost:3001>  |
| Prometheus   | <http://localhost:9090>  |
| Alertmanager | <http://localhost:9093>  |
| Jaeger       | <http://localhost:16686> |
| Alloy        | <http://localhost:4201>  |

Cách dùng và cấu hình cảnh báo: [`monitoring/README.md`](monitoring/README.md).

## Cấu trúc thư mục

```text
src/
  modules/<feature>/
    api/              # controller, gateway
    application/      # service, DTO
    domain/           # entity, contract, lỗi nghiệp vụ
    infrastructure/   # Prisma, dịch vụ ngoài
  shared/             # common, decorators, infrastructure, llm, response, telemetry
prisma/               # schema (nhiều file), migrations, seed
test/                 # e2e test
docs/                 # tài liệu và API contract
monitoring/           # cấu hình observability
scripts/              # doctor, scaffold, stress test
```

Phụ thuộc đi theo một chiều `api → application → domain`; `infrastructure` hiện
thực các contract của `domain`.

## Đóng góp

- Không push thẳng vào `main`. Tạo nhánh như `feat/interview-room` và mở pull
  request.
- Commit theo Conventional Commits: `<type>(<scope>): <mô tả>`.
- Husky chạy lint trước khi commit, build trước khi push và commitlint cho
  message.

| Tài liệu                                        | Nội dung                  |
| ----------------------------------------------- | ------------------------- |
| [Kiến trúc](docs/backend-architecture.md)       | Đọc trước khi thêm module |
| [Code style](docs/backend-code-style.md)        | Entity, DTO, repository   |
| [Quy trình làm việc](docs/code-workflow.md)     | Thiết lập và kiểm tra     |
| [Đặt tên](docs/naming-convention.md)            | Quy ước đặt tên           |
| [Commit](docs/conventional-commit.md)           | Định dạng commit          |
| [Response API](docs/api-response-convention.md) | Format response và lỗi    |
| [Database](docs/database-schema.md)             | Schema                    |

## License

[MIT](LICENSE)
