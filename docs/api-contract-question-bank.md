# API contract: question bank

A per-user bank of interview questions that can be reused across sessions (CR-006). Unlike the questions of a session (see `api-contract-question-generation.md`), bank items are independent of any session: deleting a session does not remove them.

Every endpoint requires a bearer token with USER or ADMIN role and only ever touches the authenticated user's items. No route accepts a user id from the client.

This document covers the endpoints that exist so far. Saving, deleting, reusing bank items and regenerating a single question are planned in follow-up changes.

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
