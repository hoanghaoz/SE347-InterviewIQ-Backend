# Modules Guide

Folder `src/modules` dùng để chứa các feature chính của app. Mỗi feature nên có module riêng và tự quản lý controller, service, repository, DTO của nó.

Template này chỉ cung cấp xương sống. Khi làm dự án thật, có thể thêm/bớt folder tùy độ lớn của feature.

Khi clone template về hãy xóa file **README** này đi.

## Cấu trúc đề xuất

```plaintext
└── src/modules/
    └── users/
        ├── users.module.ts
        ├── api/
        │   └── users.controller.ts
        ├── application/
        │   ├── interfaces/
        │   ├── dtos/
        │   └── services/
        ├── domain/
        │   ├── entities/
        │   ├── repositories/
        │   └── errors/ # handle domain error
        └── infrastructure/
            └── user.repo.ts
```

## Ý nghĩa các folder

`api`

Chứa controller. Đây là nơi nhận request từ client và gọi use case.

`application`

Chứa các file `service` để xử lý logic nghiệp vụ, `dto` cùng `class-validator` để kiểm tra dữ liệu đầu vào.

`domain`

Chứa entity, repository interface, rule nghiệp vụ hoặc value object nếu feature cần. Feature CRUD đơn giản có thể chưa cần nhiều file ở đây.

`infrastructure`

Chứa phần kết nối kỹ thuật như Prisma repository, mapper, external API client, queue, cache.

## Quy ước đặt tên

```txt
user.module.ts
user.controller.ts
user.repository.ts
user.interface.repo.ts
user.entity.ts
user.response.ts
```

## Shared dùng cho gì?

`src/shared` chỉ nên chứa phần dùng chung toàn app:

```txt
shared/
  common/
    exceptions.filter.ts
    logger.middleware.ts
    jwt.guard.ts
    user.decorator.ts
  infrastructure/
    database/
      prisma.module.ts
      prisma.service.ts
```

Nếu file chỉ phục vụ một feature, đặt trong feature đó. Nếu nhiều feature cùng dùng, mới đưa vào `shared`.
