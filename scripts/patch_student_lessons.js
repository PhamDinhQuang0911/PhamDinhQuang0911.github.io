const fs = require('fs');

const file = 'C:/Users/ADMIN/Documents/GitHub/PhamDinhQuang0911.github.io/student.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Change default layout to 'list'
const oldDefault = "window.studentLessonLayout = localStorage.getItem('qm_student_lesson_layout') || 'grid';";
const newDefault = "window.studentLessonLayout = localStorage.getItem('qm_student_lesson_layout') || 'list';";

if (!content.includes(oldDefault)) {
  console.error("Target oldDefault not found!");
  process.exit(1);
}
content = content.replace(oldDefault, newDefault);
console.log("[OK] Changed default layout to list");

// 2. Ensure controls always show in lessons subtab and update button styles
const oldUpdateBtns = `        window.updateLessonLayoutButtons = () => {
            const mode = window.studentLessonLayout || 'grid';
            const btnGrid = document.getElementById('btn-lesson-layout-grid');
            const btnList = document.getElementById('btn-lesson-layout-list');
            if (!btnGrid || !btnList) return;
            if (mode === 'grid') {
                btnGrid.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold text-primary-600 bg-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer';
                btnList.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-primary-600 transition-all flex items-center gap-1.5 cursor-pointer';
            } else {
                btnGrid.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-primary-600 transition-all flex items-center gap-1.5 cursor-pointer';
                btnList.className = 'px-2.5 py-1.5 rounded-lg text-xs font-bold text-primary-600 bg-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer';
            }
        };`;

const newUpdateBtns = `        window.updateLessonLayoutButtons = () => {
            const mode = window.studentLessonLayout || 'list';
            const btnGrid = document.getElementById('btn-lesson-layout-grid');
            const btnList = document.getElementById('btn-lesson-layout-list');
            if (btnGrid) {
                btnGrid.className = (mode === 'grid')
                    ? 'px-3 py-1.5 rounded-lg text-xs font-black text-primary-700 bg-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer border border-primary-100'
                    : 'px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-primary-600 transition-all flex items-center gap-1.5 cursor-pointer';
            }
            if (btnList) {
                btnList.className = (mode === 'list')
                    ? 'px-3 py-1.5 rounded-lg text-xs font-black text-primary-700 bg-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer border border-primary-100'
                    : 'px-3 py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:text-primary-600 transition-all flex items-center gap-1.5 cursor-pointer';
            }
        };`;

if (!content.includes(oldUpdateBtns)) {
  console.error("Target oldUpdateBtns not found!");
  process.exit(1);
}
content = content.replace(oldUpdateBtns, newUpdateBtns);
console.log("[OK] Updated updateLessonLayoutButtons");

// 3. Compact list view and compact grid view in renderStudentClassLessonsUI
const oldRenderListStart = "if (isListMode) {\n                    // --- 1. CHẾ ĐỘ DANH SÁCH THU NHỎ (COMPACT LIST VIEW) ---";
const oldRenderGridStart = "} else {\n                    // --- 2. CHẾ ĐỘ LƯỚI THẺ (GRID CARDS VIEW) ---";

// Locate the block of renderStudentClassLessonsUI
const startMarker = "window.renderStudentClassLessonsUI = (lessons) => {";
const endMarker = "lessonListEl.innerHTML = html;\n        };";

const startIdx = content.indexOf(startMarker);
const endIdx = content.indexOf(endMarker, startIdx);

if (startIdx === -1 || endIdx === -1) {
  console.error("Could not locate renderStudentClassLessonsUI range!");
  process.exit(1);
}

