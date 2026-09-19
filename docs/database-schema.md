# MockMate AI — Database Schema Specification

> **Tài liệu đặc tả mô hình cơ sở dữ liệu (PostgreSQL + Prisma ORM)**  
> **Phiên bản**: 1.0 | **Phạm vi**: MockMate AI MVP | **Quy ước múi giờ**: UTC / TIMESTAMPTZ

---

## 1. Nguyên Tắc Thiết Kế Cốt Lõi

1. **Dual-ID Strategy (Cơ chế 2 loại ID)**:
   - `id (INT)`: Khóa chính nội bộ (PK, Auto-increment), chỉ dùng cho liên kết Foreign Key và Indexing nội bộ DB nhằm tối ưu hiệu năng join.
   - `public_id (UUID)`: Khóa duy nhất đối ngoại (UUID v4, NOT NULL, UNIQUE), dùng trong toàn bộ API endpoints, URL params, JWT payload và phía Client. Tuyệt đối không để lộ `id` nội bộ ra ngoài client.
2. **Quy ước đặt tên**:
   - Tên bảng: `snake_case`, danh từ số nhiều (ví dụ: `users`, `cvs`, `interview_sessions`).
   - Tên cột: `snake_case` ở tầng Database (dùng `@map("column_name")` trong Prisma), ánh xạ sang `camelCase` ở TypeScript model.
3. **Quản lý thời gian**:
   - Mọi mốc thời gian lưu trữ bằng `TIMESTAMPTZ` theo chuẩn UTC (`created_at`, `updated_at`, ...).
   - Phía Frontend/Client chịu trách nhiệm format và hiển thị theo múi giờ địa phương.
4. **Xử lý dữ liệu linh hoạt (JSONB)**:
   - Cột `parsed_data`, `emotion_summary`, `strengths`, `improvements` sử dụng PostgreSQL `JSONB`.
   - Luôn định nghĩa TypeScript types và validation schema ở tầng Application/Service trước khi ghi/đọc.
5. **Chiến lược xóa dữ liệu (Deletion Rules)**:
   - `ON DELETE CASCADE`: Áp dụng cho các bảng con phụ thuộc hoàn toàn vào bảng cha (ví dụ: xóa User thì xóa Refresh Tokens, CVs; xóa Session thì xóa Questions, Answers, Scores, Logs).
   - `ON DELETE SET NULL`: Áp dụng cho `interview_sessions.cv_id` (khi người dùng xóa CV, phiên phỏng vấn lịch sử vẫn được bảo lưu).

---

