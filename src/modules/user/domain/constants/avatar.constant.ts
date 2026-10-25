// Giới hạn dùng chung giữa controller (chặn sớm ở multer, không buffer file to vào RAM)
// và service (luật nghiệp vụ, test được mà không cần HTTP).
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Cloudinary đọc được nhiều định dạng hơn, nhưng avatar chỉ cần 3 cái này.
export const ALLOWED_AVATAR_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];
