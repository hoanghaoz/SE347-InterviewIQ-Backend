# API Contract: Interview History Module

Hợp đồng giao tiếp (API Contract) cho **Module Lịch sử phỏng vấn (Interview History)** của MockMate AI. Module cung cấp danh sách các buổi phỏng vấn đã thực hiện (phân trang, lọc theo thời gian và trạng thái) và khung dữ liệu cho trang chi tiết một buổi phỏng vấn.

Mã nguồn: `src/modules/interview-history/`. Branch: `feat/history-interview`.

---

## 1. Phạm vi module

| Thuộc module này | Không thuộc module này |
| --- | --- |
| `GET /api/interviews` — danh sách lịch sử | Tạo / bắt đầu / nộp buổi phỏng vấn (`InterviewModule`) |
| `GET /api/interviews/:id` — chi tiết một buổi | Chấm điểm và kết quả chi tiết (`ScoringModule`) |
| | Câu hỏi và câu trả lời của buổi phỏng vấn (`InterviewModule`) |

Module chỉ **đọc**. Không có endpoint nào ghi dữ liệu, không sở hữu bảng nào trong database; nó đọc `interview_sessions` cùng hai quan hệ `cv` và `score`.

## 2. Quy ước chung

Áp dụng nguyên `docs/api-response-convention.md`:

1. **Prefix**: mọi endpoint dùng tiền tố `/api/`.
2. **Xác thực**: bắt buộc `Authorization: Bearer <access_token>`. Guard là `@Auth([ADMIN, USER])`, đặt **trên từng method** — `RolesGuard` đọc metadata bằng `reflector.get(Roles, context.getHandler())` nên `@Auth` ở cấp class sẽ không được nhận và route trả 403.
3. **Chủ sở hữu**: định danh người gọi luôn lấy từ `sub` (publicId) của access token. Không endpoint nào nhận user id từ query, param hay body.
4. **Thành công**: bọc trong `ApiSuccessResponse<T>` → `{ statusCode, success: true, data, message, timestamp }`.
5. **Lỗi**: service trả `Result<T, AppError>`, controller đổi sang HTTP bằng `toHttpException(error)`. `AllExceptionsFilter` quyết định shape cuối: `{ statusCode, success: false, code, message, errors?, path, timestamp }`.
6. **Định danh**: mọi `id` xuất hiện trong request và response đều là `publicId` dạng UUID. Id tự tăng của database không bao giờ ra khỏi backend.
7. **Thời gian**: mọi mốc thời gian trong response là chuỗi ISO 8601 UTC (`Date.toISOString()`).

---

## 3. `GET /api/interviews`

Danh sách các buổi phỏng vấn của **chính người gọi**, mới nhất trước.

### 3.1. Request

Không có body.

| Query param | Kiểu | Bắt buộc | Mặc định | Ràng buộc |
| --- | --- | --- | --- | --- |
| `pageNumber` | integer | không | `1` | `>= 1` |
| `pageSize` | integer | không | `20` | `1..100` |
| `fromDate` | ISO 8601 date-time | không | — | lọc `createdAt >= fromDate` |
| `toDate` | ISO 8601 date-time | không | — | lọc `createdAt <= toDate`, bao gồm mốc |
| `status` | enum | không | — | một trong `CREATED`, `IN_PROGRESS`, `SUBMITTED`, `SCORING`, `COMPLETED`, `FAILED`, `CANCELLED` |

Thứ tự sắp xếp là cố định: `createdAt DESC, id DESC`. Không nhận tham số sort từ client.

**Lọc theo `createdAt`, không phải `completedAt`.** Hai lý do: database đã có `@@index([userId, createdAt(sort: Desc)])` nên filter và sort dùng chung một index; và nếu lọc theo `completedAt` thì buổi phỏng vấn chưa chấm xong (`completedAt = null`) sẽ biến mất khỏi danh sách, trong khi người dùng vẫn cần thấy chúng.

`pageSize` bị chặn trên ở 100 trong DTO của module này. `PaginationQueryDto` dùng chung ở `src/shared/common/pagination.ts` chỉ có `@Min(1)`, không có chặn trên.

### 3.2. Response `200 OK`

```jsonc
{
  "statusCode": 200,
  "success": true,
  "message": "Interview history retrieved successfully",
  "timestamp": "2026-10-25T16:40:00.000Z",
  "data": {
    "items": [
      {
        "id": "3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11",
        "title": "Backend Intern - NestJS",
        "status": "COMPLETED",
        "totalQuestions": 5,
        "durationSeconds": 842,
        "overallScore": 7.5,
        "startedAt": "2026-10-20T08:00:00.000Z",
        "completedAt": "2026-10-20T08:14:02.000Z",
        "createdAt": "2026-10-20T07:58:11.000Z"
      }
    ],
    "totalPages": 3,
    "currentPage": 1,
    "pageNumber": 1,
    "pageSize": 20,
    "hasPrevious": false,
    "hasNext": true
  }
}
```

