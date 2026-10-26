# Cloudflare Worker - Telegram HLS Video Streaming Proxy (Free 100%)

Worker này đóng vai trò máy chủ phân phối nội dung (Edge CDN Proxy) nhận từng phân đoạn `.ts` (< 15MB) từ Telegram Bot API và phân phối qua giao thức HLS đến trình duyệt của học sinh với bộ đệm biên (`caches.default`).

## Cách 1: Triển khai nhanh bằng Cloudflare Dashboard (30 giây)
1. Truy cập [Cloudflare Dashboard](https://dash.cloudflare.com/) -> Chọn mục **Workers & Pages**.
2. Nhấn **Create application** -> **Create Worker**.
3. Đặt tên worker là `tg-hls` (hoặc tên tùy chọn) -> Nhấn **Deploy**.
4. Nhấn **Edit code**, dán toàn bộ nội dung từ file `worker.js` vào trình soạn thảo.
5. Nhấn **Deploy**.
6. Worker domain của bạn sẽ có dạng: `https://tg-hls.<your-subdomain>.workers.dev` (ví dụ: `https://tg-hls.phamngockhanh-942001.workers.dev`).

## Cách 2: Triển khai bằng dòng lệnh Wrangler CLI
```bash
cd cloudflare-worker-hls
npx wrangler login
npx wrangler deploy
```

## Kiểm tra hoạt động
Mở trình duyệt truy cập:
`https://<worker-domain>/health`
Kết quả trả về:
```json
{
  "status": "online",
  "service": "QMath Telegram HLS Stream Proxy",
  "version": "1.0.0"
}
```
