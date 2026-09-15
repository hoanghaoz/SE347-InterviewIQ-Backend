# Backend Architecture Rules

## Source Layout

```plaintext
src/
├── modules/
│   ├── auth/
│   │   ├── api/
│   │   ├── application/
│   │   │   ├── dtos/
│   │   │   ├── interfaces/
│   │   │   └── services/
│   │   ├── domain/
│   │   │   └── repositories/
│   │   ├── repository/
│   │   └── auth.module.ts
│   ├── user/
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   └── repositories/
│   │   ├── infrastructure/
│   │   └── user.module.ts
│   └── <feature>/
│       ├── api/
│       ├── application/
│       ├── domain/
│       ├── infrastructure/
│       └── <feature>.module.ts
├── shared/
│   ├── common/
│   └── infrastructure/
├── app.module.ts
└── main.ts
```

## Architecture Rule

Use **Feature-based Clean Architecture**.

Dependency direction:

```plaintext
api
↓
application
↓
domain

infrastructure/repository -> implements domain contracts
```

Rules:

- `api` contains controllers only. It receives DTOs, calls application services, and maps `AppError` to Nest HTTP exceptions.
- `application` contains use-case services and service interfaces. It coordinates domain objects and repositories.
- `domain` contains entities and abstract contracts. It must not import Nest controllers, Prisma, infrastructure, or application services.
- `infrastructure` or `repository` contains concrete external implementations such as Prisma, bcrypt, JWT providers, and database queries.
- Controllers and services must not call Prisma directly. All database access goes through domain repository contracts.
- Do not put business rules in controllers.
- Do not put HTTP exceptions in domain or application service logic.

## Dependency Injection Style

Use abstract classes as injection tokens, matching the existing code.

Example:

```ts
export abstract class IUserRepository {
  abstract GetUserByEmail(email: string): Promise<Result<User | null, Error>>;
}
```

Bind implementations in the feature module:

```ts
providers: [
  {
    provide: IUserRepository,
    useClass: UserRepository,
  },
];
```

Constructor injection should depend on contracts:

```ts
constructor(private readonly userRepository: IUserRepository) {}
```

Do not inject concrete Prisma repositories into services when an interface/abstract contract should exist.

## Module Registration

When adding a feature:

- Create `<feature>.module.ts`.
- Register controllers in `AppModule` only if following the current global style, or in the feature module if refactoring consistently.
- Register abstract contracts with `provide/useClass`.
- Export contracts that other modules need.
- Import `PrismaModule`, `ConfigModule`, `JwtModule`, or other dependencies through Nest modules instead of manually constructing them inside application services.

## Database

See:

- `prisma/models`

Always inspect schema before:

- creating repository methods
- creating DTOs
- creating migrations
