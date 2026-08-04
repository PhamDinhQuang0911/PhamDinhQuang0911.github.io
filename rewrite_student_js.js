const fs = require('fs');
let html = fs.readFileSync('student.html', 'utf8');

const oldHtmlLine = `html += \`<div class="bg-white p-2 md:p-4 rounded-2xl shadow-sm border border-primary-50 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all hover:border-primary-200 group" onclick="window.location.href='exam.html?id=\${ex.id}'"><div class="w-14 h-14 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold shrink-0 relative"><i class="fa-solid fa-file-pen text-xl"></i><span class="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse"></span></div><div class="flex-1 min-w-0"><div class="flex justify-between items-center mb-1"><span class="text-[10px] font-black text-gray-400 uppercase tracking-wider">Bài tập mới</span><span class="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Chưa làm</span></div><h4 class="font-bold text-gray-800 text-base line-clamp-1 group-hover:text-brand transition-colors">\${ex.title}</h4><p class="text-xs text-gray-500 font-medium mt-1 flex items-center gap-3"><span><i class="fa-regular fa-clock text-primary-500"></i> \${ex.duration}p</span><span><i class="fa-solid fa-list-ol text-primary-500"></i> \${ex.questionCount||0} câu</span></p></div><button class="text-sm bg-brand text-white w-10 h-10 rounded-full font-bold flex items-center justify-center hover:bg-primary-700 transition-all hover:scale-110 shadow-sm"><i class="fa-solid fa-play ml-0.5"></i></button></div>\`;`;

const newHtmlLine = `
                    // Tạo màu ngẫu nhiên cho Tag môn học dựa trên ID để UI sinh động (giống Image 8)
                    const colors = ['blue', 'green', 'purple', 'orange', 'red'];
                    const color = colors[ex.id.charCodeAt(0) % colors.length];
                    
                    html += \`
                    <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-all hover:border-\${color}-200 group relative overflow-hidden" onclick="window.location.href='exam.html?id=\${ex.id}'">
                        <div class="absolute left-0 top-0 bottom-0 w-1 bg-\${color}-500"></div>
                        <div class="flex items-center gap-4 flex-1 min-w-0 pl-2">
                            <div class="w-12 h-12 rounded-full bg-\${color}-50 text-\${color}-600 flex items-center justify-center font-bold text-sm shrink-0">
                                Môn
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-bold text-gray-800 text-sm md:text-base line-clamp-1 group-hover:text-\${color}-600 transition-colors">\${ex.title}</h4>
                                <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                                    <span class="flex items-center gap-1"><i class="fa-regular fa-clock"></i> \${ex.duration} phút</span>
                                    <span class="flex items-center gap-1"><i class="fa-solid fa-list-ol"></i> \${ex.questionCount||0} câu</span>
                                </div>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-2 shrink-0">
                            <span class="px-3 py-1 bg-gray-100 text-gray-500 font-bold text-[10px] rounded-full uppercase tracking-wider group-hover:bg-\${color}-500 group-hover:text-white transition-colors">Bắt đầu</span>
                        </div>
                    </div>\`;
`;

if (html.includes(oldHtmlLine)) {
    html = html.replace(oldHtmlLine, newHtmlLine);
    fs.writeFileSync('student.html', html, 'utf8');
    console.log('Updated pending tasks UI');
} else {
    console.log('Could not find old UI template string');
}
