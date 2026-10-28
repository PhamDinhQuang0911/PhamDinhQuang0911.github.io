/**
 * Cloudflare Worker: Telegram HLS Streaming Proxy & Edge Cache (100% FREE)
 * =========================================================================
 * Chức năng:
 *  1. Proxy luồng video HLS (.ts chunks) từ Telegram Bot API qua Cloudflare Edge.
 *  2. Hỗ trợ phát luồng video Byte-Range trực tiếp (/stream/:id) từ các phân đoạn Telegram chunked.
 *  3. Vượt qua giới hạn 20MB download của Telegram Bot bằng cách phục vụ từng chunk < 15MB.
 *  4. Lưu đệm vĩnh viễn (Edge Caching) qua Cache API (caches.default), tối đa hóa tốc độ phát và 0 tải lặp lại lên Telegram Bot.
 *  5. Hỗ trợ xoay vòng nhiều Bot Token để chia tải và phòng chống Rate Limit (429).
 *  6. Endpoint /playlist/:id.m3u8 lấy trực tiếp danh sách phát từ Supabase.
 *  7. Hỗ trợ CORS đầy đủ cho các tên miền LMS: qmath.io.vn, note.qmath.io.vn, github.io, localhost.
 */

// Danh sách Bot Token (có thể cấu hình thêm qua env.TELEGRAM_BOT_TOKENS cách nhau dấu phẩy)
const DEFAULT_BOT_TOKENS = [
  "8662985318:AAHIweMUW706XKIXFi-bFisaFoE7hZaMHDo"
];

const SUPABASE_CONFIG = {
  url: "https://cuniqanbumcrqcdlcvad.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE4MTMsImV4cCI6MjEwNDUxNzgxM30.MWSv1QKVlQ9r-8r0hkrqWsmm75hULq_VjPCbTqXDe-o"
};

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

