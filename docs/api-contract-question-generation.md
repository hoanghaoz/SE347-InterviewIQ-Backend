# API contract: interview question generation

Generates the question set for an interview session from the CV the session was created with and the optional job description. All endpoints require a bearer token with USER or ADMIN role, and the session must belong to the authenticated user. A missing session and another user's session return the same 404.

Related: sessions are created by `POST /api/interview-session`; answers are uploaded per question (see `interview-answer-upload.md`).

## Question object

```json
{
  "publicId": "0d3c8c9e-3f4b-4a53-9a43-5b1d6f0c7a11",
  "orderIndex": 1,
  "content": "Explain how you handled concurrent writes in the order service at ABC Corp.",
  "domain": "TECHNICAL",
  "difficulty": "EASY"
}
```

| Field | Type | Notes |
|---|---|---|
| `publicId` | UUID | Use it for the answer endpoints. |
| `orderIndex` | integer | Starts at 1, contiguous. |
| `content` | string | 1 to 500 characters. |
| `domain` | `TECHNICAL` \| `BEHAVIORAL` \| `SITUATIONAL` | |
| `difficulty` | `EASY` \| `MEDIUM` \| `HARD` | Questions are ordered from easier to harder. |

## 1. Generate (or regenerate) questions

```http
POST /api/interview-session/:sessionPublicId/questions/generate
Authorization: Bearer <token>
Content-Type: application/json

{ "count": 5, "domain": "TECHNICAL", "difficulty": "MEDIUM" }
```

All fields are optional and the body may be omitted.

| Field | Type | Notes |
|---|---|---|
| `count` | integer 3 to 10 | Default 5. |
| `domain` | `TECHNICAL` \| `BEHAVIORAL` \| `SITUATIONAL` | When set, every question has this domain. When omitted the domains are mixed. |
| `difficulty` | `EASY` \| `MEDIUM` \| `HARD` | When set, every question has this difficulty. When omitted the questions go from easy to hard. |

The model output is checked against `domain` and `difficulty`; an answer that breaks them is retried once, then the call fails with 500.

The call is synchronous and may take up to the generation timeout (`QUESTION_GENERATION_TIMEOUT_MS`, default 45 seconds). Calling it again replaces the whole previous question set of the session.

Response, HTTP 200:

```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "sessionPublicId": "7a1e1f0a-8a52-4b3c-9d67-2f4d0f6b9c10",
    "questions": [ { "...": "see Question object" } ]
  },
  "message": "Interview questions generated successfully",
  "timestamp": "2026-10-31T10:00:00.000Z"
}
```

Errors use the standard error envelope.

| Status | `code` | `message` | When |
|---|---|---|---|
| 400 | `BAD_REQUEST` | `Request validation failed` | `count` is not an integer from 3 to 10, or `domain` / `difficulty` is not one of the listed values. Details in `errors` as `{ field, messages }`. |
| 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | | Missing token or role. |
| 404 | `NOT_FOUND` | `Interview session not found or unavailable` | Unknown session or not owned by the user. |
| 409 | `CONFLICT` | `Questions can only be generated while the session is CREATED` | Session already started, submitted or finished. |
| 409 | `CONFLICT` | `CV has not been parsed yet` | The session has no CV, or the CV has no parsed data. Parse the CV first. |
| 500 | `INTERNAL_SERVER_ERROR` | `Failed to generate interview questions` | The AI returned invalid output twice, timed out, or failed. Safe to retry. |

## 2. Regenerate a single question

```http
POST /api/interview-session/:sessionPublicId/questions/:questionPublicId/regenerate
Authorization: Bearer <token>
Content-Type: application/json

{ "domain": "BEHAVIORAL", "difficulty": "HARD" }
```

Rewrites one question of the set in place: its `publicId` and `orderIndex` do not change, only `content`, `domain` and `difficulty`. Both fields are optional and the body may be omitted; what is left out keeps the value of the question being replaced, so the shape of the set is preserved.

The new question is written from the same CV and job description, and the model is told not to repeat any question currently in the set (the replaced one included); a repeat, ignoring case and spacing, is rejected and retried once. The call is synchronous like generate, with the same timeout.

Response, HTTP 200, the **whole** updated set in the same `data` shape as generate (so a client can replace its list), message `Interview question regenerated successfully`.

| Status | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | A path id is not a UUID, or `domain` / `difficulty` is not one of the listed values. |
| 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | Missing token or role. |
| 404 | `NOT_FOUND` | Unknown session or not owned by the user; or the question is not part of this session (`Interview question not found or unavailable`). |
| 409 | `CONFLICT` | The session has left CREATED, or the CV has not been parsed yet. |
| 500 | `INTERNAL_SERVER_ERROR` | The AI returned invalid output twice, timed out, or failed. The old question is kept. Safe to retry. |

## 3. Get questions

```http
GET /api/interview-session/:sessionPublicId/questions
Authorization: Bearer <token>
```

Response, HTTP 200, same `data` shape as above, with `questions` ordered by `orderIndex`. A session that has not generated questions yet returns an empty list.

Message: `Interview questions retrieved successfully`. Errors: 401, 403, 404 as above.
