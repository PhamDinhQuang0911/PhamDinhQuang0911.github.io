const fs = require('fs');
let html = fs.readFileSync('student.html', 'utf8');

// REVERT HTML
const startHTML = html.indexOf('<div id="tab-dashboard"');
const endHTML = html.indexOf('<!-- TAB PRACTICE START -->');
const oldHTML = `<div id="tab-dashboard" class="tab-content space-y-8 animate-fade-in">
                <div class="bg-gradient-to-br from-primary-600 to-blue-600 rounded-3xl p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
                    <div class="relative z-10">
                        <h1 class="text-2xl md:text-4xl font-black mb-3 tracking-tight">Chào mừng trở lại, <span id="welcomeName">...</span>! 👋</h1>
                        <p class="text-primary-100 mb-8 text-sm md:text-lg max-w-2xl leading-relaxed">Hôm nay là một ngày tuyệt vời để học tập. Kiểm tra ngay các bài tập đang chờ bạn phía dưới nhé!</p>
                        <button onclick="switchTab('classes')" class="bg-white text-primary-700 px-6 md:px-8 py-3 rounded-full font-black hover:bg-primary-50 transition shadow-md text-sm md:text-base flex items-center gap-2 inline-flex"><i class="fa-solid fa-arrow-down"></i> Vào lớp học ngay</button>
                    </div>
                    <div class="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-white/10 to-transparent skew-x-12 transform origin-top-right"></div>
                    <div class="absolute bottom-0 left-10 w-40 h-40 bg-primary-500/30 rounded-full blur-2xl"></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
                    <div onclick="switchTab('practice'); loadStudentPracticeHistory()" class="bg-white p-3 md:p-6 rounded-3xl shadow-lg shadow-indigo-100 border border-indigo-50 cursor-pointer hover:-translate-y-1 transition-all group relative overflow-hidden">
                        <div class="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
                        <div class="relative z-10">
                            <div class="flex justify-between items-start mb-4">
                                <div class="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-indigo-200 group-hover:scale-110 transition-transform duration-300">
                                    <i class="fa-solid fa-brain"></i>
                                </div>
                                <span class="bg-red-100 text-red-600 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">Mới</span>
                            </div>
                            
                            <h3 class="text-xl font-black text-gray-800 mb-2 group-hover:text-indigo-600 transition-colors">Phòng Luyện Tập AI</h3>
                            <p class="text-sm text-gray-500 leading-relaxed mb-6 font-medium">
                                Ôn tập kiến thức theo chuyên đề, mức độ. Hệ thống tự động tạo đề thông minh giúp bạn bứt phá điểm số.
                            </p>
                            
                            <div class="flex items-center text-indigo-600 font-bold text-sm bg-indigo-50 w-fit px-4 py-2 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                <span>Bắt đầu ngay</span>
                                <i class="fa-solid fa-arrow-right ml-2 transform group-hover:translate-x-1 transition-transform"></i>
                            </div>
                        </div>
                    </div>

                    <div class="bg-white p-3 md:p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-center text-center opacity-60 grayscale hover:grayscale-0 hover:opacity-100 transition-all cursor-not-allowed">
                        <div>
                            <div class="w-14 h-14 mx-auto bg-gray-100 text-gray-400 rounded-2xl flex items-center justify-center text-2xl mb-4">
                                <i class="fa-solid fa-trophy"></i>
                            </div>
                            <h3 class="text-lg font-bold text-gray-600">Bảng Xếp Hạng</h3>
                            <p class="text-xs text-gray-400 mt-1">Tính năng đang phát triển...</p>
                        </div>
                    </div>
                </div>
                <div>
                    <h3 class="font-bold text-gray-800 text-xl mb-6 flex items-center gap-3"><span class="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm"><i class="fa-solid fa-bell"></i></span><span id="pendingTitle">Đang kiểm tra bài tập...</span></h3>
                    <div id="pendingTasksList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                        <div class="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-primary-200"><i class="fa-solid fa-circle-notch fa-spin text-primary-500 text-3xl mb-4"></i><p class="text-gray-500 font-medium">Đang tải dữ liệu...</p></div>
                    </div>
                </div>
            </div>

            `;
            
if (startHTML !== -1 && endHTML !== -1) {
    html = html.substring(0, startHTML) + oldHTML + html.substring(endHTML + 29); // +29 to remove the <!-- TAB PRACTICE START --> comment if it exists, wait! Let's just remove everything up to <div id="tab-practice"
} else {
    // If we can't find TAB PRACTICE START, try finding tab-practice directly
    const nextTab = html.indexOf('<div id="tab-practice"');
    if (nextTab !== -1) {
        html = html.substring(0, startHTML) + oldHTML + html.substring(nextTab);
    }
}

// REVERT JS
const jsStart = html.indexOf('const colors = [\'blue\', \'green\', \'purple\', \'orange\', \'red\'];');
if (jsStart !== -1) {
    const jsEnd = html.indexOf('</div>\\`;', jsStart) + 9;
    
    const oldJS = `html += \`<div class="bg-white p-2 md:p-4 rounded-2xl shadow-sm border border-primary-50 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all hover:border-primary-200 group" onclick="window.location.href='exam.html?id=\${ex.id}'"><div class="w-14 h-14 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold shrink-0 relative"><i class="fa-solid fa-file-pen text-xl"></i><span class="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse"></span></div><div class="flex-1 min-w-0"><div class="flex justify-between items-center mb-1"><span class="text-[10px] font-black text-gray-400 uppercase tracking-wider">Bài tập mới</span><span class="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Chưa làm</span></div><h4 class="font-bold text-gray-800 text-base line-clamp-1 group-hover:text-brand transition-colors">\${ex.title}</h4><p class="text-xs text-gray-500 font-medium mt-1 flex items-center gap-3"><span><i class="fa-regular fa-clock text-primary-500"></i> \${ex.duration}p</span><span><i class="fa-solid fa-list-ol text-primary-500"></i> \${ex.questionCount||0} câu</span></p></div><button class="text-sm bg-brand text-white w-10 h-10 rounded-full font-bold flex items-center justify-center hover:bg-primary-700 transition-all hover:scale-110 shadow-sm"><i class="fa-solid fa-play ml-0.5"></i></button></div>\`;`;
    
    // Let's find exactly the replacement chunk
    // Replace from // Tạo màu ngẫu nhiên... to </div>\`;
    const searchRegex = /\/\/ Tạo màu ngẫu nhiên[\s\S]*?<\/div>\\`;/g;
    html = html.replace(searchRegex, oldJS);
}

fs.writeFileSync('student.html', html, 'utf8');
console.log('Successfully reverted student.html UI to the old version.');