function getBotTokens(env) {
  if (env && env.TELEGRAM_BOT_TOKENS) {
    const list = env.TELEGRAM_BOT_TOKENS.split(",").map(t => t.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  if (env && env.TELEGRAM_BOT_TOKEN) {
    return [env.TELEGRAM_BOT_TOKEN.trim()];
  }
  return DEFAULT_BOT_TOKENS;
}

/**
 * Tải binary của 1 chunk từ Cache hoặc Telegram Bot API
 */
async function fetchChunkArrayBuffer(fileId, env, ctx, requestOriginUrl) {
  const cache = caches.default;
  const cacheUrl = new URL(requestOriginUrl);
  cacheUrl.pathname = `/chunk/${fileId}.ts`;
  cacheUrl.search = "";
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    const buf = await cachedResponse.arrayBuffer();
    return { buffer: buf, fromCache: true };
  }

  // Cache miss: Gọi Telegram getFile
  const tokens = getBotTokens(env);
  let filePath = null;
  let chosenToken = null;
  let lastError = null;

  const hash = Array.from(fileId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const startIdx = hash % tokens.length;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[(startIdx + i) % tokens.length];
    try {
      const getFileUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`;
      const getFileRes = await fetch(getFileUrl);
      if (getFileRes.status === 429) continue;
      if (!getFileRes.ok) {
        lastError = `Telegram HTTP ${getFileRes.status}`;
        continue;
      }
      const fileData = await getFileRes.json();
      if (fileData.ok && fileData.result && fileData.result.file_path) {
        filePath = fileData.result.file_path;
        chosenToken = token;
        break;
      } else {
        lastError = fileData.description || "file_id không hợp lệ";
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  if (!filePath || !chosenToken) {
    throw new Error(`Không thể lấy file từ Telegram: ${lastError || "Hết token khả dụng"}`);
  }

  const tgDownloadUrl = `https://api.telegram.org/file/bot${chosenToken}/${filePath}`;
  const tgFileRes = await fetch(tgDownloadUrl);
  if (!tgFileRes.ok) {
    throw new Error(`Lỗi tải dữ liệu từ Telegram CDN (${tgFileRes.status})`);
  }

  const buffer = await tgFileRes.arrayBuffer();

  // Lưu đệm vĩnh viễn vào Cloudflare Edge Cache
  const cacheHeaders = new Headers();
  cacheHeaders.set("Content-Type", "video/mp2t");
  cacheHeaders.set("Content-Length", String(buffer.byteLength));
  cacheHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
  cacheHeaders.set("Accept-Ranges", "bytes");
  cacheHeaders.set("X-Cache", "MISS");

  const streamResponse = new Response(buffer, {
    status: 200,
    headers: cacheHeaders
  });
  ctx.waitUntil(cache.put(cacheKey, streamResponse));

  return { buffer, fromCache: false };
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
          service: "QMath Telegram HLS & Range Stream Proxy",
          version: "2.1.0",
          features: ["edge-caching", "multi-token-rotation", "playlist-proxy", "range-streaming"],
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

    // 3. Endpoint phát luồng trực tiếp với Byte-Range: /stream/:id (hoặc .mp4, .webm)
    const streamMatch = pathname.match(/^\/stream\/(.+)$/i);
    if (streamMatch) {
      let videoId = streamMatch[1].replace(/\.(webm|mp4|ts|m3u8)$/i, "").trim();
      const configId = videoId.startsWith("hls_video_") ? videoId : (videoId.startsWith("lesson_") ? videoId : `hls_video_${videoId}`);

      try {
        const sbUrl = `${SUPABASE_CONFIG.url}/rest/v1/configurations?id=eq.${encodeURIComponent(configId)}&select=raw_data`;
        const sbRes = await fetch(sbUrl, {
          headers: {
            apikey: SUPABASE_CONFIG.anonKey,
            Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`
          }
        });

        if (!sbRes.ok) {
          return new Response("Lỗi truy vấn cơ sở dữ liệu Supabase", { status: 500, headers: corsHeaders });
        }

        const rows = await sbRes.json();
        const rawData = rows?.[0]?.raw_data;
        if (!rawData) {
          return new Response("Không tìm thấy video bài giảng trên hệ thống", { status: 404, headers: corsHeaders });
        }

        const totalSize = rawData.totalSize || (rawData.chunks ? rawData.chunks.reduce((acc, c) => acc + (c.size || 0), 0) : 0);
        const mimeType = rawData.mimeType || (rawData.filename?.endsWith(".mp4") ? "video/mp4" : "video/webm");
        const chunks = rawData.chunks || [];

        // Nếu chỉ có 1 fileId thông thường
        if (chunks.length === 0 && rawData.fileId) {
          chunks.push({
            index: 0,
            fileId: rawData.fileId,
            start: 0,
            end: totalSize,
            size: totalSize
          });
        }

        // Xử lý request HEAD: trả về thông số luồng
        if (request.method === "HEAD") {
          return new Response(null, {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": mimeType,
              "Content-Length": String(totalSize),
              "Accept-Ranges": "bytes",
              "Cache-Control": "public, max-age=31536000, immutable"
            }
          });
        }

        // Xử lý request GET: phân tích Range header
        const rangeHeader = request.headers.get("Range");
        let start = 0;
        let end = totalSize - 1;

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          start = parseInt(parts[0], 10) || 0;
          if (parts[1]) {
            end = parseInt(parts[1], 10);
          }
        }

        if (start >= totalSize) {
          return new Response("Range Not Satisfiable", {
            status: 416,
            headers: {
              ...corsHeaders,
              "Content-Range": `bytes */${totalSize}`
            }
          });
        }

        if (end >= totalSize) end = totalSize - 1;

        // Tìm chunk chứa byte 'start'
        const chunk = chunks.find(c => start >= c.start && start < c.end) || chunks[0];
        if (!chunk) {
          return new Response("Không tìm thấy phân đoạn video tương ứng", { status: 404, headers: corsHeaders });
        }

        // Lấy binary của chunk từ Cache hoặc Telegram
        const { buffer, fromCache } = await fetchChunkArrayBuffer(chunk.fileId, env, ctx, request.url);

        const chunkLen = buffer.byteLength;
        const offsetInChunk = Math.max(0, start - chunk.start);
        const availableInChunk = chunkLen - offsetInChunk;
        const requestedLength = end - start + 1;
        const sliceLength = Math.min(requestedLength, availableInChunk);
        const sliceEnd = start + sliceLength - 1;

        const slice = buffer.slice(offsetInChunk, offsetInChunk + sliceLength);

        return new Response(slice, {
          status: 206,
          headers: {
            ...corsHeaders,
            "Content-Type": mimeType,
            "Content-Range": `bytes ${start}-${sliceEnd}/${totalSize}`,
            "Content-Length": String(slice.byteLength),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Cache": fromCache ? "HIT" : "MISS"
          }
        });
      } catch (err) {
        return new Response(`Lỗi phát luồng video: ${err.message}`, {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    }

    // 4. Endpoint phục vụ danh sách phát: /playlist/:id hoặc /playlist/:id.m3u8
    const playlistMatch = pathname.match(/^\/playlist\/(.+)$/i);
    if (playlistMatch) {
      let videoId = playlistMatch[1].replace(/\.m3u8$/i, "").trim();
      const configId = videoId.startsWith("hls_video_") ? videoId : (videoId.startsWith("lesson_") ? videoId : `hls_video_${videoId}`);

      try {
        const sbUrl = `${SUPABASE_CONFIG.url}/rest/v1/configurations?id=eq.${encodeURIComponent(configId)}&select=raw_data`;
        const sbRes = await fetch(sbUrl, {
          headers: {
            apikey: SUPABASE_CONFIG.anonKey,
            Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`
          }
        });

        if (sbRes.ok) {
          const rows = await sbRes.json();
          const rawData = rows?.[0]?.raw_data;
          const m3u8 = rawData?.m3u8 || rawData?.video?.m3u8;
          if (m3u8) {
            return new Response(m3u8, {
              status: 200,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
                "Cache-Control": "public, max-age=3600"
              }
            });
          }
        }
        return new Response("Không tìm thấy playlist m3u8 trên cơ sở dữ liệu Supabase", {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
        });
      } catch (err) {
        return new Response(`Lỗi truy vấn playlist: ${err.message}`, {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    }

    // 5. Endpoint phục vụ chunk video HLS thông thường: /chunk/:file_id
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

    try {
      const { buffer, fromCache } = await fetchChunkArrayBuffer(fileId, env, ctx, request.url);
      const responseHeaders = new Headers();
      Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));
      responseHeaders.set("Content-Type", "video/mp2t");
      responseHeaders.set("Content-Length", String(buffer.byteLength));
      responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
      responseHeaders.set("Accept-Ranges", "bytes");
      responseHeaders.set("X-Cache", fromCache ? "HIT" : "MISS");

      return new Response(buffer, {
        status: 200,
        headers: responseHeaders
      });
    } catch (err) {
      return new Response(`Lỗi lấy chunk: ${err.message}`, {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }
  }
};
