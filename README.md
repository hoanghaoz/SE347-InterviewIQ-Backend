# NestJS Template

Template NestJS gọn để bắt đầu API backend với Prisma, Swagger, JWT guard, validation, logging và git hooks cơ bản.

## Có sẵn

- NestJS 11
- Prisma 7 + PostgreSQL adapter
- Global `ConfigModule`
- Global `ValidationPipe`
- Global exception filter
- HTTP logger middleware cho route `api/*`
- Swagger UI tại `/docs`
- JWT guard + `@User()` decorator
- `RolesGuard` + `@Roles()` decorator cho phân quyền theo role
- `AppError`/`ErrorCode` + mapper sang HTTP exception cho domain error
- `bcrypt` cho password hashing
- ESLint + Prettier
- Husky hooks
- Commitlint theo conventional commits
- Dockerfile multi-stage build
- Gợi ý chia module trong `src/modules/MODULE.README.md`

## Cài đặt

```bash
npm install
cp .env.example .env
npx prisma generate
```

Cập nhật `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/db"
DIRECT_URL="postgresql://user:password@localhost:5432/db"
```

`generated/prisma` không được commit. Mỗi máy sau khi clone repo cần chạy lại:

```bash
npx prisma generate
```

## Chạy app

```bash
npm run start:dev
```

App chạy mặc định ở:

```txt
http://localhost:3000
```

Swagger:

```txt
http://localhost:3000/docs
```

## Scripts

```bash
npm run build
npm run lint
npm run format
npm run test
npm run test:e2e
```

## Git hooks

Husky đang cấu hình:

```txt
pre-commit  -> npm run lint
pre-push    -> npm run build
commit-msg  -> commitlint
```

Commit message dùng conventional commits:

```txt
feat: add auth module
fix: update prisma service
docs: update module guide
chore: setup husky
```

## GitHub

Thư mục `.github` đang cấu hình review ownership và CI cho repo.

```txt
.github/
  CODEOWNERS
  workflows/
    backend_ci.yml
```

`CODEOWNERS` khai báo owner mặc định của repo. Khi mở pull request, GitHub sẽ tự gợi ý reviewer theo file này.

Workflow `Backend CI` chạy khi push hoặc mở pull request vào nhánh `develop` và `main`.

Các bước CI hiện có:

```txt
checkout source code
setup Node.js 24
npm ci
npx prisma generate
npm run lint
npm run build
```

## Cấu trúc chính

```txt
src/
  main.ts
  app.module.ts
  modules/
    MODULE.README.md
  shared/
    common/
      app-error.mapper.ts
      errorCode.ts
      exceptions.filter.ts
      jwt.guard.ts
      jwt.payload.interface.ts
      logger.middleware.ts
      roles.decorator.ts
      roles.guard.ts
      user.decorator.ts
    infrastructure/
      database/
        prisma.module.ts
        prisma.service.ts
```

Feature mới nên đặt trong `src/modules/<feature-name>`.
