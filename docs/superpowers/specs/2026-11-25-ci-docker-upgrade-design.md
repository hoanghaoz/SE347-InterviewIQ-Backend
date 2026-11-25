# Nâng cấp workflow CI và đổi tên Docker image

Ngày: 2026-11-25. Cỡ: thay đổi nhỏ.

## Mục tiêu

- Image trên Docker Hub mang tên project: `<DOCKERHUB_USERNAME>/interviewiq-api`.
- CI chạy e2e, lỗi thì không push image.
- Image được quét lỗ hổng và có báo cáo trong log.

Đây là repo học tập nên không đặt cổng chặn bảo mật.

**Không làm:** tag theo version, chạy workflow thủ công, chạy migration trong
image, sửa các lỗ hổng đang có, đổi tên MockMate/FitWork ở chỗ không liên quan
tới CI.

## Ràng buộc

- Docker Hub chỉ nhận tên repository viết thường.
- Giữ nguyên luật hiện tại: pull request chỉ build, push vào `main` mới publish.
- Dùng lại hai secret `DOCKERHUB_USERNAME` và `DOCKERHUB_TOKEN`.

## Phương án cho bước quét

| Phương án | Đổi lại |
| --- | --- |
| A. Chặn HIGH và CRITICAL đã có bản vá | An toàn nhất, nhưng phải sửa lỗi đang có và CVE mới có thể làm đỏ PR không liên quan |
| B. Chỉ chặn CRITICAL | Ít đỏ bất ngờ hơn, vẫn phải sửa lỗi critical đang có |
| **C. Chỉ báo cáo (đã chọn)** | Không phải sửa gì và không bao giờ chặn, nhưng cảnh báo dễ bị bỏ qua |

Chọn C vì repo học tập không cần kiểm tra chặt.

Hiện trạng lúc thiết kế (Trivy 0.76.2 quét image build từ `main`): 26 lỗ hổng
HIGH/CRITICAL, gồm 1 critical (`proxy-addr`). Phương án C để nguyên các lỗi này.

## Thiết kế

`.github/workflows/backend_ci.yml`:

- Thêm bước `npm run test:e2e -- --ci --runInBand` sau unit test trong job `ci`.
  Job `docker` đã phụ thuộc `ci` nên e2e lỗi thì không push. Bộ e2e hiện tại
  không cần `.env` hay database.
- Cố định `actionlint` ở bản 1.7.12 thay vì tải script từ nhánh `main`.
- Đổi `POSTGRES_DB=fitwork_ci` thành `interviewiq_ci`.

`.github/workflows/docker_ci.yml`:

- Đổi tên image thành `interviewiq-api`.
- Thứ tự: build và nạp image vào runner, quét, rồi mới push (dùng lại cache).
  Pull request cũng được build và quét.
- Quét bằng `aquasecurity/trivy-action`, cố định theo commit SHA
  `ed142fd0673e97e23eac54620cfb913e5ce36c25` (v0.36.0), vì action này từng bị
  tấn công chuỗi cung ứng
  ([GHSA-69fq-xp46-6x23](https://github.com/advisories/GHSA-69fq-xp46-6x23)).
- Báo cáo HIGH và CRITICAL ra log. Bước quét luôn không làm hỏng workflow, kể cả
  khi chính Trivy lỗi (ví dụ không tải được database lỗ hổng).

`docs/`: cập nhật `github-workflows.md` và phần tóm tắt CI trong
`code-workflow.md`.

## Ảnh hưởng

- `fitwork-be-nestjs-api` ngừng được cập nhật. Nơi nào đang pull tên cũ phải đổi.
- Docker Hub tạo repository `interviewiq-api` ở lần push đầu theo chế độ
  public/private mặc định của tài khoản.

## Kiểm chứng

- `actionlint` chạy sạch ở local.
- CI của pull request pass, log có bảng kết quả Trivy, không đăng nhập hay push.
- Việc push image tên mới chỉ kiểm chứng được sau khi merge vào `main`.

## Để người làm tự quyết

Tên bước, định dạng bảng báo cáo và cách cài `actionlint`.
