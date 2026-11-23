# API contract: question bank

A per-user bank of interview questions that can be reused across sessions (CR-006). Unlike the questions of a session (see `api-contract-question-generation.md`), bank items are independent of any session: deleting a session does not remove them.

Every endpoint requires a bearer token with USER or ADMIN role and only ever touches the authenticated user's items. No route accepts a user id from the client.

This document covers listing, saving and deleting bank items, and using them as the questions of a session. Choosing a domain and difficulty when generating, and regenerating a single question, are in `api-contract-question-generation.md`.

## Bank item object

```json
{
  "id": "3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11",
  "content": "Explain the difference between a process and a thread.",
  "domain": "TECHNICAL",
  "difficulty": "MEDIUM",
  "createdAt": "2026-11-22T07:58:11.000Z"
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Public id of the item. The internal id and the content hash are never returned. |
| `content` | string | 1 to 500 characters. |
| `domain` | `TECHNICAL` \| `BEHAVIORAL` \| `SITUATIONAL` | |
| `difficulty` | `EASY` \| `MEDIUM` \| `HARD` | |
| `createdAt` | ISO 8601 UTC | When the item was saved. |

## 1. List the question bank

```http
GET /api/question-bank?pageNumber=1&pageSize=20&domain=TECHNICAL&difficulty=MEDIUM&search=thread
Authorization: Bearer <token>
```

Newest first. All query parameters are optional.

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `pageNumber` | integer | `1` | At least 1. |
| `pageSize` | integer | `20` | 1 to 100. |
| `domain` | `TECHNICAL` \| `BEHAVIORAL` \| `SITUATIONAL` | none | Only items of this domain. |
| `difficulty` | `EASY` \| `MEDIUM` \| `HARD` | none | Only items of this difficulty. |
| `search` | string | none | At most 100 characters. Trimmed, case-insensitive match inside `content`. A blank value means no search. |

Filters combine with AND. Success is HTTP 200:

```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "items": [
      {
        "id": "3f1c2b9e-8a4d-4f6b-9c1e-2d7a5b0e4f11",
        "content": "Explain the difference between a process and a thread.",
        "domain": "TECHNICAL",
        "difficulty": "MEDIUM",
        "createdAt": "2026-11-22T07:58:11.000Z"
      }
    ],
    "totalPages": 1,
    "currentPage": 1,
    "pageNumber": 1,
    "pageSize": 20,
    "hasPrevious": false,
    "hasNext": false
  },
  "message": "Question bank retrieved successfully",
  "timestamp": "2026-11-22T08:00:00.000Z"
}
```

An empty bank or a filter with no match returns `items: []` and `totalPages: 0`, not an error.

Errors use the shared envelope:

| Status | When |
|---|---|
| 400 | A query parameter is invalid (unknown `domain` or `difficulty`, `pageSize` above 100, non-integer page values, `search` longer than 100 characters). The `errors` array names each field. |
| 401 | Missing or invalid token. |
| 403 | Role is not USER or ADMIN. |
| 500 | Infrastructure failure, with a sanitized message. |

```ts
export type QuestionBankItem = {
  id: string
  content: string // 1..500 chars
  domain: 'TECHNICAL' | 'BEHAVIORAL' | 'SITUATIONAL'
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  createdAt: string // ISO 8601 UTC
}
export type QuestionBankPage = {
  items: QuestionBankItem[]
  totalPages: number
  currentPage: number
  pageNumber: number
  pageSize: number
  hasPrevious: boolean
  hasNext: boolean
}
// GET /api/question-bank -> ApiSuccessResponse<QuestionBankPage, 200>
```

`search` is matched literally: `%` and `_` are ordinary characters, not wildcards.

## 2. Save questions of a session to the bank

```http
POST /api/question-bank
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "sessionPublicId": "<sessionUUID>",
  "questionPublicIds": ["<questionUUID>", "<questionUUID>"]
}
```

| Field | Type | Notes |
|---|---|---|
| `sessionPublicId` | UUID, required | A session of the authenticated user. |
| `questionPublicIds` | UUID[], optional | 1 to 10 ids of questions of that session. Omit to save every question of the session. |

Nothing is saved automatically: a question enters the bank only through this call.

- **Duplicates are skipped.** Two questions are the same when their text matches after ignoring case, extra whitespace and unicode-equivalent forms. Vietnamese diacritics are kept, so "ý tưởng" and "y tuong" are different questions. A text repeated inside one request is stored once.
- **Limit.** A user can keep at most **200** questions. If saving the new ones would exceed it, nothing is saved and the call returns 409.
- **All or nothing.** A `questionPublicIds` entry that is not a question of the session returns 404 and nothing is saved.

Success is HTTP 201:

```json
{
  "statusCode": 201,
  "success": true,
  "data": { "savedCount": 3, "skippedCount": 1 },
  "message": "Questions saved to the question bank",
  "timestamp": "2026-11-22T08:00:00.000Z"
}
```

`savedCount` is the number of questions newly added; `skippedCount` is the number already in the bank (or repeated in the request).

| Status | When |
|---|---|
| 400 | Invalid body (`sessionPublicId` missing or not a UUID, `questionPublicIds` empty, longer than 10 or containing a non-UUID), or the session has no questions. |
| 401 / 403 | Missing or invalid token / role is not USER or ADMIN. |
| 404 | The session is missing or belongs to another user (same response for both), or a selected question is not part of the session. |
| 409 | The bank would exceed 200 questions. |
| 500 | Infrastructure failure, with a sanitized message. |

## 3. Remove a question from the bank

```http
DELETE /api/question-bank/:itemPublicId
Authorization: Bearer <token>
```

Success is HTTP 200 with `data: null` and the message `Question removed from the question bank`. The call is idempotent, like deleting a CV: an item that does not exist, was already removed, or belongs to another user also returns 200 and changes nothing. A non-UUID id returns 400.

```ts
export type SaveToQuestionBankRequest = {
  sessionPublicId: string
  questionPublicIds?: string[] // 1..10 UUIDs of that session; omit for all
}
export type SaveToQuestionBankResult = { savedCount: number; skippedCount: number }
// POST   /api/question-bank       -> ApiSuccessResponse<SaveToQuestionBankResult, 201>
// DELETE /api/question-bank/:id   -> ApiSuccessResponse<null, 200>
```

## 4. Use bank questions as the questions of a session

```http
POST /api/interview-session/:sessionPublicId/questions/from-bank
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{ "itemPublicIds": ["<itemUUID>", "<itemUUID>", "<itemUUID>"] }
```

Replaces the **whole** question set of the session with the chosen bank items, in the given order: the first id becomes question 1. `content`, `domain` and `difficulty` are copied; the items stay in the bank. The session's `totalQuestions` follows the new set.

| Field | Type | Notes |
|---|---|---|
| `itemPublicIds` | UUID[], required | 3 to 10 ids, no repeats. Every id must be an item of the authenticated user. |

The order is the caller's choice and is **not** re-sorted by difficulty (generation orders from easy to hard; this call does not).

Success is HTTP 200 with the same `data` shape as generate in `api-contract-question-generation.md` (`sessionPublicId` and `questions`, each with a new `publicId`), message `Interview questions set from the question bank`. No CV is needed.

| Status | When |
|---|---|
| 400 | `itemPublicIds` is missing, has fewer than 3 or more than 10 entries, repeats an id or contains a non-UUID; or the session id is not a UUID. |
| 401 / 403 | Missing or invalid token / role is not USER or ADMIN. |
| 404 | The session is missing or belongs to another user (same response for both), or an item is not in the caller's bank (`Question bank item not found`). Nothing is changed. |
| 409 | The session has left CREATED (started, submitted or finished). |
| 500 | Infrastructure failure, with a sanitized message. |

```ts
export type UseBankQuestionsRequest = { itemPublicIds: string[] } // 3..10 distinct UUIDs
// POST /api/interview-session/:id/questions/from-bank -> ApiSuccessResponse<SessionQuestions, 200>
```
