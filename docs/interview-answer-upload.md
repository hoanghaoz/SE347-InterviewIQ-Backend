# Upload answers and submit an interview session

Each question has one `Answer`. The browser uploads its recorded video directly to Cloudinary, then submits the asset ID and transcript to the API. Saving an answer does not enqueue scoring. After every answer has been saved, use the session submission endpoint to enqueue scoring for the whole interview.

Both endpoints require a bearer token with USER or ADMIN role. The session must belong to the authenticated user and the question must belong to that session. Missing and unauthorized questions return the same 404 response. Answers can be uploaded/saved only while the session is CREATED or IN_PROGRESS; later states return 409.

## 1. Request signed upload parameters

```http
POST /api/interview-session/:sessionPublicId/questions/:questionPublicId/answer/signed-params
Authorization: Bearer <token>
```

No request body is required. The response is HTTP 200 with the standard success envelope:

```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "uploadUrl": "https://api.cloudinary.com/v1_1/your-cloud/video/upload",
    "apiKey": "your-public-api-key",
    "timestamp": 1791799200,
    "signature": "generated-signature",
    "cloudinaryPublicId": "interview-answers/<userUUID>/<sessionUUID>/<questionUUID>/<uploadUUID>",
    "resourceType": "video",
    "allowedFormats": "mp4,webm",
    "overwrite": false,
    "maxFileSizeBytes": 104857600
  },
  "message": "Video upload params signed",
  "timestamp": "2026-10-12T10:00:00.000Z"
}
```

Each request allocates a fresh UUID asset ID scoped to this user/session/question. The API secret stays on the server. The adapter reuses CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET; CV PDF uploads retain their existing endpoint and configuration.

## 2. Upload the video from the browser

Use MP4 or WebM. Check `maxFileSizeBytes` before uploading; the backend also checks the provider's reported size when saving. Cloudinary's own account/upload limits may be lower. Send every signed field unchanged, translating camelCase response keys to Cloudinary field names:

```ts
// params = signed-params response.data; recording = the recorded File/Blob.
if (recording.size > params.maxFileSizeBytes) {
  throw new Error('Video exceeds the allowed size');
}
const form = new FormData();
form.append('file', recording, 'answer.webm'); // use answer.mp4 for MP4 recordings
form.append('api_key', params.apiKey);
form.append('timestamp', String(params.timestamp));
form.append('signature', params.signature);
form.append('public_id', params.cloudinaryPublicId);
form.append('allowed_formats', params.allowedFormats);
form.append('overwrite', String(params.overwrite));
const uploaded = await fetch(params.uploadUrl, { method: 'POST', body: form });
if (!uploaded.ok) throw new Error('Video upload failed');
const asset = await uploaded.json();
// asset.public_id identifies the upload; asset.secure_url is its delivery URL.
```

