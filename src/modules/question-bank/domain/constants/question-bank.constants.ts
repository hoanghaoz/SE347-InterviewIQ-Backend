export const DEFAULT_BANK_PAGE_SIZE = 20;
// Chặn trên cho pageSize: PaginationQueryDto dùng chung không có chặn nên một request
// pageSize=1000000 sẽ kéo cả bảng về.
export const MAX_BANK_PAGE_SIZE = 100;
export const MAX_BANK_SEARCH_LENGTH = 100;
// Giới hạn số câu mỗi người dùng được lưu (CR-006), để chặn lạm dụng lưu trữ.
export const MAX_BANK_ITEMS_PER_USER = 200;