| Field của item | Kiểu | Nullable | Ý nghĩa |
| --- | --- | --- | --- |
| `id` | string (uuid) | không | `publicId` của buổi phỏng vấn |
| `title` | string | không | Tiêu đề buổi phỏng vấn |
| `status` | enum | không | Trạng thái, xem danh sách ở mục 3.1 |
| `totalQuestions` | integer | không | Số câu hỏi của buổi |
| `durationSeconds` | integer | **có** | `null` khi buổi chưa được nộp |
| `overallScore` | number | **có** | `null` khi chưa chấm xong |
| `startedAt` | string (date-time) | **có** | `null` khi chưa bắt đầu |
| `completedAt` | string (date-time) | **có** | `null` khi chưa chấm xong |
| `createdAt` | string (date-time) | không | Mốc dùng để sort và lọc |

`overallScore` lấy qua `score: { select: { overallScore: true } }` trong cùng một truy vấn `findMany`, không sinh N+1.

Item **không** chứa `jobDescription`: cột đó là `@db.Text`, kéo về 20 bản ghi mỗi trang chỉ để màn danh sách không hiển thị là lãng phí. Nó nằm ở API chi tiết.

Khối phân trang là `PageResult<T>` dùng chung. `currentPage` và `pageNumber` hiện luôn mang cùng giá trị — đây là đặc điểm sẵn có của `PageResult`, giữ nguyên để không phá contract của các endpoint khác đang dùng nó.

Danh sách rỗng trả `200` với `items: []`, không trả `404`.

### 3.3. Lỗi

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Query sai kiểu hoặc ngoài ràng buộc (`pageSize=101`, `pageNumber=0`, `fromDate` không phải ISO date-time, `status` không thuộc enum). Kèm `errors: [{ field, messages }]` |
| 400 | `BAD_REQUEST` | `fromDate > toDate` — `message`: `"fromDate must be before or equal to toDate"` |
| 401 | `UNAUTHORIZED` | Thiếu header, sai scheme, token sai hoặc hết hạn |
| 500 | `INTERNAL_SERVER_ERROR` | Lỗi truy vấn database. `message` là `"Failed to load the interview history"`, không lộ message gốc của database |

---

## 4. `GET /api/interviews/:id`

Chi tiết một buổi phỏng vấn của chính người gọi. Đây là **khung** cho trang chi tiết: ba field `score`, `summary`, `questions` đã có mặt trong contract nhưng chưa có dữ liệu, dành cho các module khác đổ vào sau.

### 4.1. Request

| Path param | Kiểu | Ràng buộc |
| --- | --- | --- |
| `id` | string (uuid) | `publicId` của buổi phỏng vấn; validate bằng `ParseUUIDPipe` |

Không có body, không có query param.

### 4.2. Response `200 OK`

```jsonc
{
  "statusCode": 200,
  "success": true,
  "message": "Interview retrieved successfully",
  "timestamp": "2026-10-25T16:40:00.000Z",
  "data": {
    "id": "3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11",
    "title": "Backend Intern - NestJS",
    "jobDescription": "Xây dựng REST API với NestJS...",
    "status": "COMPLETED",
    "totalQuestions": 5,
    "durationSeconds": 842,
    "startedAt": "2026-10-20T08:00:00.000Z",
    "submittedAt": "2026-10-20T08:13:40.000Z",
    "completedAt": "2026-10-20T08:14:02.000Z",
    "createdAt": "2026-10-20T07:58:11.000Z",
    "cv": {
      "id": "9b1c2d3e-4f50-4a6b-8c7d-0e1f2a3b4c5d",
      "fileName": "nguyen-van-a-cv.pdf"
    },
    "score": null,
    "summary": null,
    "questions": []
  }
}
```

