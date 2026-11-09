# API Contract: Cheat Log (Phát hiện gian lận)

Hợp đồng giao tiếp cho tính năng **ghi nhận và cảnh báo hành vi gian lận** trong buổi phỏng vấn của MockMate AI. Tính năng chỉ **phát hiện, ghi nhận và cảnh báo**: không hủy phòng, không đổi trạng thái buổi phỏng vấn và **không ảnh hưởng điểm hay bản nhận xét** của Scoring.

Mã nguồn: `src/modules/interview/` (controller `interview-cheat-log.controller.ts`). Branch: `feat/detect-cheat`.

---

## 1. Phạm vi

| Thuộc tính năng này | Không thuộc tính năng này |
| --- | --- |
| `POST /api/interview-session/:sessionPublicId/cheat-logs` — ghi một sự kiện | Phát hiện sự kiện (do **frontend** làm: sự kiện trình duyệt, nhận diện khuôn mặt) |
| `GET /api/interview-session/:sessionPublicId/cheat-logs` — lấy lại log và bộ đếm | Hủy phòng, khóa phiên, trừ điểm |
| Cờ `isFlagged` và nhật ký trong lịch sử (xem `api-contract-interview-history.md`) | Admin xem log của người khác |

Bảng dùng: `cheat_logs` (đã có sẵn, **không có migration**). Enum `CheatEventType` giữ nguyên 4 giá trị.

## 2. Luồng

1. Frontend phát hiện một sự kiện và gọi `POST` ngay, **mỗi sự kiện một request**.
2. Backend kiểm tra, lưu và trả về log vừa tạo cùng **tổng số vi phạm của buổi** (kèm số lần theo từng loại).
3. Frontend dùng `summary` để hiện cảnh báo cho ứng viên (ví dụ "đây là lần vi phạm thứ 3").
4. Nếu ứng viên tải lại trang giữa chừng, frontend gọi `GET` để lấy lại bộ đếm.
5. Sau buổi phỏng vấn, ứng viên thấy cờ và nhật ký ở lịch sử của mình.

**Debounce và gộp sự kiện là việc của frontend.** Backend lưu đúng những gì nhận được và không chống trùng. Ví dụ `TAB_SWITCH` và `WINDOW_BLUR` thường bắn cùng lúc khi đổi tab; `FACE_MISSING` có thể bắn liên tục. Nếu frontend gửi cả hai/gửi mỗi giây, bộ đếm sẽ tăng đúng bấy nhiêu.

## 3. Quy ước chung

Áp dụng nguyên `docs/api-response-convention.md`:

1. Mọi endpoint dùng tiền tố `/api/`, bắt buộc `Authorization: Bearer <access_token>`, guard `@Auth([ADMIN, USER])` đặt trên từng method.
2. Người gọi luôn lấy từ `sub` của token. Chỉ **chủ buổi phỏng vấn** mới ghi và xem được log.
3. Thành công bọc trong `ApiSuccessResponse<T>`; lỗi đi qua `AllExceptionsFilter`.
4. Mọi `id` là `publicId` (UUID). Mọi mốc thời gian là chuỗi ISO 8601 UTC.

### Loại sự kiện (`eventType`)

| Giá trị | Ý nghĩa |
| --- | --- |
| `TAB_SWITCH` | Chuyển sang tab trình duyệt khác |
| `WINDOW_BLUR` | Rời khỏi cửa sổ |
| `FACE_MISSING` | Mất khuôn mặt trước camera |
| `MULTIPLE_FACES` | Có nhiều người trước camera |

---

## 4. `POST /api/interview-session/:sessionPublicId/cheat-logs`

### 4.1. Request

| Path param | Kiểu | Ràng buộc |
| --- | --- | --- |
| `sessionPublicId` | string (uuid) | Validate bằng `ParseUUIDPipe` |

| Body | Kiểu | Bắt buộc | Ràng buộc |
| --- | --- | --- | --- |
| `eventType` | enum | có | Một trong 4 giá trị ở mục 3 |
| `occurredAt` | ISO 8601 date-time | có | Giờ **phía client** lúc phát hiện. Luật khoảng thời gian ở mục 4.3 |
| `description` | string | không | Tối đa 500 ký tự |

```json
{
  "eventType": "TAB_SWITCH",
  "occurredAt": "2026-11-09T10:05:00.000Z",
  "description": "Switched to another browser tab"
}
```

### 4.2. Response `201 Created`

```jsonc
{
  "statusCode": 201,
  "success": true,
  "message": "Cheat event recorded",
  "data": {
    "log": {
      "id": "3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11",
      "eventType": "TAB_SWITCH",
      "description": "Switched to another browser tab",
      "occurredAt": "2026-11-09T10:05:00.000Z",
      "createdAt": "2026-11-09T10:05:01.000Z"
    },
    "summary": {
      "totalCount": 3,
      "countsByType": {
        "TAB_SWITCH": 2,
        "WINDOW_BLUR": 1,
        "FACE_MISSING": 0,
        "MULTIPLE_FACES": 0
      }
    }
  }
}
```

`countsByType` **luôn có đủ 4 key**, loại chưa xảy ra có giá trị `0`, để frontend không phải kiểm tra thiếu key. `totalCount` là tổng của chúng và đã gồm log vừa tạo. `description` là `null` khi không gửi.

