# API contract: CV (Luồng 1)

All routes live under `/api/cvs`, need `Authorization: Bearer <accessToken>` (roles `USER` or `ADMIN`) and answer with the envelope described in `api-response-convention.md`. A CV that belongs to someone else is reported as `404`, never `403`.

## Upload flow (3 steps)

The file never passes through the backend. The browser uploads it straight to Cloudinary.

1. `POST /api/cvs/signed-params`: the backend signs one upload.
2. Browser `POST`s the file to `uploadUrl` (Cloudinary) with the signed fields.
3. `POST /api/cvs`: the backend reads the real size and format from Cloudinary and saves the CV as `PENDING`.

Then `POST /api/cvs/:id/parse` fills `parsedData`.

## Endpoints

| Method | Path | Purpose | Success |
|---|---|---|---|
| POST | `/api/cvs/signed-params` | Signed upload params for one PDF | 200 |
| POST | `/api/cvs` | Save the uploaded file as a CV (`PENDING`) | 201 |
| GET | `/api/cvs` | The user's CVs, newest first | 200 |
| GET | `/api/cvs/:id` | One CV with `fileUrl` and `parsedData` | 200 |
| POST | `/api/cvs/:id/parse` | Read the PDF and fill `parsedData` | 200 |
| PATCH | `/api/cvs/:id/parsed-data` | Replace `parsedData` by hand | 200 |

`:id` is the CV `publicId` (UUID). A malformed id is rejected with `400`.

### POST /api/cvs/signed-params

Response `data`:

| Field | Send to Cloudinary as | Note |
|---|---|---|
| `uploadUrl` | the URL to POST to | |
| `apiKey` | `api_key` | |
| `timestamp` | `timestamp` | Unix seconds; the signature expires after 1 hour |
| `signature` | `signature` | |
| `cloudinaryPublicId` | `public_id` | `cvs/<userPublicId>/<uuid>`; also sent back in step 3 |
| `assetFolder` | `asset_folder` | `InterviewIQ/cvs/<userPublicId>`; display only |
| `allowedFormats` | `allowed_formats` | `pdf` |

Every field above is part of the signature. Sending one that was not signed, or changing one, makes Cloudinary answer `Invalid Signature`.

### POST /api/cvs

Body: `{ "fileName": string (max 255), "cloudinaryPublicId": string }`.

| Status | When |
|---|---|
| 201 | Saved, `parseStatus: "PENDING"` |
| 400 | `cloudinaryPublicId` is not under the caller's prefix, the file does not exist, or it is not a PDF or is over 5 MB |
| 409 | The same Cloudinary file was already saved |

### POST /api/cvs/:id/parse

Runs synchronously and can take tens of seconds (set the client timeout to about 90 s). Steps: claim the CV (`PROCESSING`), download the PDF, extract the text, ask the LLM for JSON, validate it, save.

| Status | When |
|---|---|
| 200 | The CV is now `COMPLETED` with `parsedData`, **or `FAILED`** with `parsedData: null` |
| 404 | The CV does not exist or is not the caller's |
| 409 | The CV is `COMPLETED`, or another request is already parsing it |

Reasons that end in `FAILED` (the response does not say which; it is in the server log): the file is missing from Cloudinary, the PDF is unreadable or has more than 20 pages, the PDF has under 50 characters of text (a scanned image), or the LLM failed or answered with nothing usable.

Only `PENDING` and `FAILED` CVs can be parsed, so a retry after `FAILED` is allowed and a manual edit is never overwritten. A CV stuck in `PROCESSING` for more than 3 minutes (the server died) can be parsed again.

### PATCH /api/cvs/:id/parsed-data

Body: the whole `CvParsedData` object (it replaces the stored one).

| Status | When |
|---|---|
| 200 | Saved; returns the CV |
| 400 | Validation failed; `errors[].field` is the exact path, for example `experiences[0].startDate` |
| 404 | The CV does not exist or is not the caller's |
| 409 | The CV is not `COMPLETED` |

## parsedData (`CvParsedData`)

Lists are `[]`, never `null`. Single values may be `null`. Other tracks read this shape (scoring, interview `cv_snapshot`), so a change must be announced.

```json
{
  "summary": "string | null (max 2000)",
  "skills": { "languages": [], "frameworks": [], "databases": [], "tools": [] },
  "experiences": [
    {
      "company": "string (required, max 150)",
      "position": "string (required, max 150)",
      "startDate": "YYYY-MM | null",
      "endDate": "YYYY-MM | null  (null = still working there)",
      "description": "string | null (max 1000)",
      "technologies": []
    }
  ],
  "education": [
    { "institution": "string (required)", "degree": "string | null", "graduationYear": "integer 1950-2100 | null" }
  ],
  "projects": [
    { "name": "string (required)", "description": "string | null", "role": "string | null (max 100)" }
  ]
}
```

Limits: 50 items per skill list (60 characters each), 20 experiences, 10 education items, 20 projects, 20 technologies per experience.

`parsedData` written by the LLM goes through the same cleaning as a manual edit: strings are trimmed, duplicates in lists are removed (ignoring case), items missing a required field are dropped, and dates or years that do not fit the format become `null`.

## parseStatus

`PENDING` (saved, never parsed) → `PROCESSING` → `COMPLETED` or `FAILED`. `FAILED` → `PROCESSING` again on a retry.
