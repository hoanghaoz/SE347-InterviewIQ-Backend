# Backend Code Style Rules

## Naming Style

Follow the existing naming even when it is not idiomatic TypeScript:

- Async service methods use `Async` suffix: `loginAsync`, `registerAsync`.
- Repository/provider methods use PascalCase: `GetUserByEmail`, `AddUser`, `GenerateAccessToken`.
- Interfaces are abstract classes prefixed with `I`: `IAuthService`, `IUserRepository`, `IPasswordHasher`.
- DTOs end with `Dto`: `LoginDto`, `RegisterDto`.
- Entities are singular domain names: `User`.
- Prisma fields use camelCase in TypeScript and map to snake_case database columns with `@map`.

Prefer imports from `src/...` for cross-module/shared code, as the current code does.

## Error Handling

The project uses functional error handling.

### Application and Domain

- Business/application methods should return `Promise<Result<T, AppError>>`.
- Entity factory methods should return `Result<Entity, AppError | Error>` when validation can fail.
- Return `err(new AppError(ErrorCode.X, message))` for expected business failures.
- Return `ok(value)` for success.
- Do not `throw new Error()` for business logic.
- Do not throw Nest exceptions outside the API/controller layer.

Example:

```ts
if (user.value === null) {
  return err(new AppError(ErrorCode.BadRequest, 'Invalid login credentials.'));
}
```

### Infrastructure

- Infrastructure may use `try/catch` around external calls such as Prisma, bcrypt, JWT, or environment setup.
- Convert caught failures to `err(new Error(...))`.
- Application services should translate infrastructure `Error` into user-safe `AppError`, usually `ErrorCode.InternalServerError`.
- Do not leak raw database or bcrypt errors to API responses.

### Controllers

- Controllers call service methods and use `result.match(...)`.
- Map `AppError.code` to Nest exceptions in the controller.
- Keep controller response shapes explicit.
- Use `Logger` for unexpected errors instead of raw `console.error`.

Existing mappings:

- `ErrorCode.BadRequest` -> `BadRequestException`
- `ErrorCode.Conflict` -> `ConflictException`
- `ErrorCode.NotFound` -> `NotFoundException`
- `ErrorCode.Unauthorized` -> `UnauthorizedException`
- default -> `InternalServerErrorException`

## DTO and Validation

All request bodies must use class DTOs.

Rules:

- Put DTOs in `application/dtos/`.
- Use `class-validator` decorators for every external input.
- Use custom validation messages like existing `auth.dto.ts`.
- Do not accept untyped `any` request bodies.
- Keep `main.ts` global validation behavior in mind: `whitelist: true`.

Example style:

```ts
@IsEmail({}, { message: 'Invalid email format' })
@IsNotEmpty({ message: 'Email is required' })
email!: string;
```

## Domain Entity Style

Entities should protect invariants.

Rules:

- Use a private constructor.
- Create new entities through static factory methods such as `create(...)`.
- Rehydrate persisted data through static methods such as `getUser(...)`.
- Expose state through getters.
- Do not expose mutable public properties unless there is a strong reason.
- Validate business constraints in the entity or application service, not in the controller.

## Repository and Prisma Rules

Prisma is infrastructure only.

Rules:

- Only concrete repositories/services in `infrastructure/`, `repository/`, or `shared/infrastructure/` should import `PrismaService` or generated Prisma client types.
- Repository contracts live in `domain/repositories/`.
- Repositories return domain entities, primitives, or DTO-like read models. Do not return raw Prisma models to application services unless explicitly intended.
- Use `publicId` for external identifiers. Avoid exposing internal numeric `id` to API clients.
- Use Prisma relation writes when creating aggregate-related records, example: `UserRepository.AddUser` does when creating a default `Profile`.
- Catch Prisma errors and return `err(new Error(...))`.

## Commands

Run commands from the repository root.

```bash
npm run build
npm run lint
npm run test
npm run test:e2e
npm run start:dev
```

Use `npm run build` after structural TypeScript changes. Use targeted tests when changing a narrow behavior, and broader tests when touching shared auth, error handling, Prisma, guards, or app bootstrap.

## Code Style

- Keep code explicit and boring.
- Prefer small methods with clear return types.
- Preserve existing formatter/linter style.
- Avoid unrelated refactors while implementing a feature.
- Avoid comments that repeat the code. Add comments only for non-obvious domain decisions or external-service behavior.
- Use Nest `Logger` for application logging.
- Do not use `console.log` in committed code.
- Keep API response messages short and consistent.
- Do not introduce new libraries unless the existing stack cannot solve the problem cleanly.