## 2. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "has"
    users ||--o{ cvs : "owns"
    users ||--o{ interview_sessions : "conducts"
    cvs ||--o{ interview_sessions : "used_in"
    interview_sessions ||--o{ questions : "contains"
    interview_sessions ||--o| scores : "graded_by"
    interview_sessions ||--o| interview_summaries : "summarized_by"
    interview_sessions ||--o{ cheat_logs : "monitored_by"
    questions ||--o| answers : "answered_by"

    users {
        int id PK
        uuid public_id UK
        varchar email UK
        varchar password_hash
        varchar full_name
        varchar avatar_url
        enum role
        timestamptz created_at
        timestamptz updated_at
    }

    refresh_tokens {
        int id PK
        uuid public_id UK
        int user_id FK
        varchar token_hash UK
        timestamptz revoked_at
        timestamptz expires_at
        timestamptz created_at
    }

    cvs {
        int id PK
        uuid public_id UK
        int user_id FK
        varchar file_name
        varchar file_url
        int file_size
        text raw_text
        jsonb parsed_data
        enum parse_status
        varchar parser_version
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    interview_sessions {
        int id PK
        uuid public_id UK
        int user_id FK
        int cv_id FK
        varchar title
        text job_description
        enum status
        int total_questions
        int duration_seconds
        timestamptz started_at
        timestamptz submitted_at
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }

    questions {
        int id PK
        uuid public_id UK
        int session_id FK
        text content
        int order_index
        enum domain
        enum difficulty
        timestamptz created_at
    }

    answers {
        int id PK
        uuid public_id UK
        int question_id FK
        text transcript
        varchar video_url
        int duration_seconds
        jsonb emotion_summary
        timestamptz created_at
        timestamptz updated_at
    }

    scores {
        int id PK
        uuid public_id UK
        int session_id FK
        float content_score
        float relevance_score
        float confidence_score
        float overall_score
        timestamptz scored_at
        timestamptz created_at
    }

    interview_summaries {
        int id PK
        uuid public_id UK
        int session_id FK
        text overall_feedback
        jsonb strengths
        jsonb improvements
        varchar scoring_model
        varchar prompt_version
        timestamptz generated_at
        timestamptz created_at
    }

    cheat_logs {
        int id PK
        uuid public_id UK
        int session_id FK
        enum event_type
        varchar description
        timestamptz occurred_at
        timestamptz created_at
    }
```

---

## 3. Danh Sách 9 Bảng & Cấu Trúc Chi Tiết

### 3.1 `users` (Tài khoản người dùng)
Lưu trữ thông tin nhận diện tài khoản, authentication và phân quyền.
- **`id`** (`INT`, PK): Auto-increment.
- **`public_id`** (`UUID`, UNIQUE): UUIDv4 đối ngoại.
- **`email`** (`VARCHAR(255)`, UNIQUE): Email đăng nhập.
- **`password_hash`** (`VARCHAR(255)`): Mật khẩu băm (bcrypt).
- **`full_name`** (`VARCHAR(100)`): Họ và tên hiển thị.
- **`avatar_url`** (`VARCHAR(500)`, Nullable): Đường dẫn ảnh đại diện.
- **`role`** (`UserRole`, Default: `USER`): Quyền hạn (`USER` / `ADMIN`).
- **`created_at`**, **`updated_at`** (`TIMESTAMPTZ`).

### 3.2 `refresh_tokens` (Phiên xác thực dài hạn)
Lưu trữ token refresh đã hash nhằm hỗ trợ cơ chế revoke và rotate token an toàn.
- **`id`** (`INT`, PK): Auto-increment.
- **`public_id`** (`UUID`, UNIQUE).
- **`user_id`** (`INT`, FK → `users.id`, ON DELETE CASCADE).
- **`token_hash`** (`VARCHAR(255)`, UNIQUE): Chuỗi refresh token băm sha256/bcrypt.
- **`revoked_at`** (`TIMESTAMPTZ`, Nullable): Thời điểm token bị thu hồi thủ công (logout/rotate).
- **`expires_at`** (`TIMESTAMPTZ`): Thời điểm hết hạn token.
- **`created_at`** (`TIMESTAMPTZ`).
- **Indexes**: `user_id`, `expires_at`.

### 3.3 `cvs` (Metadata và nội dung CV ứng viên)
Quản lý file hồ sơ ứng viên tải lên hệ thống và dữ liệu trích xuất từ CV.
- **`id`** (`INT`, PK): Auto-increment.
- **`public_id`** (`UUID`, UNIQUE).
- **`user_id`** (`INT`, FK → `users.id`, ON DELETE CASCADE).
- **`file_name`** (`VARCHAR(255)`): Tên file gốc (ví dụ: `resume.pdf`).
- **`file_url`** (`VARCHAR(500)`): URL file lưu trên Cloud Object Storage (S3 / Supabase Storage).
- **`file_size`** (`INT`): Dung lượng file (bytes, CHECK > 0).
- **`raw_text`** (`TEXT`, Nullable): Nội dung văn bản thô bóc tách từ PDF.
- **`parsed_data`** (`JSONB`, Nullable): Dữ liệu cấu trúc hóa trích xuất từ CV (kỹ năng, kinh nghiệm, học vấn).
- **`parse_status`** (`ParseStatus`, Default: `PENDING`): Trạng thái xử lý CV.
- **`parser_version`** (`VARCHAR(50)`, Nullable): Phiên bản thuật toán parser.
- **`is_active`** (`BOOLEAN`, Default: `true`): Đánh dấu CV đang được ưu tiên sử dụng.
- **`created_at`**, **`updated_at`** (`TIMESTAMPTZ`).
- **Indexes**: `user_id`, `parse_status`, composite `(user_id, is_active)`.

### 3.4 `interview_sessions` (Phiên phỏng vấn)
Quản lý trạng thái vòng đời một buổi phỏng vấn mô phỏng của người dùng.
- **`id`** (`INT`, PK): Auto-increment.
- **`public_id`** (`UUID`, UNIQUE).
- **`user_id`** (`INT`, FK → `users.id`, ON DELETE CASCADE).
- **`cv_id`** (`INT`, Nullable, FK → `cvs.id`, ON DELETE SET NULL).
- **`title`** (`VARCHAR(255)`): Tiêu đề buổi phỏng vấn (ví dụ: Backend Engineer NestJS).
- **`job_description`** (`TEXT`, Nullable): Mô tả công việc (JD) mục tiêu.
- **`status`** (`SessionStatus`, Default: `CREATED`): Tiến độ buổi phỏng vấn.
- **`total_questions`** (`INT`, Default: `5`): Tổng số câu hỏi dự kiến (CHECK > 0).
- **`duration_seconds`** (`INT`, Nullable): Thời lượng thực tế (giây, CHECK >= 0).
- **`started_at`**, **`submitted_at`**, **`completed_at`** (`TIMESTAMPTZ`, Nullable).
- **`created_at`**, **`updated_at`** (`TIMESTAMPTZ`).
- **Indexes**: `user_id`, `cv_id`, `status`, composite `(user_id, status)`.

### 3.5 `questions` (Câu hỏi trong phiên)
Lưu danh sách câu hỏi AI sinh ra riêng biệt cho từng phiên phỏng vấn.
- **`id`** (`INT`, PK): Auto-increment.
- **`public_id`** (`UUID`, UNIQUE).
- **`session_id`** (`INT`, FK → `interview_sessions.id`, ON DELETE CASCADE).
- **`content`** (`TEXT`): Nội dung câu hỏi phỏng vấn.
- **`order_index`** (`INT`): Thứ tự câu hỏi trong phiên (0, 1, 2,...).
- **`domain`** (`QuestionDomain`): Lĩnh vực chuyên môn (`TECHNICAL`, `BEHAVIORAL`, `SITUATIONAL`).
- **`difficulty`** (`QuestionDifficulty`, Default: `MEDIUM`): Mức độ khó (`EASY`, `MEDIUM`, `HARD`).
- **`created_at`** (`TIMESTAMPTZ`).
- **Indexes**: `session_id`, unique composite `(session_id, order_index)`.

### 3.6 `answers` (Câu trả lời của ứng viên)
Ghi nhận câu trả lời video/audio và bản phiên âm bóc tách được (tối đa 1:1 với `questions`).
- **`id`** (`INT`, PK): Auto-increment.
- **`public_id`** (`UUID`, UNIQUE).
- **`question_id`** (`INT`, UNIQUE, FK → `questions.id`, ON DELETE CASCADE).
- **`transcript`** (`TEXT`, Nullable): Văn bản phiên âm câu trả lời qua STT (Whisper).
- **`video_url`** (`VARCHAR(500)`, Nullable): URL video lưu trữ.
- **`duration_seconds`** (`INT`, Nullable): Thời lượng trả lời (giây, CHECK >= 0).
- **`emotion_summary`** (`JSONB`, Nullable): Phân tích cảm xúc khuôn mặt từ AI computer vision.
- **`created_at`**, **`updated_at`** (`TIMESTAMPTZ`).

### 3.7 `scores` (Điểm số định lượng)
Bảng chấm điểm AI định lượng của phiên phỏng vấn (tối đa 1:1 với `interview_sessions`).
- **`id`** (`INT`, PK): Auto-increment.
- **`public_id`** (`UUID`, UNIQUE).
- **`session_id`** (`INT`, UNIQUE, FK → `interview_sessions.id`, ON DELETE CASCADE).
- **`content_score`** (`FLOAT`): Điểm nội dung kỹ thuật (Thang 0 - 10).
- **`relevance_score`** (`FLOAT`): Điểm bám sát câu hỏi và JD (Thang 0 - 10).
- **`confidence_score`** (`FLOAT`): Điểm tự tin, phong thái (Thang 0 - 10).
- **`overall_score`** (`FLOAT`): Điểm tổng hợp trọng số (Thang 0 - 10).
- **`scored_at`** (`TIMESTAMPTZ`): Thời điểm chấm điểm hoàn tất.
- **`created_at`** (`TIMESTAMPTZ`).

### 3.8 `interview_summaries` (Đánh giá định tính từ LLM)
Nhận xét chi tiết dạng văn bản phân tích điểm mạnh, điểm yếu do AI tổng hợp (tối đa 1:1 với `interview_sessions`).
- **`id`** (`INT`, PK): Auto-increment.
- **`public_id`** (`UUID`, UNIQUE).
- **`session_id`** (`INT`, UNIQUE, FK → `interview_sessions.id`, ON DELETE CASCADE).
- **`overall_feedback`** (`TEXT`): Lời nhận xét tổng quan từ AI.
- **`strengths`** (`JSONB`): Danh sách các điểm mạnh nổi bật (mảng đối tượng `{ category, title, description }`).
- **`improvements`** (`JSONB`): Danh sách các điểm cần cải thiện kèm gợi ý hành động.
- **`scoring_model`** (`VARCHAR(100)`): Mô hình AI thực hiện đánh giá (ví dụ: `gpt-4o`, `claude-3-5-sonnet`).
- **`prompt_version`** (`VARCHAR(50)`, Nullable): Phiên bản template prompt đánh giá.
- **`generated_at`**, **`created_at`** (`TIMESTAMPTZ`).

### 3.9 `cheat_logs` (Nhật ký giám sát liêm chính)
Ghi nhận các sự kiện bất thường cảnh báo gian lận trong suốt quá trình phỏng vấn qua webcam/browser.
- **`id`** (`INT`, PK): Auto-increment.
- **`public_id`** (`UUID`, UNIQUE).
- **`session_id`** (`INT`, FK → `interview_sessions.id`, ON DELETE CASCADE).
- **`event_type`** (`CheatEventType`): Loại sự kiện giám sát.
- **`description`** (`VARCHAR(500)`, Nullable): Mô tả ngữ cảnh chi tiết khi phát hiện sự kiện.
- **`occurred_at`** (`TIMESTAMPTZ`): Thời điểm phát hiện sự kiện.
- **`created_at`** (`TIMESTAMPTZ`).
- **Indexes**: `session_id`, `event_type`, `occurred_at`.

---

## 4. Danh Sách Enums & Giá Trị Hợp Lệ

| Enum Type | Giá Trị (Values) | Ý Nghĩa / Mục Đích Sử Dụng |
|---|---|---|
| **`UserRole`** | `USER`<br>`ADMIN` | Phân quyền tài khoản (Ứng viên tiêu chuẩn hoặc Quản trị viên hệ thống). |
| **`ParseStatus`** | `PENDING`<br>`PROCESSING`<br>`COMPLETED`<br>`FAILED` | Tiến trình xử lý bóc tách và phân tích dữ liệu CV từ file PDF gốc. |
| **`SessionStatus`** | `CREATED`<br>`IN_PROGRESS`<br>`SUBMITTED`<br>`SCORING`<br>`COMPLETED`<br>`FAILED`<br>`CANCELLED` | Vòng đời của phiên phỏng vấn từ khi tạo đề, ứng viên trả lời đến lúc chấm xong. |
| **`QuestionDomain`** | `TECHNICAL`<br>`BEHAVIORAL`<br>`SITUATIONAL` | Phân loại mảng câu hỏi: Chuyên môn kỹ thuật, Tình huống ứng xử, hoặc Hành vi kinh nghiệm. |
| **`QuestionDifficulty`** | `EASY`<br>`MEDIUM`<br>`HARD` | Mức độ phức tạp của câu hỏi phỏng vấn. |
| **`CheatEventType`** | `TAB_SWITCH`<br>`WINDOW_BLUR`<br>`FACE_MISSING`<br>`MULTIPLE_FACES` | Sự kiện giám sát chống gian lận: Chuyển tab trình duyệt, Rời cửa sổ, Mất khuôn mặt, hoặc Xuất hiện nhiều người trước camera. |

---

## 5. Ràng Buộc Kiểm Tra Toàn Vẹn (CHECK Constraints)

Được áp dụng ở tầng PostgreSQL Database nhằm đảm bảo tính toàn vẹn dữ liệu:

```sql
-- Dung lượng file CV phải lớn hơn 0
ALTER TABLE cvs ADD CONSTRAINT cvs_file_size_positive CHECK (file_size > 0);

-- Số lượng câu hỏi phiên phỏng vấn phải > 0
ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_total_questions_positive CHECK (total_questions > 0);

-- Thời lượng phiên phỏng vấn và câu trả lời không được âm
ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_duration_non_negative CHECK (duration_seconds IS NULL OR duration_seconds >= 0);
ALTER TABLE answers ADD CONSTRAINT answers_duration_non_negative CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

-- Tất cả các cột điểm định lượng phải nằm trong thang điểm [0, 10]
ALTER TABLE scores ADD CONSTRAINT scores_range_check CHECK (
  content_score BETWEEN 0 AND 10
  AND relevance_score BETWEEN 0 AND 10
  AND confidence_score BETWEEN 0 AND 10
  AND overall_score BETWEEN 0 AND 10
);
```

---

## 6. Hướng Dẫn Sử Dụng & Seed Data Cho Thành Viên Nhóm

### 6.1 Thiết lập biến môi trường
Tạo file `.env` tại thư mục `backend/` với chuỗi kết nối cơ sở dữ liệu PostgreSQL hợp lệ:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mockmate_db?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/mockmate_db?schema=public"
```

### 6.2 Đồng bộ Schema & Tạo Prisma Client
```bash
# Di chuyển vào thư mục backend
cd backend

# Sinh Prisma Client TypeScript
npx prisma generate

# Áp dụng migration vào database local
npx prisma migrate dev
```

### 6.3 Chạy Seed Data mẫu
Hệ thống sử dụng lệnh seed tự động qua `npx tsx` được cấu hình trong `prisma.config.ts`:
```bash
npx prisma db seed
```

### 6.4 Danh sách tài khoản thử nghiệm (Seed Credentials)
Sau khi seed hoàn tất, bạn có thể dùng ngay 2 tài khoản mẫu sau để kiểm thử authentication & luồng xử lý:

| Tài khoản | Email | Mật khẩu | Quyền hạn |
|---|---|---|---|
| **Test Candidate** | `test@mockmate.dev` | `password123` | `USER` (Đã có sẵn 2 CVs, 1 phiên hoàn tất có Questions, Answers, Score, Summary & Cheat Logs) |
| **System Admin** | `admin@mockmate.dev` | `admin123` | `ADMIN` (Dùng kiểm thử trang quản trị) |

### 6.5 Kiểm tra dữ liệu trực quan bằng Prisma Studio
Để duyệt và chỉnh sửa dữ liệu trực quan trên giao diện Web GUI:
```bash
npx prisma studio
```
Truy cập trình duyệt tại: **`http://localhost:5555`**