The upload URL already selects the video resource type. `resourceType` and `maxFileSizeBytes` are information for the frontend, not additional signed fields. Cloudinary handles signatures and supported formats as described in its [Upload API reference](https://cloudinary.com/documentation/image_upload_api_reference).

Overwrite is disabled. To replace a recording, request new parameters and upload a new asset. If only the API save failed, retry that PUT with the same uploaded asset ID; no second upload is needed.

## 3. Save the answer

```http
PUT /api/interview-session/:sessionPublicId/questions/:questionPublicId/answer
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "cloudinaryPublicId": "interview-answers/<userUUID>/<sessionUUID>/<questionUUID>/<uploadUUID>",
  "transcript": "The candidate's answer transcript"
}
```

`cloudinaryPublicId` is a required, nonempty string of at most 255 characters. It must match the scope of this user, session, and question and end in the upload UUID issued by signing. `transcript` is a required string of at most 50,000 characters; an empty string is allowed for a silent answer. This API stores the frontend's transcript and does not perform speech-to-text.

Do not send videoUrl or durationSeconds: the backend reads trusted metadata from Cloudinary and verifies format, size, video dimensions and duration. Fractional video durations are rounded up to whole seconds for the existing integer column.

The API upserts by the unique questionId, so retries keep one answer and the same answer publicId. The session state guard and answer upsert run in one transaction; saving starts/keeps the session IN_PROGRESS and prevents an answer write from committing after a session submission has won the state transition.

Success is HTTP 200:

```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "publicId": "<answerUUID>",
    "questionPublicId": "<questionUUID>",
    "videoUrl": "https://res.cloudinary.com/your-cloud/video/upload/v123/answer.webm",
    "transcript": "The candidate's answer transcript",
    "durationSeconds": 13,
    "createdAt": "2026-10-12T10:00:00.000Z",
    "updatedAt": "2026-10-12T10:00:00.000Z"
  },
  "message": "Interview answer saved successfully",
  "timestamp": "2026-10-12T10:00:00.000Z"
}
```

Only advance to the next question after this save succeeds. Invalid input/assets return 400; missing/unauthorized question or session returns 404; closed session returns 409; infrastructure failures return a sanitized 500 using the shared error envelope.

## 4. Submit the interview session

After all answer saves have succeeded, submit the whole session to start asynchronous scoring. This endpoint is implemented in [InterviewController](../src/modules/interview/api/interview.controller.ts).

```http
POST /api/interview-session/:sessionPublicId/submit
Authorization: Bearer <token>
Content-Type: application/json
```

The bearer token must have USER or ADMIN role. In either case, the session and CV must belong to the authenticated user; ADMIN does not bypass ownership for submission. `sessionPublicId` is the session's public UUID.

### Request body

```json
{
  "cvPublicId": "22222222-2222-4222-8222-222222222222",
  "totalQuestions": 5,
  "durationSeconds": 420
}
```

| Field             | Required | Validation and meaning                                                          |
| ----------------- | -------- | ------------------------------------------------------------------------------- |
| `cvPublicId`      | Yes      | UUID of the user's CV associated with this session. A different CV returns 404. |
| `totalQuestions`  | Yes      | Integer >= 1; total question count reported by the frontend.                    |
| `durationSeconds` | Yes      | Integer >= 0; total session duration in seconds reported by the frontend.       |

Send numbers as JSON numbers. The server currently stores these supplied metrics without deriving them from `Answer` records or checking that every question has an answer. The frontend should wait for every answer PUT to succeed before submitting.

The server authorizes the CV and session, then saves `totalQuestions`, `durationSeconds`, the authorized CV snapshot in `cvSnapshot`, and a server-generated `submittedAt`. It sets the session status to SUBMITTED before enqueueing scoring. The frontend does not supply `cvSnapshot` or `submittedAt`.

### Success response: 202 Accepted

```json
{
  "statusCode": 202,
  "success": true,
  "data": {
    "sessionPublicId": "11111111-1111-4111-8111-111111111111",
    "jobId": "33333333-3333-4333-8333-333333333333",
    "status": "QUEUED"
  },
  "message": "Interview session submitted successfully",
  "timestamp": "2026-10-12T10:00:00.000Z"
}
```

HTTP 202 means the submission has been saved and a scoring job has been enqueued; scoring may still be running. `data.status` describes the scoring job, while the saved session status is SUBMITTED. Keep `jobId` to track that job.

### Errors and retries

| HTTP status | Meaning                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 400         | Invalid path UUID or request body, including missing fields, fractional metrics, `totalQuestions < 1`, or `durationSeconds < 0`. |
| 401         | Missing or invalid bearer token.                                                                                                 |
| 403         | Authenticated role is not USER or ADMIN.                                                                                         |
| 404         | CV is unavailable, or the session does not belong to this user and CV.                                                           |
| 409         | Session is outside CREATED, IN_PROGRESS, or SUBMITTED; or an active scoring job for the session is already queued.               |
| 500         | CV/session authorization, persistence, or scoring enqueue failed. Internal failure details are sanitized.                        |

Errors use the [shared API error envelope](./api-response-convention.md).

Submission is allowed in CREATED, IN_PROGRESS, and SUBMITTED. A retry that passes authorization and the state guard updates the supplied metrics, CV snapshot, and submission timestamp again. Queue deduplication rejects duplicate active jobs with 409; this response does not include an existing `jobId`.

If enqueueing fails after the save, the session remains SUBMITTED and its answers cannot be edited. Retry this endpoint to enqueue scoring again; answer re-uploads are unnecessary. A 500 can also occur before persistence, so the frontend must not assume every failed submission was saved.

### Track scoring progress

Use the returned `jobId` with the authenticated status endpoint:

```http
GET /api/scoring/jobs/:jobId/status
Authorization: Bearer <token>
```

Its full HTTP 200 success response is:

```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "jobId": "33333333-3333-4333-8333-333333333333",
    "sessionId": "11111111-1111-4111-8111-111111111111",
    "status": "PROCESSING",
    "createdAt": "2026-10-12T10:00:00.000Z",
    "completedAt": null
  },
  "message": "Job status retrieved successfully",
  "timestamp": "2026-10-12T10:00:01.000Z"
}
```

`sessionId` is the session public UUID. Job status is QUEUED, PROCESSING, COMPLETED, or FAILED. Poll while QUEUED/PROCESSING and stop on COMPLETED/FAILED; the status response contains job metadata, not interview scores. `completedAt` is always present and is null when the queue has no completion timestamp; use `status` to determine success or failure.

USER can read only their own scoring jobs; ADMIN can read any job. Invalid `jobId` returns 400, missing/invalid authentication returns 401, unauthorized roles or another user's job return 403, a missing job returns 404, and unexpected infrastructure failures return a sanitized 500.

No schema change or migration is needed for this flow.

## Frontend contracts (copyable)

All three endpoints below require `Authorization: Bearer <token>` with USER or ADMIN role. Path parameters are UUID strings. All success `data` fields are required; only scoring `completedAt` is nullable. Date strings use ISO 8601 UTC. The signed upload `timestamp` is a Unix timestamp in seconds, while the envelope `timestamp` is a date string.

```ts
export type ApiSuccessResponse<T, S extends number = number> = {
  statusCode: S;
  success: true;
  data: T;
  message: string;
  timestamp: string; // ISO 8601 UTC
};

export type ApiErrorResponse = {
  statusCode: number;
  success: false;
  code: string;
  message: string;
  errors?: Array<{ field: string; messages: string[] }>;
  path: string;
  timestamp: string; // ISO 8601 UTC
};

// POST /api/interview-session/:sessionPublicId/questions/:questionPublicId/answer/signed-params
// Request body: none. Success: HTTP 200.
export type InterviewVideoSignedParams = {
  uploadUrl: string; // POST multipart/form-data to this Cloudinary URL
  apiKey: string; // Public key; this is not the API secret
  timestamp: number; // Unix seconds; forward unchanged
  signature: string;
  cloudinaryPublicId: string; // Full scoped asset ID, not just the upload UUID
  resourceType: 'video';
  allowedFormats: string; // Currently "mp4,webm"; forward unchanged
  overwrite: false;
  maxFileSizeBytes: number; // Currently 104857600 (100 MiB)
};
export type SignedParamsResponse = ApiSuccessResponse<
  InterviewVideoSignedParams,
  200
>;

// PUT /api/interview-session/:sessionPublicId/questions/:questionPublicId/answer
// Request Content-Type: application/json. Success: HTTP 200.
export type SaveInterviewAnswerRequest = {
  cloudinaryPublicId: string; // Required, nonempty, <=255 chars; uploaded asset.public_id
  transcript: string; // Required, <=50000 chars; empty string allowed
};
export type InterviewAnswer = {
  publicId: string; // Answer public UUID; unchanged by retry/upsert
  questionPublicId: string; // Question public UUID from the URL
  videoUrl: string; // HTTPS delivery URL verified by the backend
  transcript: string;
  durationSeconds: number; // Positive integer; ceil(provider video duration)
  createdAt: string; // ISO 8601 UTC; original creation time
  updatedAt: string; // ISO 8601 UTC; latest save time
};
export type SaveAnswerResponse = ApiSuccessResponse<InterviewAnswer, 200>;

// GET /api/scoring/jobs/:jobId/status
// Request body: none. jobId comes from the submit response. Success: HTTP 200.
export type ScoringJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type ScoringJob = {
  jobId: string; // Scoring job UUID
  sessionId: string; // Session public UUID (field is named sessionId here)
  status: ScoringJobStatus;
  createdAt: string; // ISO 8601 UTC
  completedAt: string | null; // ISO 8601 UTC when available; never omitted
};
export type ScoringStatusResponse = ApiSuccessResponse<ScoringJob, 200>;
```

Cloudinary multipart field mapping (do not send the entire signed-params JSON as the upload body):

| FormData field    | Value from frontend/backend                   |
| ----------------- | --------------------------------------------- |
| `file`            | Recorded File/Blob, with an MP4/WebM filename |
| `api_key`         | `params.apiKey`                               |
| `timestamp`       | `String(params.timestamp)`                    |
| `signature`       | `params.signature`                            |
| `public_id`       | `params.cloudinaryPublicId`                   |
| `allowed_formats` | `params.allowedFormats`                       |
| `overwrite`       | `String(params.overwrite)` ("false")          |

`resourceType` is already reflected in `uploadUrl`; `maxFileSizeBytes` is for pre-upload size validation. Neither is an extra FormData field. On upload success, use Cloudinary's `public_id` as the save request's `cloudinaryPublicId`; the backend obtains `videoUrl` and `durationSeconds` itself.

Success messages are `Video upload params signed`, `Interview answer saved successfully`, and `Job status retrieved successfully`, respectively. Signed params and answer save can return 400/401/403/404/409/500. Scoring status can return 400/401/403/404/500. Handle errors with `ApiErrorResponse`; validation details are in the optional `errors` array.

Keep the submit response's `jobId` and poll scoring status while QUEUED/PROCESSING. COMPLETED and FAILED end polling. Answer saving does not start scoring; submit the session after all answer PUTs succeed. A scoring job response does not contain scores or summaries.
