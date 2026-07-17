const fs = require('fs');
let c = fs.readFileSync('exam.html', 'utf8');

// 1. Change the small 'x' to a proper trash can in renderStudentPreview
c = c.replace(
    /window\.renderStudentPreview = \(qIdx\) => \{[\s\S]*?window\.removeStudentFile/g,
    `window.renderStudentPreview = (qIdx) => { 
            const container = document.getElementById(\`preview-area-\${qIdx}\`); 
            container.innerHTML = ''; 
            window.tempStudentFiles[qIdx].forEach((file, i) => { 
                const url = URL.createObjectURL(file); 
                const div = document.createElement('div'); 
                div.className = "relative group aspect-[3/4]"; 
                div.innerHTML = \`<img src="\${url}" class="w-full h-full object-cover rounded-lg border border-gray-300 shadow-sm">
                <div onclick="removeStudentFile(\${qIdx}, \${i})" class="absolute top-2 right-2 w-9 h-9 bg-red-600 text-white rounded-full flex items-center justify-center shadow-md cursor-pointer hover:bg-red-700 hover:scale-110 transition-all z-50 border-2 border-white" title="Bỏ chọn ảnh này">
                    <i class="fa-solid fa-trash-can text-sm"></i>
                </div>
                <div class="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm z-40 pointer-events-none">Chờ đánh số</div>\`; 
                container.appendChild(div); 
            }); 
        };
        window.removeStudentFile`
);

// 2. Add post-processing to inject delete buttons into old submissions in Edit Mode
c = c.replace(
    /wrapper\.appendChild\(submittedWrapper\);/g,
    `wrapper.appendChild(submittedWrapper);

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
                }, 50);`
);

fs.writeFileSync('exam.html', c);
console.log('Fixed delete buttons');