const newRenderCode = `window.renderStudentClassLessonsUI = (lessons) => {
            const lessonListEl = document.getElementById('classLessonList');
            if (!lessonListEl) return;

            const countEl = document.getElementById('studentLessonsTotalCount');
            if (countEl) {
                countEl.textContent = (lessons && lessons.length > 0) ? (lessons.length + ' bài giảng') : '';
            }

            if (!lessons || lessons.length === 0) {
                lessonListEl.innerHTML = '<div class="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 shadow-xs"><i class="fa-solid fa-book-open-reader text-4xl mb-3 text-gray-200"></i><p class="font-bold text-gray-600">Chưa có bài giảng ghi chép nào trong lớp này.</p><p class="text-xs text-gray-400 mt-1">Khi Thầy/Cô lưu bài viết bảng từ Bảng vẽ vào lớp, bài giảng sẽ xuất hiện tại đây.</p></div>';
                return;
            }

            const isListMode = (window.studentLessonLayout !== 'grid'); // Default is list mode
            const groups = new Map();
            lessons.forEach(item => {
                const chap = (item.chapter || 'Bài giảng trên lớp').trim();
                if (!groups.has(chap)) groups.set(chap, []);
                groups.get(chap).push(item);
            });

            let html = '';
            groups.forEach((items, chapterName) => {
                html += '<div class="bg-white p-3.5 md:p-5 rounded-2xl border border-primary-50 shadow-xs space-y-3">' +
                    '<div class="flex items-center justify-between border-b border-gray-100 pb-2.5">' +
                        '<div class="flex items-center gap-2">' +
                            '<span class="w-7 h-7 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center text-xs"><i class="fa-solid fa-folder-open"></i></span>' +
                            '<div>' +
                                '<h3 class="font-black text-gray-800 text-sm md:text-base leading-tight">' + chapterName + '</h3>' +
                                '<p class="text-[11px] text-gray-400 font-medium">' + items.length + ' bài ghi chép</p>' +
                            '</div>' +
                        '</div>' +
                        '<div class="flex items-center gap-1 bg-gray-100/80 p-0.5 rounded-lg border border-gray-200/50">' +
                            '<button type="button" onclick="window.changeLessonLayout(\\'list\\')" class="px-2 py-1 rounded text-[11px] font-bold ' + (isListMode ? 'bg-white text-primary-600 shadow-2xs' : 'text-gray-400 hover:text-gray-600') + '" title="Danh sách thu gọn"><i class="fa-solid fa-list-ul"></i></button>' +
                            '<button type="button" onclick="window.changeLessonLayout(\\'grid\\')" class="px-2 py-1 rounded text-[11px] font-bold ' + (!isListMode ? 'bg-white text-primary-600 shadow-2xs' : 'text-gray-400 hover:text-gray-600') + '" title="Lưới xem trước"><i class="fa-solid fa-border-all"></i></button>' +
                        '</div>' +
                    '</div>';

                if (isListMode) {
                    // --- 1. CHẾ ĐỘ DANH SÁCH GỌN GÀNG (ULTRA COMPACT ROW) ---
                    html += '<div class="divide-y divide-gray-100/80 bg-gray-50/40 rounded-xl border border-gray-200/60 overflow-hidden">';
                    items.forEach(lesson => {
                        const safeTitle = String(lesson.title || 'Bài giảng').replace(/'/g, "\\\\\\'").replace(/"/g, '&quot;');
                        const dateStr = lesson.lessonDate
                            ? new Date(lesson.lessonDate).toLocaleDateString('vi-VN')
                            : (lesson.updatedAt ? new Date(lesson.updatedAt).toLocaleDateString('vi-VN') : '---');
                        const pageCount = lesson.pageCount || 1;
                        const hasVideo = !!(lesson.video && (lesson.video.streamUrl || lesson.video.fileId || lesson.video.tmeUrl || lesson.video.m3u8 || lesson.video.type === 'hls'));
                        const matCount = Array.isArray(lesson.materials) ? lesson.materials.length : 0;

                        const thumbHtml = lesson.coverUrl
                            ? '<img src="' + lesson.coverUrl + '" class="w-12 h-10 md:w-14 md:h-11 object-cover object-top rounded-lg border border-gray-200 shrink-0 bg-slate-900" onerror="this.style.display=\\'none\\'">'
                            : '<div class="w-12 h-10 md:w-14 md:h-11 bg-slate-800 rounded-lg flex flex-col items-center justify-center text-amber-400 shrink-0 border border-slate-700/50"><i class="fa-solid fa-chalkboard-user text-sm"></i><span class="text-[8px] text-slate-400 font-semibold">' + pageCount + ' tr</span></div>';

                        html += '<div class="px-2.5 py-2 md:px-3 md:py-2.5 hover:bg-white transition-colors flex items-center justify-between gap-2.5 group cursor-pointer" onclick="window.openStudentLessonViewer(\\'' + lesson.id + '\\', \\'' + safeTitle + '\\')">' +
                            '<div class="flex items-center gap-2.5 min-w-0 flex-1">' +
                                '<div class="relative shrink-0">' +
                                    thumbHtml +
                                    (hasVideo ? '<span class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[7px] shadow-xs"><i class="fa-solid fa-play"></i></span>' : '') +
                                '</div>' +
                                '<div class="min-w-0 flex-1">' +
                                    '<div class="flex items-center gap-1.5 flex-wrap">' +
                                        '<h4 class="font-bold text-gray-800 text-xs md:text-sm group-hover:text-primary-600 transition-colors truncate">' + (lesson.title || 'Bài giảng') + '</h4>' +
                                        (hasVideo ? '<span class="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">Video</span>' : '') +
                                        (matCount > 0 ? '<span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0"><i class="fa-solid fa-paperclip"></i> ' + matCount + '</span>' : '') +
                                    '</div>' +
                                    '<div class="flex items-center gap-2 text-[10px] md:text-[11px] text-gray-400 font-medium mt-0.5">' +
                                        '<span><i class="fa-regular fa-calendar mr-1"></i>' + dateStr + '</span>' +
                                        (lesson.teacherName ? '<span class="hidden sm:inline"><i class="fa-solid fa-chalkboard-user mr-1"></i>' + lesson.teacherName + '</span>' : '') +
                                        '<span><i class="fa-regular fa-file-lines mr-1"></i>' + pageCount + ' trang</span>' +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">' +
                                (hasVideo ? '<button type="button" onclick="window.openStudentVideoPlayer(\\'' + lesson.id + '\\')" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer" title="Phát video"><i class="fa-solid fa-circle-play text-emerald-600"></i> <span class="hidden sm:inline text-[11px]">Video</span></button>' : '') +
                                '<button type="button" onclick="window.openStudentLessonViewer(\\'' + lesson.id + '\\', \\'' + safeTitle + '\\')" class="px-2.5 py-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"><i class="fa-solid fa-book-open text-[11px]"></i> <span class="text-[11px]">Xem</span></button>' +
                                '<button type="button" onclick="window.open(\\'https://note.qmath.io.vn/?view=\\' + encodeURIComponent(\\'' + lesson.id + '\\') + \\'&export=pdf\\', \\'_blank\\')" class="p-1 w-6 h-6 rounded-lg bg-white hover:bg-rose-50 text-gray-500 hover:text-rose-600 border border-gray-200 text-[10px] font-bold flex items-center justify-center transition cursor-pointer" title="Tải PDF"><i class="fa-solid fa-file-pdf"></i></button>' +
                            '</div>' +
                        '</div>';
                    });
                    html += '</div>';
                } else {
                    // --- 2. CHẾ ĐỘ LƯỚI THẺ THU GỌN (COMPACT GRID CARDS) ---
                    html += '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">';
                    items.forEach(lesson => {
                        const safeTitle = String(lesson.title || 'Bài giảng').replace(/'/g, "\\\\\\'").replace(/"/g, '&quot;');
                        const dateStr = lesson.lessonDate
                            ? new Date(lesson.lessonDate).toLocaleDateString('vi-VN')
                            : (lesson.updatedAt ? new Date(lesson.updatedAt).toLocaleDateString('vi-VN') : '---');
                        const pageCount = lesson.pageCount || 1;
                        const hasVideo = !!(lesson.video && (lesson.video.streamUrl || lesson.video.fileId || lesson.video.tmeUrl || lesson.video.m3u8 || lesson.video.type === 'hls'));
                        const matCount = Array.isArray(lesson.materials) ? lesson.materials.length : 0;

                        const coverHtml = lesson.coverUrl
                            ? '<img src="' + lesson.coverUrl + '" class="w-full h-24 object-cover object-top bg-slate-900 rounded-lg border border-gray-100 mb-2" onerror="this.style.display=\\'none\\'">'
                            : '<div class="w-full h-20 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg flex flex-col items-center justify-center text-amber-400 mb-2"><i class="fa-solid fa-chalkboard-user text-xl mb-0.5"></i><span class="text-[10px] text-slate-300 font-semibold">' + pageCount + ' trang</span></div>';

                        html += '<div class="bg-gray-50/60 hover:bg-white p-3 rounded-xl border border-gray-200/80 hover:border-primary-300 hover:shadow-sm transition-all flex flex-col justify-between group cursor-pointer relative" onclick="window.openStudentLessonViewer(\\'' + lesson.id + '\\', \\'' + safeTitle + '\\')">' +
                            '<div>' +
                                '<div class="relative">' +
                                    coverHtml +
                                    '<span class="absolute top-1.5 right-1.5 bg-black/75 text-white text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-xs">' + pageCount + ' trang</span>' +
                                    (hasVideo ? '<span class="absolute top-1.5 left-1.5 bg-emerald-600/90 text-white text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs backdrop-blur-xs"><i class="fa-solid fa-circle-play"></i> Video</span>' : '') +
                                '</div>' +
                                '<h4 class="font-bold text-gray-800 text-xs md:text-sm group-hover:text-primary-600 transition-colors line-clamp-1 mb-1">' + (lesson.title || 'Bài giảng') + '</h4>' +
                                '<div class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-gray-400 font-medium mb-2">' +
                                    '<span><i class="fa-regular fa-calendar mr-1"></i>' + dateStr + '</span>' +
                                    (lesson.teacherName ? '<span><i class="fa-solid fa-chalkboard-user mr-1"></i>' + lesson.teacherName + '</span>' : '') +
                                '</div>' +
                            '</div>' +
                            '<div class="pt-2 border-t border-gray-200/60 flex items-center gap-1 mt-auto" onclick="event.stopPropagation()">' +
                                (hasVideo ? '<button type="button" onclick="window.openStudentVideoPlayer(\\'' + lesson.id + '\\')" class="py-1 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-lg border border-emerald-200 transition flex items-center justify-center gap-1 cursor-pointer"><i class="fa-solid fa-circle-play text-xs"></i> <span>Video</span></button>' : '') +
                                '<button type="button" onclick="window.openStudentLessonViewer(\\'' + lesson.id + '\\', \\'' + safeTitle + '\\')" class="flex-1 py-1 px-2 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-bold rounded-lg shadow-2xs transition flex items-center justify-center gap-1 cursor-pointer">' +
                                    '<i class="fa-solid fa-book-open"></i> Xem bài' +
                                '</button>' +
                                '<button type="button" onclick="window.open(\\'https://note.qmath.io.vn/?view=\\' + encodeURIComponent(\\'' + lesson.id + '\\') + \\'&export=pdf\\', \\'_blank\\')" class="py-1 px-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-bold rounded-lg transition flex items-center justify-center gap-1 cursor-pointer" title="PDF">' +
                                    '<i class="fa-solid fa-file-pdf"></i>' +
                                '</button>' +
                            '</div>' +
                        '</div>';
                    });
                    html += '</div>';
                }

                html += '</div>';
            });

            lessonListEl.innerHTML = html;
        };`;

content = content.slice(0, startIdx) + newRenderCode + content.slice(endIdx + endMarker.length);
console.log("[OK] Replaced renderStudentClassLessonsUI with ultra-compact views");

fs.writeFileSync(file, content, 'utf8');
console.log("[OK] Saved student.html successfully!");
