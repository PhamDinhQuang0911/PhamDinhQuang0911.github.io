#!/usr/bin/env node

/**
 * ============================================================================
 * QMATH HLS VIDEO STUDIO - GIAO DIỆN WEB 1-CLICK UPLOADER
 * ============================================================================
 * Chức năng:
 *  1. Cung cấp giao diện web trực quan tại http://localhost:3344
 *  2. Chọn file video MP4, chọn Khóa học & Bài học từ Supabase.
 *  3. Bấm 1 nút "LƯU VÀO KHO THEO BÀI HỌC": Tự động cắt HLS siêu tốc, đẩy lên Telegram,
 *     ghi trực tiếp vào giáo án Supabase và hiển thị tiến độ 0% -> 100%.
 * ============================================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync, exec } = require('child_process');

const PORT = 3344;

const CONFIG = {
  TELEGRAM_BOT_TOKENS: (process.env.TELEGRAM_BOT_TOKENS || process.env.TELEGRAM_BOT_TOKEN || '8662985318:AAHIweMUW706XKIXFi-bFisaFoE7hZaMHDo')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean),
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '@kho_video_qmath_2026',
  DEFAULT_WORKER_DOMAIN: 'https://tg-hls.phamngockhanh-942001.workers.dev',
  SUPABASE_URL: 'https://cuniqanbumcrqcdlcvad.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE4MTMsImV4cCI6MjEwNDUxNzgxM30.MWSv1QKVlQ9r-8r0hkrqWsmm75hULq_VjPCbTqXDe-o',
  CHUNK_DURATION_SECONDS: 6,
  DELAY_BETWEEN_CHUNKS_MS: 700,
  MAX_RETRIES: 5
};

function findFFmpegBinary() {
  try {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    if (res.status === 0) return 'ffmpeg';
  } catch (e) {}

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

  const progFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  for (const pf of progFiles) {
    const guess = path.join(pf, 'ffmpeg', 'bin', 'ffmpeg.exe');
    if (fs.existsSync(guess)) return guess;
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function fetchCourses() {
  const url = `${CONFIG.SUPABASE_URL}/rest/v1/public_courses?select=id,title,curriculum,updated_at&order=updated_at.desc&limit=30`;
  const res = await fetch(url, {
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) return [];
  return await res.json();
}

async function uploadChunkToTelegram(chunkPath, chunkName, index, total, logCb) {
  const fileBytes = fs.readFileSync(chunkPath);
  const blob = new Blob([fileBytes], { type: 'video/mp2t' });
  const tokens = CONFIG.TELEGRAM_BOT_TOKENS;

  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    const token = tokens[(index + attempt - 1) % tokens.length];
    try {
      const formData = new FormData();
      formData.append('chat_id', CONFIG.TELEGRAM_CHAT_ID);
      formData.append('caption', `🎬 HLS Chunk: ${chunkName} (#${index + 1}/${total})`);
      formData.append('document', blob, chunkName);

      const url = `https://api.telegram.org/bot${token}/sendDocument`;
      const res = await fetch(url, { method: 'POST', body: formData });
      const data = await res.json();

      if (res.status === 429 || (data && data.error_code === 429)) {
        const retryAfter = (data.parameters && data.parameters.retry_after) || (attempt * 2);
        logCb(`⚠️ Telegram Rate Limit 429! Đang chờ ${retryAfter}s...`);
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
      if (attempt === CONFIG.MAX_RETRIES) throw err;
      logCb(`⚠️ Lỗi tải ${chunkName} (${err.message}), thử lại sau 2s...`);
      await sleep(2000);
    }
  }
}

async function processVideoAndUpload(options, progressCb) {
  const { inputVideo, videoTitle, courseId, chapterIdx, lessonIdx, workerDomain = CONFIG.DEFAULT_WORKER_DOMAIN } = options;

  const ffmpegBin = findFFmpegBinary();
  if (!ffmpegBin) throw new Error('Không tìm thấy FFmpeg trên máy tính!');

  if (!fs.existsSync(inputVideo)) throw new Error(`File video không tồn tại: ${inputVideo}`);
  const stat = fs.statSync(inputVideo);

  progressCb({ step: 'cut', percent: 5, message: `Bắt đầu cắt HLS (-c copy siêu tốc) cho file ${path.basename(inputVideo)} (${formatBytes(stat.size)})...` });

  const tempDir = path.join(path.dirname(inputVideo), `_hls_temp_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const rawPlaylistPath = path.join(tempDir, 'playlist.m3u8');
  const segmentPattern = path.join(tempDir, 'chunk_%04d.ts');

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

  const cutResult = spawnSync(ffmpegBin, ffmpegArgs, { stdio: 'ignore' });
  if (cutResult.status !== 0) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    throw new Error('FFmpeg cắt video thất bại!');
  }

  const chunkFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.ts')).sort();
  if (chunkFiles.length === 0) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    throw new Error('Không có phân đoạn video nào được tạo ra!');
  }

  progressCb({ step: 'upload', percent: 10, message: `Đã cắt thành ${chunkFiles.length} phân đoạn. Bắt đầu đẩy lên Telegram Channel...` });

  const chunkToFileIdMap = {};
  for (let i = 0; i < chunkFiles.length; i++) {
    const chunkName = chunkFiles[i];
    const chunkPath = path.join(tempDir, chunkName);
    const chunkSize = fs.statSync(chunkPath).size;

    const fileId = await uploadChunkToTelegram(chunkPath, chunkName, i, chunkFiles.length, (msg) => {
      progressCb({ step: 'upload', percent: Math.round(10 + ((i / chunkFiles.length) * 80)), message: msg });
    });

    chunkToFileIdMap[chunkName] = fileId;
    const pct = Math.round(10 + (((i + 1) / chunkFiles.length) * 80));
    progressCb({
      step: 'upload',
      percent: pct,
      current: i + 1,
      total: chunkFiles.length,
      message: `[${i + 1}/${chunkFiles.length}] Đã tải ${chunkName} (${formatBytes(chunkSize)})`
    });

    if (i < chunkFiles.length - 1) {
      await sleep(CONFIG.DELAY_BETWEEN_CHUNKS_MS);
    }
  }

  // Thay thế file_id trong .m3u8
  progressCb({ step: 'finalize', percent: 92, message: 'Đang hoàn tất danh sách phát M3U8...' });
  let rawPlaylistContent = fs.readFileSync(rawPlaylistPath, 'utf-8');
  let finalPlaylistContent = rawPlaylistContent;
  for (const [chunkName, fileId] of Object.entries(chunkToFileIdMap)) {
    const workerChunkUrl = `${workerDomain}/chunk/${fileId}.ts`;
    finalPlaylistContent = finalPlaylistContent.split(chunkName).join(workerChunkUrl);
  }

  let totalDurationSec = 0;
  const durationMatches = finalPlaylistContent.matchAll(/#EXTINF:([\d.]+),/g);
  for (const m of durationMatches) {
    totalDurationSec += parseFloat(m[1]) || 0;
  }
  totalDurationSec = Math.round(totalDurationSec);

  const videoMetadata = {
    type: 'hls',
    title: videoTitle || path.basename(inputVideo, path.extname(inputVideo)),
    duration: totalDurationSec,
    size: stat.size,
    chunkCount: chunkFiles.length,
    channel: CONFIG.TELEGRAM_CHAT_ID.replace(/^@/, ''),
    workerDomain: workerDomain,
    m3u8: finalPlaylistContent,
    tmeUrl: `https://t.me/${CONFIG.TELEGRAM_CHAT_ID.replace(/^@/, '')}`,
    updatedAt: new Date().toISOString()
  };

  // Lưu vào Thư viện trung tâm
  const videoId = `hls_video_${Date.now()}`;
  videoMetadata.id = videoId;
  await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/configurations?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: videoId,
      raw_data: videoMetadata,
      updated_at: new Date().toISOString()
    })
  });

  // Gán vào khóa học nếu được chỉ định
  if (courseId && courseId !== 'none') {
    progressCb({ step: 'sync', percent: 96, message: 'Đang gắn video trực tiếp vào bài học trên Supabase...' });
    const getRes = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/public_courses?id=eq.${encodeURIComponent(courseId)}&select=id,title,curriculum`, {
      headers: { apikey: CONFIG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}` }
    });
    const cRows = await getRes.json();
    if (cRows && cRows.length > 0) {
      const course = cRows[0];
      let curriculum = Array.isArray(course.curriculum) ? course.curriculum : [];
      if (curriculum.length === 0) {
        curriculum.push({ title: 'Chương 1', lessons: [{ title: 'Bài học 1', items: [] }] });
      }

      const cIdx = Math.min(Math.max(0, parseInt(chapterIdx, 10) || 0), curriculum.length - 1);
      const chapter = curriculum[cIdx];
      if (!Array.isArray(chapter.lessons) || chapter.lessons.length === 0) {
        chapter.lessons = [{ title: 'Bài học 1', items: [] }];
      }
      const lIdx = Math.min(Math.max(0, parseInt(lessonIdx, 10) || 0), chapter.lessons.length - 1);
      const lesson = chapter.lessons[lIdx];
      if (!Array.isArray(lesson.items)) lesson.items = [];

      const newItem = {
        id: `it_${Date.now()}`,
        type: 'video',
        videoType: 'hls',
        title: videoMetadata.title,
        content: `${workerDomain}/playlist/${videoId}.m3u8`,
        m3u8: videoMetadata.m3u8,
        duration: videoMetadata.duration,
        chunkCount: videoMetadata.chunkCount,
        minWatchTime: Math.max(1, Math.round(videoMetadata.duration / 120)),
        isPublished: true
      };

      lesson.items.push(newItem);

      await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/public_courses?id=eq.${encodeURIComponent(courseId)}`, {
        method: 'PATCH',
        headers: {
          apikey: CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ curriculum: curriculum, updated_at: new Date().toISOString() })
      });
    }
  }

  // Dọn dẹp tạm
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

  progressCb({
    step: 'done',
    percent: 100,
    videoId: videoId,
    duration: totalDurationSec,
    message: '🎉 HOÀN THÀNH XUẤT SẮC! Video đã sẵn sàng trên Web LMS.'
  });

  return videoMetadata;
}

// ==========================================
// HTML GIAO DIỆN WEB STUDIO
// ==========================================
const HTML_PAGE = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QMath HLS Studio - Tải Video Lên Telegram 1-Click</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen flex flex-col items-center justify-center p-4 md:p-6">
    <div class="max-w-2xl w-full bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
        <!-- Header -->
        <div class="flex items-center gap-3.5 mb-6 pb-5 border-b border-slate-700/60">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-sky-500/30 text-2xl">
                <i class="fa-brands fa-telegram"></i>
            </div>
            <div>
                <h1 class="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                    Lưu Video Vào Kho Theo Bài Học
                    <span class="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">100% Free</span>
                </h1>
                <p class="text-xs text-slate-400 mt-0.5">Tự động cắt HLS siêu tốc, đẩy lên Telegram Channel & Gắn thẳng vào khóa học</p>
            </div>
        </div>

        <!-- Form -->
        <div id="formSection" class="space-y-5">
            <!-- 1. Đường dẫn video -->
            <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>1. File Video (.mp4) trên máy tính</span>
                    <span class="text-slate-400 font-normal">Hỗ trợ 500MB, 1GB, 2GB</span>
                </label>
                <div class="relative">
                    <input type="text" id="videoPath" class="w-full pl-10 pr-24 py-3 bg-slate-900/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono transition-all" placeholder="Dán đường dẫn hoặc kéo thả file vào đây...">
                    <i class="fa-solid fa-file-video absolute left-3.5 top-3.5 text-slate-500"></i>
                    <button type="button" onclick="browseFilePrompt()" class="absolute right-2 top-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-xs font-bold text-slate-200 rounded-lg transition-colors">
                        Chọn file
                    </button>
                </div>
            </div>

            <!-- 2. Tên bài giảng -->
            <div>
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">2. Tiêu đề bài giảng hiển thị cho học sinh</label>
                <div class="relative">
                    <input type="text" id="videoTitle" class="w-full pl-10 pr-4 py-3 bg-slate-900/90 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-all" placeholder="Ví dụ: Chuyên đề Hàm số - Buổi 01">
                    <i class="fa-solid fa-heading absolute left-3.5 top-3.5 text-slate-500"></i>
                </div>
            </div>

            <!-- 3. Chọn Khóa học & Bài học -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">3. Khóa học muốn gán video</label>
                    <select id="courseSelect" onchange="onCourseChanged()" class="w-full px-3.5 py-3 bg-slate-900/90 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500">
                        <option value="none">-- Chỉ lưu vào Thư viện HLS (không gán) --</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">Bài học trong khóa</label>
                    <select id="lessonSelect" class="w-full px-3.5 py-3 bg-slate-900/90 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-sky-500">
                        <option value="0:0">Chương 1 - Bài 1</option>
                    </select>
                </div>
            </div>

            <!-- Action Button -->
            <div class="pt-2">
                <button id="btnSubmit" onclick="startUploadProcess()" class="w-full py-4 bg-gradient-to-r from-sky-500 via-teal-500 to-emerald-500 hover:from-sky-400 hover:via-teal-400 hover:to-emerald-400 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-sky-500/20 flex items-center justify-center gap-2.5 transition-all transform active:scale-[0.99] cursor-pointer">
                    <i class="fa-solid fa-cloud-arrow-up text-xl"></i>
                    <span>🚀 LƯU VÀO KHO THEO BÀI HỌC (1-CLICK)</span>
                </button>
            </div>
        </div>

        <!-- Progress Section -->
        <div id="progressSection" class="hidden mt-6 pt-5 border-t border-slate-700/60 space-y-4">
            <div class="flex items-center justify-between text-xs">
                <span id="progressMessage" class="text-slate-300 font-bold truncate max-w-[80%]">Đang chuẩn bị...</span>
                <span id="progressPercent" class="text-sky-400 font-black text-sm">0%</span>
            </div>
            <div class="w-full bg-slate-900 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
                <div id="progressBar" class="bg-gradient-to-r from-sky-500 to-emerald-400 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
            <div id="progressLog" class="p-3 bg-slate-950/70 rounded-xl border border-slate-800 text-[11px] text-slate-400 font-mono max-h-36 overflow-y-auto space-y-1">
                <div>[Hệ thống] Sẵn sàng thực thi tiến trình...</div>
            </div>
        </div>
    </div>

    <script>
        let cachedCourses = [];

        async function init() {
            try {
                const res = await fetch('/api/courses');
                cachedCourses = await res.json();
                const sel = document.getElementById('courseSelect');
                sel.innerHTML = '<option value="none">-- Chỉ lưu vào Thư viện HLS (không gán) --</option>';
                cachedCourses.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.title;
                    sel.appendChild(opt);
                });
                onCourseChanged();
            } catch(e) {
                console.error(e);
            }
        }

        function onCourseChanged() {
            const cId = document.getElementById('courseSelect').value;
            const lSel = document.getElementById('lessonSelect');
            lSel.innerHTML = '';
            if (cId === 'none') {
                lSel.innerHTML = '<option value="0:0">Không gán vào khóa học</option>';
                lSel.disabled = true;
                return;
            }
            lSel.disabled = false;
            const found = cachedCourses.find(c => c.id === cId);
            if (!found || !Array.isArray(found.curriculum) || found.curriculum.length === 0) {
                lSel.innerHTML = '<option value="0:0">Chương mới - Bài mới</option>';
                return;
            }
            found.curriculum.forEach((chap, cIdx) => {
                const lessons = Array.isArray(chap.lessons) ? chap.lessons : [];
                lessons.forEach((les, lIdx) => {
                    const opt = document.createElement('option');
                    opt.value = cIdx + ':' + lIdx;
                    opt.textContent = (chap.title || 'Chương ' + (cIdx+1)) + ' > ' + (les.title || 'Bài ' + (lIdx+1));
                    lSel.appendChild(opt);
                });
            });
            if (lSel.options.length === 0) {
                lSel.innerHTML = '<option value="0:0">Chương 1 > Bài 1</option>';
            }
        }

        function browseFilePrompt() {
            const p = prompt('Nhập hoặc dán đường dẫn file video (.mp4) trên máy tính:');
            if (p) {
                document.getElementById('videoPath').value = p.replace(/^"|"$/g, '').trim();
                const fileName = p.split(/[/\\\\]/).pop().replace(/\\.[^/.]+$/, "");
                if (!document.getElementById('videoTitle').value) {
                    document.getElementById('videoTitle').value = fileName;
                }
            }
        }

        // Kéo thả file trực tiếp vào input
        const dropArea = document.getElementById('videoPath');
        dropArea.addEventListener('dragover', (e) => e.preventDefault());
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.path) {
                    dropArea.value = file.path;
                    const fileName = file.name.replace(/\\.[^/.]+$/, "");
                    if (!document.getElementById('videoTitle').value) {
                        document.getElementById('videoTitle').value = fileName;
                    }
                }
            }
        });

        async function startUploadProcess() {
            const inputVideo = document.getElementById('videoPath').value.trim();
            const videoTitle = document.getElementById('videoTitle').value.trim();
            const courseId = document.getElementById('courseSelect').value;
            const lessonCoord = document.getElementById('lessonSelect').value.split(':');
            const chapterIdx = lessonCoord[0] || 0;
            const lessonIdx = lessonCoord[1] || 0;

            if (!inputVideo) {
                alert('Vui lòng nhập đường dẫn file video (.mp4)!');
                return;
            }

            document.getElementById('btnSubmit').disabled = true;
            document.getElementById('btnSubmit').classList.add('opacity-50', 'cursor-not-allowed');
            document.getElementById('progressSection').classList.remove('hidden');

            const logBox = document.getElementById('progressLog');
            function addLog(text) {
                const div = document.createElement('div');
                div.textContent = text;
                logBox.appendChild(div);
                logBox.scrollTop = logBox.scrollHeight;
            }

            // Gọi API
            try {
                const res = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inputVideo, videoTitle, courseId, chapterIdx, lessonIdx })
                });

                const reader = res.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\\n');
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const data = JSON.parse(line.slice(6));
                            document.getElementById('progressPercent').innerText = data.percent + '%';
                            document.getElementById('progressBar').style.width = data.percent + '%';
                            document.getElementById('progressMessage').innerText = data.message;
                            addLog('[' + data.percent + '%] ' + data.message);

                            if (data.step === 'done') {
                                document.getElementById('btnSubmit').disabled = false;
                                document.getElementById('btnSubmit').classList.remove('opacity-50', 'cursor-not-allowed');
                                alert('🎉 ĐÃ LƯU VÀO KHO THEO BÀI HỌC THÀNH CÔNG! Học sinh có thể xem ngay.');
                            }
                        } catch(err) {}
                    }
                }
            } catch(e) {
                addLog('❌ LỖI: ' + e.message);
                alert('Đã xảy ra lỗi: ' + e.message);
                document.getElementById('btnSubmit').disabled = false;
                document.getElementById('btnSubmit').classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }

        init();
    </script>
</body>
</html>`;

// ==========================================
// HTTP SERVER
// ==========================================
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_PAGE);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/courses') {
    try {
      const courses = await fetchCourses();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(courses));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/upload') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        const sendProgress = (data) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        await processVideoAndUpload(payload, sendProgress);
        res.end();
      } catch (err) {
        res.write(`data: ${JSON.stringify({ step: 'error', percent: 0, message: 'Lỗi: ' + err.message })}\n\n`);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n=============================================================`);
  console.log(`  QMATH HLS VIDEO STUDIO - 1-CLICK UPLOADER ĐANG CHẠY!`);
  console.log(`  👉 Đang mở trình duyệt tại: http://localhost:${PORT}`);
  console.log(`=============================================================\n`);

  // Tự động mở trình duyệt
  const startCmd = process.platform === 'win32' ? `start http://localhost:${PORT}` : `open http://localhost:${PORT}`;
  exec(startCmd);
});
