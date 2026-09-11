# Ruby House

Website giới thiệu căn hộ Ruby House, quản trị phòng/media và tiếp nhận yêu cầu xem phòng. Bản production chạy React, Express và PostgreSQL.

## Chạy trên máy phát triển

```bash
npm install
npm run dev
```

Nếu không khai báo PostgreSQL, môi trường phát triển dùng PGlite trong `data/`. Trang web ở `http://127.0.0.1:5173`, trang quản trị ở `/quan-tri`.

## Deploy lên VPS bằng Docker

Yêu cầu VPS đã cài Docker Engine, Docker Compose và Nginx.

```bash
git clone https://github.com/duymanh11tb/RubyHouse.git
cd RubyHouse
cp .env.example .env
```

Sửa `.env`, thay `POSTGRES_PASSWORD` và `ADMIN_PASSWORD` bằng hai mật khẩu mạnh, khác nhau. Không đưa `.env` lên GitHub.

Để nhận email khi khách đặt lịch, bật xác minh 2 bước cho Gmail, tạo **App Password** và điền `SMTP_USER`, `SMTP_PASS`, `MAIL_TO` trong `.env`. `SMTP_PASS` không phải mật khẩu đăng nhập Gmail thông thường. Có thể nhập nhiều email nhận trong `MAIL_TO`, phân tách bằng dấu phẩy.

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3001/api/health
```

Database và media tải lên được giữ trong Docker volumes nên không mất khi build/deploy lại. Ảnh danh mục được gắn trực tiếp từ `uploads/catalog`; các bảng và dữ liệu danh mục ban đầu được tự động tạo ở lần chạy đầu tiên.

### Nginx

Proxy tên miền HTTPS vào `http://127.0.0.1:3001`. Tăng giới hạn upload vì website chấp nhận video tối đa 500 MB:

Cấu hình dành sẵn cho tên miền chính thức nằm tại `deploy/nginx-rubyhousing.conf`. Sau khi DNS trỏ về VPS, kích hoạt bằng:

```bash
cp deploy/nginx-rubyhousing.conf /etc/nginx/sites-available/rubyhouse
ln -sf /etc/nginx/sites-available/rubyhouse /etc/nginx/sites-enabled/rubyhouse
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
certbot --nginx -d rubyhousing.vn -d www.rubyhousing.vn
```

```nginx
server {
    server_name rubyhouse.example.com;
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }
}
```

Sau đó cài chứng chỉ HTTPS bằng Certbot.

## Ảnh và video

Ảnh danh mục trong `uploads/catalog` được lưu cùng mã nguồn. Các tệp tải lên từ trang quản trị không được commit. Video trên 100 MB không thể đẩy trực tiếp lên GitHub; hãy tải lại từ trang quản trị sau khi deploy hoặc sao chép vào volume `rubyhouse_uploads` trên VPS.

## Cập nhật phiên bản

```bash
git pull
docker compose up -d --build
```

Không chạy `docker compose down -v`, vì tùy chọn `-v` sẽ xóa database và media đã lưu.
