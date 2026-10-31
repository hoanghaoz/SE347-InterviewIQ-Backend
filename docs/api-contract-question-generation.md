# API contract: interview question generation

Generates the question set for an interview session from the CV the session was created with and the optional job description. Both endpoints require a bearer token with USER or ADMIN role, and the session must belong to the authenticated user. A missing session and another user's session return the same 404.

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

{ "count": 5 }
```

`count` is optional: integer from 3 to 10, default 5. The body may be omitted.

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
| 400 | `BAD_REQUEST` | `Request validation failed` | `count` is not an integer from 3 to 10. Details in `errors` as `{ field, messages }`. |
| 401 / 403 | `UNAUTHORIZED` / `FORBIDDEN` | | Missing token or role. |
| 404 | `NOT_FOUND` | `Interview session not found or unavailable` | Unknown session or not owned by the user. |
| 409 | `CONFLICT` | `Questions can only be generated while the session is CREATED` | Session already started, submitted or finished. |
| 409 | `CONFLICT` | `CV has not been parsed yet` | The session has no CV, or the CV has no parsed data. Parse the CV first. |
| 500 | `INTERNAL_SERVER_ERROR` | `Failed to generate interview questions` | The AI returned invalid output twice, timed out, or failed. Safe to retry. |

## 2. Get questions

```http
GET /api/interview-session/:sessionPublicId/questions
Authorization: Bearer <token>
```

Response, HTTP 200, same `data` shape as above, with `questions` ordered by `orderIndex`. A session that has not generated questions yet returns an empty list.

Message: `Interview questions retrieved successfully`. Errors: 401, 403, 404 as above.