### 4.3. Luật nhận log

Kiểm tra theo thứ tự:

| # | Điều kiện | Kết quả |
| --- | --- | --- |
| 1 | Buổi không tồn tại hoặc của người khác | `404` |
| 2 | Trạng thái `CREATED` hoặc `CANCELLED` | `409` — `Interview session is not in progress` |
| 3 | `IN_PROGRESS` và `occurredAt` ngoài `[startedAt − 30s, now + 30s]` | `400` — `occurredAt is outside the interview session time range` |
| 4 | Đã nộp (`SUBMITTED`, `SCORING`, `COMPLETED`, `FAILED`) và `now > submittedAt + 5 phút` | `409` — `Cheat log window has closed` |
| 5 | Đã nộp và `occurredAt` ngoài `[startedAt − 30s, submittedAt + 30s]` | `400` — `occurredAt is outside the interview session time range` |
| 6 | Còn lại | Ghi log, `201` |

- **Log đến trễ:** sự kiện xảy ra trước lúc nộp nhưng request tới sau vẫn được nhận **trong vòng 5 phút sau `submittedAt`**.
- **Độ lệch đồng hồ 30 giây:** `occurredAt` là giờ client còn `startedAt`/`submittedAt` là giờ server, nên hai đầu khoảng được nới 30 giây. Cả hai là hằng số trong `domain/constants/cheat-log.constants.ts`.
- Ghi log **không bao giờ** đổi `status` của buổi phỏng vấn.

### 4.4. Lỗi

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | Body sai (`eventType` ngoài enum, `occurredAt` không phải ISO, `description` > 500 ký tự), kèm `errors: [{ field, messages }]` |
| 400 | `BAD_REQUEST` | `sessionPublicId` không phải UUID; hoặc `occurredAt` ngoài khoảng cho phép (mục 4.3) |
| 401 | `UNAUTHORIZED` | Thiếu hoặc sai token |
| 404 | `NOT_FOUND` | `Interview session not found` |
| 409 | `CONFLICT` | Buổi chưa bắt đầu / đã hủy, hoặc đã quá cửa sổ 5 phút |
| 500 | `INTERNAL_SERVER_ERROR` | Lỗi database. `message` là `Failed to process the cheat log`, không lộ message gốc |

**Buổi không tồn tại và buổi của người khác đều trả `404`, không bao giờ `403`**, để không lộ `publicId` nào có thật.

---

## 5. `GET /api/interview-session/:sessionPublicId/cheat-logs`

Lấy lại toàn bộ log và bộ đếm, dùng khi ứng viên tải lại trang. Gọi được ở **mọi trạng thái** của buổi, chỉ chủ buổi mới xem được.

### 5.1. Response `200 OK`

```jsonc
{
  "statusCode": 200,
  "success": true,
  "message": "Cheat logs retrieved successfully",
  "data": {
    "logs": [
      {
        "id": "3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11",
        "eventType": "TAB_SWITCH",
        "description": null,
        "occurredAt": "2026-11-09T10:05:00.000Z",
        "createdAt": "2026-11-09T10:05:01.000Z"
      }
    ],
    "summary": {
      "totalCount": 1,
      "countsByType": { "TAB_SWITCH": 1, "WINDOW_BLUR": 0, "FACE_MISSING": 0, "MULTIPLE_FACES": 0 }
    }
  }
}
```

`logs` sắp theo `occurredAt` tăng dần rồi theo `id`; buổi không có vi phạm trả `logs: []`, không phải `404`.

### 5.2. Lỗi

| HTTP | `code` | Khi nào |
| --- | --- | --- |
| 400 | `BAD_REQUEST` | `sessionPublicId` không phải UUID |
| 401 | `UNAUTHORIZED` | Thiếu hoặc sai token |
| 404 | `NOT_FOUND` | `Interview session not found` (không tồn tại hoặc của người khác) |
| 500 | `INTERNAL_SERVER_ERROR` | `Failed to process the cheat log` |

---

## 6. Đánh dấu trong lịch sử

Buổi có **ít nhất 1 cheat log** thì `isFlagged = true`. Cờ được **tính lúc đọc** từ số log, không có cột mới. Chi tiết field xem `docs/api-contract-interview-history.md`:

- `GET /api/interviews`: mỗi item thêm `isFlagged` và `cheatEventCount`.
- `GET /api/interviews/:id`: thêm `isFlagged`, `cheatSummary` (cùng shape `summary` ở trên) và `cheatLogs` (cùng shape `logs[]`, luôn là mảng).

## 7. Giới hạn đã biết

1. **Không chống trùng ở backend** (xem mục 2). Frontend chịu trách nhiệm debounce.
2. **Không có ngưỡng nghi vấn.** Một log duy nhất cũng đánh dấu buổi; chưa phân mức độ.
3. **Chỉ ứng viên xem log của mình.** Chưa có API cho admin xem log của người khác.
4. **`occurredAt` là giờ client** nên có thể bị giả mạo trong phạm vi khoảng thời gian cho phép; đây là bản ghi để tham khảo, không phải bằng chứng.
5. **Không giới hạn tần suất.** Chưa có throttling; nếu frontend gửi dồn dập, mỗi request vẫn được ghi.
