/**
 * Cloudflare Worker: Telegram HLS Streaming Proxy & Edge Cache (100% FREE)
 * =========================================================================
 * Chức năng:
 *  1. Proxy luồng video HLS (.ts chunks) từ Telegram Bot API qua Cloudflare Edge.
 *  2. Vượt qua giới hạn 20MB download của Telegram Bot bằng cách phục vụ từng chunk < 15MB.
 *  3. Lưu đệm vĩnh viễn (Edge Caching) qua Cache API (caches.default), tối đa hóa tốc độ phát và 0 tải lặp lại lên Telegram Bot.
 *  4. Hỗ trợ CORS đầy đủ cho các tên miền LMS: qmath.io.vn, note.qmath.io.vn, github.io, localhost.
 */

// Cấu hình mặc định (có thể ghi đè bằng Cloudflare Environment Variables / Secrets)
const DEFAULT_BOT_TOKEN = "8662985318:AAHIweMUW706XKIXFi-bFisaFoE7hZaMHDo";

// Danh sách Origin được phép truy cập
const ALLOWED_ORIGINS = [
  "https://qmath.io.vn",
  "https://note.qmath.io.vn",
  "https://phamdinhquang0911.github.io"
];

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  if (origin.endsWith(".qmath.io.vn")) return true;
  if (origin.endsWith(".github.io")) return true;
  return false;
}

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  const allowOrigin = isOriginAllowed(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Accept, Authorization, X-Requested-With",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type, X-Cache, Accept-Ranges",
    "Access-Control-Max-Age": "86400"
  };
}

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request);

    // 1. Xử lý OPTIONS (CORS preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Chỉ chấp nhận GET và HEAD
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // 2. Health check endpoint
    if (pathname === "/" || pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "online",
          service: "QMath Telegram HLS Stream Proxy",
          version: "1.0.0",
          timestamp: new Date().toISOString()
        }, null, 2),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-cache"
          }
        }
      );
    }

    // 3. Endpoint phục vụ chunk video HLS:
    // Hỗ trợ: /chunk/:file_id, /chunk/:file_id.ts, hoặc ?file_id=:file_id
    let fileId = "";
    const chunkMatch = pathname.match(/^\/chunk\/(.+)$/i);
    if (chunkMatch) {
      fileId = chunkMatch[1].replace(/\.ts$/i, "").trim();
    } else if (url.searchParams.has("file_id")) {
      fileId = url.searchParams.get("file_id").replace(/\.ts$/i, "").trim();
    }

    if (!fileId) {
      return new Response("Thiếu file_id của phân đoạn video HLS", {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }

    // 4. KIỂM TRA CLOUDFLARE EDGE CACHE (caches.default)
    const cache = caches.default;
    // Chuẩn hóa cache key theo URL chunk sạch
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = `/chunk/${fileId}.ts`;
    cacheUrl.search = "";
    const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // Phục vụ siêu tốc từ Edge Cache (HIT)
      const hitHeaders = new Headers(cachedResponse.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => hitHeaders.set(k, v));
      hitHeaders.set("X-Cache", "HIT");
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: hitHeaders
      });
    }

    // 5. CACHE MISS: Lấy đường dẫn file từ Telegram Bot API
    const botToken = (env && env.TELEGRAM_BOT_TOKEN) || DEFAULT_BOT_TOKEN;

    try {
      const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
      const getFileRes = await fetch(getFileUrl);

      if (!getFileRes.ok) {
        return new Response(`Lỗi kết nối Telegram Bot API (${getFileRes.status})`, {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
        });
      }

      const fileData = await getFileRes.json();
      if (!fileData.ok || !fileData.result || !fileData.result.file_path) {
        return new Response(
          `Không tìm thấy file trên Telegram: ${fileData.description || "file_id không hợp lệ"}`,
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
          }
        );
      }

      const filePath = fileData.result.file_path;
      const tgDownloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

      // 6. Tải binary của mảnh video (.ts) từ Telegram
      const tgFileRes = await fetch(tgDownloadUrl);
      if (!tgFileRes.ok) {
        return new Response(`Lỗi tải dữ liệu video từ Telegram CDN (${tgFileRes.status})`, {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
        });
      }

      // 7. Thiết lập response headers tối ưu cho HLS streaming & cache vĩnh viễn
      const responseHeaders = new Headers();
      Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));

      responseHeaders.set("Content-Type", "video/mp2t");
      const contentLength = tgFileRes.headers.get("Content-Length");
      if (contentLength) responseHeaders.set("Content-Length", contentLength);

      // Telegram file_id là bất biến (immutable), cache 1 năm tại Edge
      responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
      responseHeaders.set("Accept-Ranges", "bytes");
      responseHeaders.set("X-Cache", "MISS");

      const streamResponse = new Response(tgFileRes.body, {
        status: 200,
        headers: responseHeaders
      });

      // 8. Lưu vào Cloudflare Edge Cache chạy nền
      ctx.waitUntil(cache.put(cacheKey, streamResponse.clone()));

      return streamResponse;
    } catch (err) {
      return new Response(`Lỗi máy chủ phát luồng video: ${err.message}`, {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }
  }
};
