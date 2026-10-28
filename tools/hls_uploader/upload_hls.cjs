#!/usr/bin/env node

/**
 * ============================================================================
 * QMATH VIDEO HLS PRE-PROCESSOR & TELEGRAM UPLOADER (FREE 100%)
 * ============================================================================
 * Quy trình xử lý tự động:
 *  1. Cắt video MP4 bằng FFmpeg (-c copy siêu tốc) thành playlist .m3u8 và các chunk .ts (5-8s / chunk).
 *  2. Đẩy tuần tự từng chunk .ts (< 15MB) lên Telegram Channel kho_video_qmath_2026 qua Bot API.
 *  3. Thu thập file_id của từng chunk và tự động thay thế đường dẫn trong file .m3u8 bằng Cloudflare Worker URL.
 *  4. Đồng bộ trực tiếp metadata và nội dung .m3u8 lên cơ sở dữ liệu Supabase:
 *     - Lưu vào Thư viện Video HLS trung tâm (configurations -> hls_video_<id>)
 *     - Tùy chọn gán trực tiếp vào Khóa học (public_courses -> curriculum)
 *     - Tùy chọn gán vào Buổi học (configurations -> lesson_<id>)
 *  5. Tự động dọn dẹp các mảnh .ts tạm trên ổ cứng sau khi hoàn thành.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

// ==========================================
// CẤU HÌNH MẶC ĐỊNH
// ==========================================
const CONFIG = {
  // Telegram Bot Token (Hỗ trợ danh sách token cách nhau bởi dấu phẩy để xoay vòng)
  TELEGRAM_BOT_TOKENS: (process.env.TELEGRAM_BOT_TOKENS || process.env.TELEGRAM_BOT_TOKEN || '8662985318:AAHIweMUW706XKIXFi-bFisaFoE7hZaMHDo')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean),
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '@kho_video_qmath_2026',

  // Cloudflare Worker phát video HLS
  DEFAULT_WORKER_DOMAIN: 'https://tg-hls.phamngockhanh-942001.workers.dev',

  // Supabase API
  SUPABASE_URL: 'https://cuniqanbumcrqcdlcvad.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE4MTMsImV4cCI6MjEwNDUxNzgxM30.MWSv1QKVlQ9r-8r0hkrqWsmm75hULq_VjPCbTqXDe-o',

  // HLS Settings
  CHUNK_DURATION_SECONDS: 6, // 6 giây/chunk -> Đảm bảo mỗi chunk ~1MB - 5MB (luôn < 15MB)
  DELAY_BETWEEN_CHUNKS_MS: 700, // Nghỉ 700ms giữa các lần upload tránh Telegram Rate Limit 429
  MAX_RETRIES: 5
};

// ==========================================
// HÀM TIỆN ÍCH DÒ TÌM FFMPEG
// ==========================================
function findFFmpegBinary() {
  // 1. Kiểm tra trong PATH
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (res.status === 0) return 'ffmpeg';
  } catch (e) {}

  // 2. Kiểm tra đường dẫn WinGet thông dụng
  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPackages)) {
      try {
        const findMatches = (dir) => {
          let results = [];
          const list = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of list) {
            const fullPath = path.join(dir, item.name);
            if (item.isDirectory()) {
              if (item.name.toLowerCase().includes('ffmpeg') || item.name.toLowerCase().includes('bin')) {
                results = results.concat(findMatches(fullPath));
              }
            } else if (item.name.toLowerCase() === 'ffmpeg.exe') {
              results.push(fullPath);
            }
          }
          return results;
        };
        const found = findMatches(wingetPackages);
        if (found.length > 0) return found[0];
      } catch (err) {}
    }
  }

  // 3. Kiểm tra Program Files
  const progFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  for (const pf of progFiles) {
    const guess = path.join(pf, 'ffmpeg', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(guess)) return guess;
  }

  return null;
}

function ask(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      rl.close();
      const val = answer.trim();
      resolve(val || defaultValue);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ==========================================
// TƯƠNG TÁC SUPABASE
// ==========================================

// 1. Lưu metadata video vào thư viện trung tâm configurations (hls_video_<id>)
async function saveHlsVideoToLibrary(videoMetadata) {
  const videoId = `hls_video_${Date.now()}`;
  videoMetadata.id = videoId;

  const url = `${CONFIG.SUPABASE_URL}/rest/v1/configurations?on_conflict=id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify({
      id: videoId,
      raw_data: videoMetadata,
      updated_at: new Date().toISOString()
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Lưu video vào Thư viện Supabase thất bại (${res.status}): ${errText}`);
  }
  return videoId;
}

// 2. Lấy danh sách khóa học gần đây
async function fetchRecentCourses() {
  try {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/public_courses?select=id,title,curriculum,updated_at&order=updated_at.desc&limit=15`;
    const res = await fetch(url, {
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

// 3. Gán video vào giáo án của khóa học (public_courses)
async function attachVideoToCourse(courseId, videoMetadata) {
  const getUrl = `${CONFIG.SUPABASE_URL}/rest/v1/public_courses?id=eq.${encodeURIComponent(courseId)}&select=id,title,curriculum`;
  const res = await fetch(getUrl, {
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
    }
  });

  if (!res.ok) throw new Error(`Không tìm thấy khóa học ${courseId}`);
  const rows = await res.json();
  if (!rows || rows.length === 0) throw new Error(`Khóa học ${courseId} không tồn tại`);

  const course = rows[0];
  let curriculum = Array.isArray(course.curriculum) ? course.curriculum : [];

  if (curriculum.length === 0) {
    curriculum.push({
      title: 'Chương 1: Bài giảng video',
      lessons: [{ title: 'Bài học', items: [] }]
    });
  }

  const newItem = {
    id: `it_${Date.now()}`,
    type: 'video',
    videoType: 'hls',
    title: videoMetadata.title,
    content: `${videoMetadata.workerDomain}/playlist/${videoMetadata.id}.m3u8`,
    m3u8: videoMetadata.m3u8,
    duration: videoMetadata.duration,
    chunkCount: videoMetadata.chunkCount,
    minWatchTime: Math.max(1, Math.round(videoMetadata.duration / 120)), // Yêu cầu xem tối thiểu ~50%
    isPublished: true
  };

  // Thêm vào bài học đầu tiên của chương mới nhất
  const lastChapter = curriculum[curriculum.length - 1];
  if (!Array.isArray(lastChapter.lessons) || lastChapter.lessons.length === 0) {
    lastChapter.lessons = [{ title: 'Bài học 1', items: [] }];
  }
  const lastLesson = lastChapter.lessons[lastChapter.lessons.length - 1];
  if (!Array.isArray(lastLesson.items)) lastLesson.items = [];
  lastLesson.items.push(newItem);

  // Cập nhật lên Supabase
  const patchUrl = `${CONFIG.SUPABASE_URL}/rest/v1/public_courses?id=eq.${encodeURIComponent(courseId)}`;
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      curriculum: curriculum,
      updated_at: new Date().toISOString()
    })
  });

  if (!patchRes.ok) {
    const errText = await patchRes.text();
    throw new Error(`Cập nhật giáo án khóa học thất bại (${patchRes.status}): ${errText}`);
  }

  return { courseTitle: course.title, itemId: newItem.id };
}

// 4. Lấy danh sách buổi học gần đây (lesson_*)
async function fetchRecentLessons() {
  try {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/configurations?select=id,raw_data,updated_at&id=like.lesson_*&order=updated_at.desc&limit=15`;
    const res = await fetch(url, {
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return rows.map(r => ({
      configId: r.id,
      lessonId: r.id.replace(/^lesson_/, ''),
      title: r.raw_data?.title || 'Bài giảng không tên',
      chapter: r.raw_data?.chapter || 'Chung',
      hasVideo: !!r.raw_data?.video,
      rawData: r.raw_data
    }));
  } catch (e) {
    return [];
  }
}

// 5. Gán video vào buổi học (lesson_*)
async function updateLessonOnSupabase(configId, videoMetadata) {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/configurations?id=eq.${encodeURIComponent(configId)}`;
  const getRes = await fetch(url, {
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
    }
  });
  let existingRaw = {};
  if (getRes.ok) {
    const rows = await getRes.json();
    if (rows && rows[0]?.raw_data) {
      existingRaw = rows[0].raw_data;
    }
  }

  const updatedRaw = {
    ...existingRaw,
    id: existingRaw.id || configId.replace(/^lesson_/, ''),
    video: videoMetadata,
    updatedAt: new Date().toISOString()
  };

  const upsertUrl = `${CONFIG.SUPABASE_URL}/rest/v1/configurations?on_conflict=id`;
  const postRes = await fetch(upsertUrl, {
    method: 'POST',
    headers: {
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify({
      id: configId,
      raw_data: updatedRaw,
      updated_at: new Date().toISOString()
    })
  });

  if (!postRes.ok) {
    const errText = await postRes.text();
    throw new Error(`Cập nhật Supabase thất bại (${postRes.status}): ${errText}`);
  }
}

// ==========================================
// TẢI CHUNK LÊN TELEGRAM QUA BOT API
// ==========================================
async function uploadChunkToTelegram(chunkPath, chunkName, index, total) {
  const fileBytes = fs.readFileSync(chunkPath);
  const blob = new Blob([fileBytes], { type: 'video/mp2t' });
  const tokens = CONFIG.TELEGRAM_BOT_TOKENS;

  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    // Xoay vòng token dựa theo index và lần thử
    const token = tokens[(index + attempt - 1) % tokens.length];
    try {
      const formData = new FormData();
      formData.append('chat_id', CONFIG.TELEGRAM_CHAT_ID);
      formData.append('caption', `🎬 HLS Chunk: ${chunkName} (#${index + 1}/${total})`);
      formData.append('document', blob, chunkName);

      const url = `https://api.telegram.org/bot${token}/sendDocument`;
      const res = await fetch(url, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (res.status === 429 || (data && data.error_code === 429)) {
        const retryAfter = (data.parameters && data.parameters.retry_after) || (attempt * 2);
        console.warn(`  ⚠️ Telegram Rate Limit 429! Đang chờ ${retryAfter}s... (lần ${attempt}/${CONFIG.MAX_RETRIES})`);
        await sleep(retryAfter * 1000 + 300);
        continue;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.description || `HTTP ${res.status}`);
      }

      const fileId = data.result?.document?.file_id;
      if (!fileId) throw new Error('Không nhận được file_id từ Telegram!');

      return fileId;
    } catch (err) {
      if (attempt === CONFIG.MAX_RETRIES) {
        throw new Error(`Upload ${chunkName} thất bại sau ${CONFIG.MAX_RETRIES} lần thử: ${err.message}`);
      }
      console.warn(`  ⚠️ Lỗi khi tải ${chunkName} (lần ${attempt}/${CONFIG.MAX_RETRIES}): ${err.message}. Thử lại sau 2s...`);
      await sleep(2000);
    }
  }
}

// ==========================================
// MAIN CONTROLLER
// ==========================================
async function main() {
  console.log('\n╔═════════════════════════════════════════════════════════════════════╗');
  console.log('║       QMATH VIDEO HLS STREAMING - TELEGRAM + CLOUDFLARE (FREE)      ║');
  console.log('╚═════════════════════════════════════════════════════════════════════╝\n');

  // 1. Kiểm tra FFmpeg
  const ffmpegBin = findFFmpegBinary();
  if (!ffmpegBin) {
    console.error('❌ KHÔNG TÌM THẤY FFMPEG TRÊN MÁY TÍNH!');
    console.error('👉 Vui lòng cài đặt FFmpeg bằng lệnh: winget install -e --id Gyan.FFmpeg');
    process.exit(1);
  }
  console.log(`✅ Đã tìm thấy FFmpeg: "${ffmpegBin}"`);

  // 2. Phân tích tham số dòng lệnh (CLI flags & arguments)
  const args = process.argv.slice(2);
  let inputVideo = '';
  let cliTitle = '';
  let cliCourseId = '';
  let cliLessonId = '';
  let cliWorker = '';
  let autoYes = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--title' && args[i + 1]) {
      cliTitle = args[++i];
    } else if (a === '--course' && args[i + 1]) {
      cliCourseId = args[++i];
    } else if (a === '--lesson' && args[i + 1]) {
      cliLessonId = args[++i];
    } else if (a === '--worker' && args[i + 1]) {
      cliWorker = args[++i];
    } else if (a === '--yes' || a === '-y') {
      autoYes = true;
    } else if (!a.startsWith('--') && !inputVideo) {
      inputVideo = a.replace(/^"|"$/g, '').trim();
    }
  }

  if (!inputVideo || !fs.existsSync(inputVideo)) {
    inputVideo = await ask('📹 Nhập đường dẫn file video (.mp4) hoặc kéo thả file vào đây');
    inputVideo = inputVideo.replace(/^"|"$/g, '').trim();
  }

  if (!inputVideo || !fs.existsSync(inputVideo)) {
    console.error(`❌ File video không tồn tại: "${inputVideo}"`);
    process.exit(1);
  }

  const stat = fs.statSync(inputVideo);
  console.log(`📂 Video nguồn: ${path.basename(inputVideo)} (${formatBytes(stat.size)})`);

  // 3. Tiêu đề bài giảng
  const defaultTitle = path.basename(inputVideo, path.extname(inputVideo));
  const videoTitle = cliTitle || (autoYes ? defaultTitle : await ask('📝 Tên / Tiêu đề bài giảng', defaultTitle));

  // 4. Cloudflare Worker Domain
  const workerDomain = (cliWorker || (autoYes ? CONFIG.DEFAULT_WORKER_DOMAIN : await ask('🌐 Cloudflare Worker Domain', CONFIG.DEFAULT_WORKER_DOMAIN))).replace(/\/+$/, '');

  // 5. Tạo thư mục tạm để chứa các mảnh HLS
  const tempDir = path.join(path.dirname(inputVideo), `_hls_temp_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const rawPlaylistPath = path.join(tempDir, 'playlist.m3u8');
  const segmentPattern = path.join(tempDir, 'chunk_%04d.ts');

  console.log('\n⚙️ Đang cắt video sang chuẩn HLS (-c copy, giữ nguyên chất lượng gốc)...');
  const tStartCut = Date.now();

  // Chạy FFmpeg cắt video: -c copy không giải mã lại nên chạy trong chớp mắt
  const ffmpegArgs = [
    '-y',
    '-i', inputVideo,
    '-c', 'copy',
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-f', 'hls',
    '-hls_time', String(CONFIG.CHUNK_DURATION_SECONDS),
    '-hls_list_size', '0',
    '-hls_segment_filename', segmentPattern,
    rawPlaylistPath
  ];

  const cutResult = spawnSync(ffmpegBin, ffmpegArgs, { stdio: 'inherit' });
  if (cutResult.status !== 0) {
    console.error('❌ Lỗi khi chạy FFmpeg để cắt HLS!');
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }

  const cutDuration = ((Date.now() - tStartCut) / 1000).toFixed(1);
  console.log(`⚡ Cắt video hoàn tất trong ${cutDuration} giây!`);

  // 6. Thu thập danh sách các chunk .ts
  const allFiles = fs.readdirSync(tempDir);
  const chunkFiles = allFiles.filter(f => f.endsWith('.ts')).sort();
  if (chunkFiles.length === 0) {
    console.error('❌ Không có mảnh video .ts nào được tạo ra!');
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }

  console.log(`📦 Tổng số phân đoạn video: ${chunkFiles.length} chunks`);

  // Kiểm tra kích thước từng chunk
  let maxChunkSize = 0;
  for (const f of chunkFiles) {
    const s = fs.statSync(path.join(tempDir, f)).size;
    if (s > maxChunkSize) maxChunkSize = s;
  }
  console.log(`📊 Kích thước phân đoạn lớn nhất: ${formatBytes(maxChunkSize)} (An toàn < 15MB: ${maxChunkSize < 15 * 1024 * 1024 ? '✅ ĐẠT' : '⚠️ LỚN'})`);

  if (maxChunkSize > 20 * 1024 * 1024) {
    console.warn('⚠️ CẢNH BÁO: Có phân đoạn lớn hơn 20MB. Telegram Bot API getFile có thể từ chối tải phân đoạn này.');
  }

  // 7. Tải từng chunk lên Telegram Channel
  console.log(`\n🚀 BẮT ĐẦU TẢI ${chunkFiles.length} PHÂN ĐOẠN LÊN TELEGRAM CHANNEL (${CONFIG.TELEGRAM_CHAT_ID})...`);
  const chunkToFileIdMap = {};
  const tStartUpload = Date.now();

  for (let i = 0; i < chunkFiles.length; i++) {
    const chunkName = chunkFiles[i];
    const chunkPath = path.join(tempDir, chunkName);
    const chunkSize = fs.statSync(chunkPath).size;
    const pct = Math.round(((i + 1) / chunkFiles.length) * 100);

    process.stdout.write(`  [${i + 1}/${chunkFiles.length}] (${pct}%) Đang tải ${chunkName} (${formatBytes(chunkSize)})... `);

    try {
      const fileId = await uploadChunkToTelegram(chunkPath, chunkName, i, chunkFiles.length);
      chunkToFileIdMap[chunkName] = fileId;
      console.log(`✅ OK! (file_id: ${fileId.slice(0, 14)}...)`);
    } catch (err) {
      console.error(`\n❌ THẤT BẠI: ${err.message}`);
      console.error('Tiến trình bị dừng lại. Bạn có thể thử lại sau.');
      process.exit(1);
    }

    if (i < chunkFiles.length - 1) {
      await sleep(CONFIG.DELAY_BETWEEN_CHUNKS_MS);
    }
  }

  const uploadDuration = ((Date.now() - tStartUpload) / 1000).toFixed(1);
  console.log(`\n🎉 ĐÃ TẢI LÊN TOÀN BỘ ${chunkFiles.length} CHUNKS TRONG ${uploadDuration}s!`);

  // 8. Đọc file playlist.m3u8 gốc và viết lại với URL Cloudflare Worker
  let rawPlaylistContent = fs.readFileSync(rawPlaylistPath, 'utf-8');
  let finalPlaylistContent = rawPlaylistContent;

  for (const [chunkName, fileId] of Object.entries(chunkToFileIdMap)) {
    const workerChunkUrl = `${workerDomain}/chunk/${fileId}.ts`;
    finalPlaylistContent = finalPlaylistContent.split(chunkName).join(workerChunkUrl);
  }

  // 9. Tính tổng thời lượng video từ file playlist
  let totalDurationSec = 0;
  const durationMatches = finalPlaylistContent.matchAll(/#EXTINF:([\d.]+),/g);
  for (const m of durationMatches) {
    totalDurationSec += parseFloat(m[1]) || 0;
  }
  totalDurationSec = Math.round(totalDurationSec);

  // 10. Chuẩn bị metadata hoàn chỉnh
  const videoMetadata = {
    type: 'hls',
    title: videoTitle,
    duration: totalDurationSec,
    size: stat.size,
    chunkCount: chunkFiles.length,
    channel: CONFIG.TELEGRAM_CHAT_ID.replace(/^@/, ''),
    workerDomain: workerDomain,
    m3u8: finalPlaylistContent,
    tmeUrl: `https://t.me/${CONFIG.TELEGRAM_CHAT_ID.replace(/^@/, '')}`,
    updatedAt: new Date().toISOString()
  };

  // 11. Lưu vào Thư viện Video HLS trung tâm (configurations -> hls_video_<id>)
  console.log('\n💾 Đang lưu video vào Thư viện HLS trung tâm Supabase...');
  try {
    const libId = await saveHlsVideoToLibrary(videoMetadata);
    videoMetadata.id = libId;
    console.log(`✅ ĐÃ LƯU VÀO THƯ VIỆN TRUNG TÂM! Mã video: "${libId}"`);
  } catch (err) {
    console.error(`⚠️ Không thể lưu vào thư viện trung tâm: ${err.message}`);
  }

  // 12. Tùy chọn gán vào Khóa học hoặc Buổi học
  if (cliCourseId) {
    console.log(`\n📚 Đang gán video vào Khóa học: ${cliCourseId}...`);
    try {
      const res = await attachVideoToCourse(cliCourseId, videoMetadata);
      console.log(`✅ ĐÃ GÁN THÀNH CÔNG VÀO KHÓA HỌC "${res.courseTitle}" (Item ID: ${res.itemId})!`);
    } catch (e) {
      console.error(`❌ Lỗi gán vào khóa học: ${e.message}`);
    }
  } else if (cliLessonId) {
    const targetConfigId = cliLessonId.startsWith('lesson_') ? cliLessonId : `lesson_${cliLessonId}`;
    console.log(`\n📝 Đang gán video vào buổi học: ${targetConfigId}...`);
    try {
      await updateLessonOnSupabase(targetConfigId, videoMetadata);
      console.log(`✅ ĐÃ GÁN THÀNH CÔNG VÀO BUỔI HỌC ${targetConfigId}!`);
    } catch (e) {
      console.error(`❌ Lỗi gán vào buổi học: ${e.message}`);
    }
  } else if (!autoYes) {
    console.log('\n--- TÙY CHỌN ĐỒNG BỘ GIÁO ÁN LMS ---');
    console.log('  [1] Gán trực tiếp vào một KHÓA HỌC (public_courses)');
    console.log('  [2] Gán vào một BUỔI HỌC (class_lessons / lesson_*)');
    console.log('  [0] Hoàn thành (Video đã có sẵn trong Thư viện để gắn bất kỳ lúc nào)');

    const syncChoice = await ask('👉 Chọn hình thức đồng bộ', '1');
    if (syncChoice === '1') {
      console.log('\n🔍 Đang tải danh sách Khóa học từ Supabase...');
      const courses = await fetchRecentCourses();
      if (courses.length > 0) {
        console.log('\n--- DANH SÁCH KHÓA HỌC GẦN ĐÂY ---');
        courses.forEach((c, idx) => {
          console.log(`  [${idx + 1}] ${c.title} (id: ${c.id})`);
        });
        const cNum = parseInt(await ask('👉 Chọn số thứ tự khóa học muốn gán video', '1'), 10);
        if (cNum >= 1 && cNum <= courses.length) {
          const selectedCourse = courses[cNum - 1];
          try {
            await attachVideoToCourse(selectedCourse.id, videoMetadata);
            console.log(`✅ ĐÃ GÁN THÀNH CÔNG VÀO KHÓA HỌC "${selectedCourse.title}"!`);
          } catch (e) {
            console.error(`❌ Lỗi: ${e.message}`);
          }
        }
      }
    } else if (syncChoice === '2') {
      console.log('\n🔍 Đang tải danh sách Buổi học từ Supabase...');
      const lessons = await fetchRecentLessons();
      if (lessons.length > 0) {
        console.log('\n--- DANH SÁCH BUỔI HỌC GẦN ĐÂY ---');
        lessons.forEach((l, idx) => {
          const vidIcon = l.hasVideo ? '🎬 [Đã có video]' : '⚪ [Chưa có video]';
          console.log(`  [${idx + 1}] ${l.title} (${l.chapter}) ${vidIcon} -> id: ${l.lessonId}`);
        });
        const lNum = parseInt(await ask('👉 Chọn số thứ tự buổi học muốn gán video', '1'), 10);
        if (lNum >= 1 && lNum <= lessons.length) {
          const selectedLesson = lessons[lNum - 1];
          try {
            await updateLessonOnSupabase(selectedLesson.configId, videoMetadata);
            console.log(`✅ ĐÃ GÁN THÀNH CÔNG VÀO BUỔI HỌC "${selectedLesson.title}"!`);
          } catch (e) {
            console.error(`❌ Lỗi: ${e.message}`);
          }
        }
      }
    }
  }

  // 13. Lưu bản sao cục bộ để backup
  const outJsonFile = path.join(path.dirname(inputVideo), `${path.basename(inputVideo, path.extname(inputVideo))}_HLS_METADATA.json`);
  const outM3u8File = path.join(path.dirname(inputVideo), `${path.basename(inputVideo, path.extname(inputVideo))}_playlist.m3u8`);

  fs.writeFileSync(outJsonFile, JSON.stringify(videoMetadata, null, 2), 'utf-8');
  fs.writeFileSync(outM3u8File, finalPlaylistContent, 'utf-8');
  console.log(`\n💾 Đã lưu file dự phòng trên máy:`);
  console.log(`  📄 Metadata JSON: "${outJsonFile}"`);
  console.log(`  📄 Playlist M3U8: "${outM3u8File}"`);

  // 14. Dọn dẹp thư mục tạm
  console.log('\n🧹 Đang xóa các phân đoạn tạm trên ổ cứng để tiết kiệm dung lượng...');
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('✅ Đã dọn dẹp thư mục tạm thành công.');
  } catch (err) {
    console.warn('⚠️ Không thể xóa thư mục tạm: ' + err.message);
  }

  console.log('\n╔═════════════════════════════════════════════════════════════════════╗');
  console.log('║                   HOÀN THÀNH XỬ LÝ & UPLOAD HLS!                    ║');
  console.log('╚═════════════════════════════════════════════════════════════════════╝\n');
}

main().catch(err => {
  console.error('\n❌ ĐÃ XẢY RA LỖI:', err);
  process.exit(1);
});
