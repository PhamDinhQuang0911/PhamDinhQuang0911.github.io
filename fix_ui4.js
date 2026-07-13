const fs = require('fs');
let c = fs.readFileSync('exam.html', 'utf8');

// Replace the whole submittedWrapper section + inject logic
// with a version that directly builds each image with a delete button
const oldSection = `                // 1. Khu vực hiển thị ảnh đã tải lên
                const submittedWrapper = document.createElement('div');
                submittedWrapper.id = \`submitted-area-wrapper-0\`;
                submittedWrapper.className = userAnswers[0] ? "bg-blue-50 p-5 rounded-2xl border border-blue-200 mb-4" : "hidden";
                submittedWrapper.innerHTML = \`
                    <div class="flex items-center justify-between mb-4 border-b border-blue-200 pb-3">
                        <div class="flex items-center gap-2 text-blue-800 font-bold text-base">
                            <i class="fa-solid fa-images"></i> Ảnh bài làm bạn đã tải lên hệ thống:
                        </div>
                        <button onclick="window.deleteAllImages(0)" class="text-xs bg-white text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-600 hover:text-white font-bold shadow-sm transition-colors flex items-center gap-1">
                            <i class="fa-solid fa-trash-can"></i> Xóa tất cả ảnh
                        </button>
                    </div>
                    <div id="submitted-area-0" class="submitted-content grid gap-6">
                        \${userAnswers[0] || ''}
                    </div>
                \`;
                wrapper.appendChild(submittedWrapper);

                // [Bổ sung] Tự động chèn nút xóa vào các ảnh cũ đã nộp từ trước
                setTimeout(() => {
                    const submittedArea = document.getElementById('submitted-area-0');
                    if (submittedArea) {
                        const imgDivs = submittedArea.querySelectorAll('div.relative.group');
                        let needsUpdate = false;
                        imgDivs.forEach((div, index) => {
                            if (!div.querySelector('.fa-trash-can') && !div.querySelector('div[onclick*="deleteStudentImage"]')) {
                                const img = div.querySelector('img');
                                if (img) {
                                    const src = img.src;
                                    const uniqueId = div.id || \`legacy-img-\${Date.now()}-\${index}\`;
                                    div.id = uniqueId;
                                    const delBtn = document.createElement('div');
                                    delBtn.setAttribute('onclick', \`window.deleteStudentImage('\${src}', 0, '\${uniqueId}')\`);
                                    delBtn.className = "absolute top-2 right-2 w-9 h-9 bg-red-600 text-white rounded-full flex items-center justify-center shadow-md cursor-pointer hover:bg-red-700 hover:scale-110 transition-all z-50 border-2 border-white";
                                    delBtn.title = "Xóa ảnh này";
                                    delBtn.innerHTML = '<i class="fa-solid fa-trash-can text-sm"></i>';
                                    div.appendChild(delBtn);
                                    needsUpdate = true;
                                }
                            }
                        });
                        if (needsUpdate) {
                            userAnswers[0] = submittedArea.innerHTML;
                        }
                    }
                }, 50);`;

const newSection = `                // 1. Khu vực hiển thị ảnh đã tải lên (với nút xóa từng ảnh)
                const submittedWrapper = document.createElement('div');
                submittedWrapper.id = \`submitted-area-wrapper-0\`;
                submittedWrapper.className = userAnswers[0] ? "bg-blue-50 p-5 rounded-2xl border border-blue-200 mb-4" : "hidden";
                
                // Build nội dung header
                const swHeader = document.createElement('div');
                swHeader.className = "flex items-center justify-between mb-4 border-b border-blue-200 pb-3";
                swHeader.innerHTML = \`
                    <div class="flex items-center gap-2 text-blue-800 font-bold text-base">
                        <i class="fa-solid fa-images"></i> Ảnh bài làm bạn đã tải lên hệ thống:
                    </div>
                    <button onclick="window.deleteAllImages(0)" class="text-xs bg-white text-red-600 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-600 hover:text-white font-bold shadow-sm transition-colors flex items-center gap-1">
                        <i class="fa-solid fa-trash-can"></i> Xóa tất cả ảnh
                    </button>
                \`;
                submittedWrapper.appendChild(swHeader);
                
                // Build grid ảnh với nút xóa từng ảnh
                const submittedGrid = document.createElement('div');
                submittedGrid.id = 'submitted-area-0';
                submittedGrid.className = 'submitted-content space-y-6';
                
                if (userAnswers[0]) {
                    // Parse HTML lưu trữ để lấy từng ảnh
                    const parser = new DOMParser();
                    const parsedDoc = parser.parseFromString(userAnswers[0], 'text/html');
                    const allImgs = parsedDoc.querySelectorAll('img');
                    
                    if (allImgs.length > 0) {
                        allImgs.forEach((img, idx) => {
                            // Lấy label tờ từ div cha nếu có
                            let pageLabel = '';
                            const parentDiv = img.closest('div');
                            if (parentDiv) {
                                const labelEl = parentDiv.querySelector('div[class*="absolute bottom"]');
                                if (labelEl) pageLabel = labelEl.textContent.trim();
                            }
                            if (!pageLabel) pageLabel = 'Tờ ' + (idx + 1);
                            
                            const imgSrc = img.src;
                            const uniqueId = 'img-item-' + idx + '-' + Date.now();
                            
                            const imgItem = document.createElement('div');
                            imgItem.className = 'relative inline-block w-full border-2 border-gray-200 rounded-xl bg-white shadow-sm';
                            imgItem.id = uniqueId;
                            imgItem.innerHTML = \`
                                <img src="\${imgSrc}" class="w-full h-auto block rounded-xl" loading="lazy">
                                <div onclick="window.deleteStudentImage('\${imgSrc}', 0, '\${uniqueId}')"
                                     class="absolute top-2 right-2 w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:bg-red-700 hover:scale-110 transition-all z-50 border-2 border-white"
                                     title="Xóa ảnh này">
                                    <i class="fa-solid fa-trash-can text-sm"></i>
                                </div>
                                <div class="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm z-40 pointer-events-none">
                                    \${pageLabel}
                                </div>
                            \`;
                            submittedGrid.appendChild(imgItem);
                        });
                    } else {
                        submittedGrid.innerHTML = userAnswers[0]; // fallback
                    }
                }
                submittedWrapper.appendChild(submittedGrid);
                wrapper.appendChild(submittedWrapper);`;

if (c.includes(oldSection)) {
    c = c.replace(oldSection, newSection);
    console.log('Replaced submitted section OK');
} else {
    console.log('ERROR: Could not find target section');
    process.exit(1);
}

fs.writeFileSync('exam.html', c);
console.log('Done!');
