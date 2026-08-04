const fs = require('fs');
let content = fs.readFileSync('exam.html', 'utf8');

const regex1 = /if \(examData\.type === 'homework' \|\| examData\.type === 'mixed'\) \{\s*if \(!isResume && window\.examHistory && window\.examHistory\.length > 0\)/g;
const regex2 = /const isHomeworkOrMixed = examData\.type === 'homework' \|\| examData\.type === 'mixed';\s*if \(isHomeworkOrMixed && !isResume && window\.examHistory && window\.examHistory\.length > 0\)/g;
const regex3 = /const imgSrc = img\.src;\s*const uniqueId = 'img-item-' \+ idx \+ '-' \+ Date\.now\(\);\s*const imgItem = document\.createElement\('div'\);\s*imgItem\.className = 'relative inline-block w-full border-2 border-gray-200 rounded-xl bg-white shadow-sm';\s*imgItem\.id = uniqueId;\s*imgItem\.innerHTML = `\s*<img src="\$\{imgSrc\}" class="w-full h-auto block rounded-xl" loading="lazy">/g;

console.log('Fix 1 matched:', regex1.test(content));
console.log('Fix 2 matched:', regex2.test(content));
console.log('Fix 3 matched:', regex3.test(content));

const gradedSummaryOld = `try {
                const oldSum = document.getElementById('mixedGradedSummary');
                if (oldSum) oldSum.remove();
                const r0 = window.currentResultData;
                if (isMixed && window.isReviewMode && r0 && r0.gradedAt) {
                    const urls = r0.gradedImageUrls || (r0.gradedImageUrl ? [r0.gradedImageUrl] : []);
                    let imgs = '';
                    urls.forEach((url) => { imgs += \`<a href="\${url}" target="_blank" title="Bấm để phóng to" class="block mb-4"><img src="\${url}" class="w-full h-auto rounded-xl border-2 border-gray-200 shadow-sm hover:border-green-300 transition-colors"></a>\`; });
                    const fb = (r0.teacherFeedback || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const div = document.createElement('div');
                    div.id = 'mixedGradedSummary';
                    div.className = 'bg-white p-6 rounded-2xl shadow-sm border-2 border-green-200 mb-6';
                    div.innerHTML = \`
                        <div class="flex items-center justify-between flex-wrap gap-3 mb-4 border-b border-gray-100 pb-3">
                            <h3 class="font-black text-gray-800 text-lg"><i class="fa-solid fa-clipboard-check text-green-600"></i> Bài chấm của giáo viên</h3>
                            <div class="px-4 py-1.5 bg-orange-50 border border-orange-200 rounded-xl text-orange-700 font-black text-lg">Điểm: \${r0.score !== undefined ? r0.score : '?'}</div>
                        </div>
                        \${fb ? \`<div class="bg-primary-50 p-4 rounded-xl border border-primary-100 mb-4"><div class="text-xs font-black text-primary-800 uppercase mb-2"><i class="fa-solid fa-comment-dots"></i> Nhận xét của giáo viên (theo từng câu)</div><div class="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">\${fb}</div></div>\` : ''}
                        \${imgs ? \`<div><div class="text-xs font-black text-gray-500 uppercase mb-2"><i class="fa-solid fa-image"></i> Ảnh bài chấm (AI khoanh lỗi / giáo viên viết trực tiếp)</div>\${imgs}</div>\` : ''}
                        \${(!fb && !imgs) ? '<p class="text-sm text-gray-400 italic">Giáo viên đã chấm điểm (chưa có nhận xét chi tiết).</p>' : ''}
                    \`;
                    const anchorEl = document.getElementById('hwIframeContainer');
                    if (anchorEl && anchorEl.parentElement) anchorEl.parentElement.insertBefore(div, anchorEl);
                }
            } catch (eG) { console.warn("graded summary:", eG); }`;

console.log('Fix 4 matched:', content.includes(gradedSummaryOld));
