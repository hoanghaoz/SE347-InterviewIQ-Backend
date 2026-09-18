# API Response Convention

This document defines the response contract for public REST endpoints. Keep the contract stable so clients can handle every module consistently.

## Success Responses

Controllers must return `ApiSuccessResponse<T>` from `src/shared/response/apiResponse.ts`. Do not construct equivalent object literals.

```ts
return new ApiSuccessResponse(
  HttpStatus.OK,
  interviewRoomDto,
  'Interview room retrieved successfully',
);
```

```json
{
  "statusCode": 200,
  "success": true,
  "data": {
    "publicId": "room_123"
  },
  "message": "Interview room retrieved successfully",
  "timestamp": "2026-09-16T08:00:00.000Z"
}
```

The body `statusCode` must match the actual HTTP status. Use short, user-safe messages. For list endpoints, place the list and pagination metadata inside `data`. A true `204 No Content` response must not contain an envelope.

## Error Flow

Application and domain code return `Result<T, AppError>` for expected failures. They must not import Nest exceptions or response classes. Controllers map `AppError` with `toHttpException`; `AllExceptionsFilter` creates the final `ApiErrorResponse`.

```ts
const result = await this.interviewRoomService.getByPublicIdAsync(publicId);

return result.match(
  (room) =>
    new ApiSuccessResponse(
      HttpStatus.OK,
      room,
      'Interview room retrieved successfully',
    ),
  (error) => {
    throw toHttpException(error);
  },
);
```

Do not instantiate `ApiErrorResponse` in controllers and do not handcraft error JSON.

```json
{
  "statusCode": 404,
  "success": false,
  "code": "NOT_FOUND",
  "message": "Interview room not found",
  "path": "/interview-room/room_123",
  "timestamp": "2026-09-16T08:00:00.000Z"
}
```

`toHttpException` maps the project error codes as follows:

| Error code              | HTTP status |
| ----------------------- | ----------: |
| `BAD_REQUEST`           |         400 |
| `UNAUTHORIZED`          |         401 |
| `FORBIDDEN`             |         403 |
| `NOT_FOUND`             |         404 |
| `CONFLICT`              |         409 |
| `TOO_MANY_REQUESTS`     |         429 |
| `INTERNAL_SERVER_ERROR` |         500 |

When adding an `ErrorCode`, update the exhaustive mapping in `app-error.mapper.ts` and add a mapper test.

## Validation Errors

The global `ValidationPipe` converts `class-validator` failures into field details. Nested objects use dot paths and arrays use bracket indexes.

```json
{
  "statusCode": 400,
  "success": false,
  "code": "BAD_REQUEST",
  "message": "Request validation failed",
  "errors": [
    {
      "field": "questions[0].content",
      "messages": ["Question content is required"]
    }
  ],
  "path": "/interview-room",
  "timestamp": "2026-09-16T08:00:00.000Z"
}
```

The `errors` property is omitted for non-validation failures. Never include rejected values because they may contain passwords, tokens, or personal data.

## Safety and Verification

- Never expose database messages, stack traces, credentials, or unexpected exception messages.
- Unknown exceptions must return the generic `INTERNAL_SERVER_ERROR` response while the server logs the real failure.
- Use `request.path` for errors so query parameters are not echoed to clients.
- Add unit tests when changing response classes, error mappings, validation flattening, or exception filtering.
- Run `npm run lint`, `npm test`, `npm run test:e2e`, and `npm run build` after shared response changes.