| Field | Kiểu | Nullable | Ý nghĩa |
| --- | --- | --- | --- |
| `id` | string (uuid) | không | `publicId` của buổi phỏng vấn |
| `title` | string | không | Tiêu đề |
| `jobDescription` | string | **có** | `null` khi người dùng không nhập JD |
| `status` | enum | không | Trạng thái |
| `totalQuestions` | integer | không | Số câu hỏi |
| `durationSeconds` | integer | **có** | `null` khi chưa nộp |
| `startedAt` | string (date-time) | **có** | `null` khi chưa bắt đầu |
| `submittedAt` | string (date-time) | **có** | `null` khi chưa nộp |
| `completedAt` | string (date-time) | **có** | `null` khi chưa chấm xong |
| `createdAt` | string (date-time) | không | Mốc tạo |
| `cv` | object | **có** | `null` khi buổi phỏng vấn không gắn CV, hoặc CV đã bị xóa (quan hệ là `onDelete: SetNull`) |
| `cv.id` | string (uuid) | không | `publicId` của CV |
| `cv.fileName` | string | không | Tên file CV |

Response **không** trả `cvSnapshot`: đó là cột `Json` chứa toàn bộ nội dung CV tại thời điểm nộp, không cần cho trang chi tiết và làm payload phình to.

### 4.3. Khung cho module khác

Ba field dưới đây luôn có mặt trong response với giá trị rỗng. Module sở hữu dữ liệu sẽ đổ vào sau; khi đó **shape của response không đổi**, nên frontend không phải sửa.

| Field | Giá trị hiện tại | Ai sẽ đổ dữ liệu | Nguồn dữ liệu sẵn có |
| --- | --- | --- | --- |
| `score` | `null` | Scoring module | Bảng `scores`; hiện đã có `GET /api/scoring/sessions/:sessionId/result` |
| `summary` | `null` | Scoring module | Bảng `interview_summaries` |
| `questions` | `[]` | Interview module | Bảng `questions` và `answers` |

`questions` là mảng rỗng chứ không `null`, để frontend gọi `.map` trực tiếp mà không cần kiểm tra null.

### 4.4. Lỗi

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | `:id` không phải UUID. Bị `ParseUUIDPipe` chặn trước khi chạm database |
| 401 | `UNAUTHORIZED` | Thiếu hoặc sai token |
| 404 | `NOT_FOUND` | `message`: `"Interview not found"` |
| 500 | `INTERNAL_SERVER_ERROR` | Lỗi truy vấn database. `message` là `"Failed to load the interview"` |

**Buổi phỏng vấn không tồn tại và buổi phỏng vấn của người khác đều trả `404`, không bao giờ trả `403`.** Nếu phân biệt hai trường hợp này thì kẻ tấn công dò được publicId nào có thật trong hệ thống. Đây cũng là cách module CV đang làm.

---

## 5. Quan hệ với `GET /api/interview-session`

`GET /api/interview-session` (thuộc `InterviewModule`) đã làm sẵn việc liệt kê session của người gọi có phân trang, nhưng không lọc theo thời gian và không trả điểm. Kể từ module này, endpoint đó được đánh **deprecated** trong Swagger và `GET /api/interviews` là endpoint chính thức cho màn danh sách.

Endpoint cũ vẫn hoạt động để frontend có thời gian chuyển sang endpoint mới. Khác biệt khi chuyển:

| | `GET /api/interview-session` (deprecated) | `GET /api/interviews` |
| --- | --- | --- |
| Tên field id | `sessionPublicId` | `id` |
| Số câu hỏi | `totalQuestion` | `totalQuestions` |
| `jobDescription` trong item | có | không (chỉ ở API chi tiết) |
| Điểm tổng | không có | `overallScore` |
| Mốc thời gian | chỉ `createdAt` | thêm `startedAt`, `completedAt`, `durationSeconds` |
| Lọc thời gian / trạng thái | không | `fromDate`, `toDate`, `status` |
| Chặn trên `pageSize` | không | 100 |

## 6. Giới hạn đã biết

1. **Lọc theo `createdAt`, không theo thời điểm hoàn thành.** Người dùng lọc "tháng 10" sẽ thấy buổi phỏng vấn *tạo* trong tháng 10, kể cả khi nó hoàn thành sang tháng 11.
2. **Không lọc theo khoảng điểm.** Màn danh sách hiển thị `overallScore` nhưng không cho lọc theo nó. Thêm sau sẽ cần index trên `scores.overall_score`.
3. **Phân trang bằng offset.** `skip/take` nên càng lật tới trang sâu càng chậm, và nếu có buổi phỏng vấn mới được tạo giữa hai lần gọi thì bản ghi ở ranh giới trang có thể bị lặp hoặc bị nhảy. Với số buổi phỏng vấn của một người dùng thì không đáng lo; đổi sang cursor-based là việc của sau này nếu dữ liệu lớn lên.
4. **Không tìm theo từ khóa** trên `title` hoặc `jobDescription`.
5. **`PageResult` trả cả `currentPage` lẫn `pageNumber`** với cùng giá trị. Giữ nguyên vì các endpoint khác đã phụ thuộc vào shape này.
