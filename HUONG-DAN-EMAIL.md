# Hướng dẫn sửa email và tên người gửi

Mọi cấu hình email nằm trong file `/opt/RubyHouse/.env` trên VPS. Không sửa trực tiếp trong code và không đưa file `.env` lên GitHub.

## 1. Mở file cấu hình

```bash
cd /opt/RubyHouse
nano .env
```

Tìm hoặc thêm các dòng sau:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=gm.rubyhousing@gmail.com
SMTP_PASS=MAT_KHAU_UNG_DUNG_GOOGLE_16_KY_TU
MAIL_FROM_NAME=RubyHouse Website
MAIL_TO=gm.rubyhousing@gmail.com,rubyhouse2019@gmail.com
```

- `SMTP_USER`: Gmail dùng để gửi thư.
- `SMTP_PASS`: App Password 16 ký tự của chính tài khoản `SMTP_USER`, viết liền và không có dấu cách.
- `MAIL_FROM_NAME`: tên người gửi mà admin nhìn thấy, ví dụ `RubyHouse Website`.
- `MAIL_TO`: email nhận thông báo. Có thể nhập nhiều email, phân tách bằng dấu phẩy.

Lưu trong Nano bằng `Ctrl+O`, nhấn `Enter`, rồi `Ctrl+X`.

## 2. Áp dụng cấu hình mới

Chỉ thay đổi `.env` thì không cần build lại:

```bash
cd /opt/RubyHouse
docker compose up -d --force-recreate web
```

## 3. Kiểm tra cấu hình mà không làm lộ mật khẩu

```bash
docker compose exec web node -e "console.log({sender:process.env.SMTP_USER,name:process.env.MAIL_FROM_NAME,recipient:process.env.MAIL_TO,passwordLength:process.env.SMTP_PASS?.length})"
```

`passwordLength` phải là `16`.

## 4. Xem lỗi gửi thư

Sau khi gửi thử một yêu cầu đặt lịch trên website, chạy:

```bash
docker compose logs --since=5m web
```

Nếu Gmail báo `BadCredentials`, hãy tạo App Password mới từ đúng tài khoản trong `SMTP_USER` và cập nhật lại `SMTP_PASS`.

## Lưu ý bảo mật

- Không sử dụng mật khẩu đăng nhập Gmail thông thường.
- Không chụp hoặc gửi ảnh có chứa `SMTP_PASS`.
- Nếu App Password bị lộ, thu hồi ngay trên Google Account và tạo mã mới.
- Nếu `SMTP_USER` trùng với `MAIL_TO`, Gmail có thể xếp thư vào mục **Đã gửi**. Nên dùng email gửi và email nhận khác nhau.
