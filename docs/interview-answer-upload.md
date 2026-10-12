# Upload and save an interview answer

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

`cloudinaryPublicId` must match the scope of this user, session, and question and end in the upload UUID issued by signing. `transcript` is a required string of at most 50,000 characters; an empty string is allowed for a silent answer. This API stores the frontend's transcript and does not perform speech-to-text.

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

When all answers have been saved, call the existing `POST /api/interview-session/:sessionPublicId/submit`. Its HTTP 202 response includes sessionPublicId, jobId and status QUEUED. The frontend can poll `GET /api/scoring/jobs/:jobId/status`.

No schema change or migration is needed for this flow.
