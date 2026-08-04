const fs = require('fs');
let html = fs.readFileSync('student.html', 'utf8');

const startIndex = html.indexOf('<!-- Top Curved Header (Image 7) -->');
const endIndex = html.indexOf('<!-- Promo Banner -->');

if (startIndex !== -1 && endIndex !== -1) {
    const newUI = `<!-- Top Curved Header (Image 7) -->
                <div class="relative bg-gradient-to-r from-primary-700 via-primary-600 to-teal-600 -mx-2 md:-mx-8 -mt-2 md:-mt-8 p-6 md:p-10 pb-20 md:pb-24 text-white rounded-b-[2.5rem] shadow-[0_10px_40px_-10px_rgba(15,118,110,0.5)] overflow-hidden">
                    <div class="relative z-10 flex justify-between items-center mb-2">
                        <div class="flex items-center gap-4">
                            <div class="w-14 h-14 rounded-full bg-white/20 p-1 backdrop-blur-sm border border-white/40 shadow-lg">
                                <img id="topAvatar" src="https://placehold.co/150" class="w-full h-full object-cover rounded-full">
                            </div>
                            <div>
                                <p class="text-sm text-primary-100 font-medium mb-0.5">Xin chào,</p>
                                <h1 class="text-xl md:text-2xl font-black tracking-tight drop-shadow-md" id="welcomeName">Học sinh</h1>
                            </div>
                        </div>
                        <button class="w-11 h-11 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 flex items-center justify-center transition-all hover:scale-105 relative shadow-sm">
                            <i class="fa-solid fa-bell text-xl"></i>
                            <span class="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-primary-600 animate-pulse"></span>
                        </button>
                    </div>
                    <!-- Decorative background elements -->
                    <div class="absolute right-0 top-0 h-full w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+CgkJPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjEpIi8+Cjwvc3ZnPg==')] opacity-50 pointer-events-none"></div>
                    <div class="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none"></div>
                    <div class="absolute bottom-[-10%] left-[10%] w-40 h-40 bg-teal-400/30 rounded-full blur-2xl pointer-events-none"></div>
                </div>

                <!-- Quick Actions Grid (Icons in circles) -->
                <div class="relative z-20 -mt-12 mx-2 md:mx-6 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-[2rem] shadow-xl border border-white/50 dark:border-slate-700 p-6">
                    <div class="grid grid-cols-4 gap-y-4 gap-x-2 text-center">
                        <div class="flex flex-col items-center gap-3 cursor-pointer group" onclick="switchTab('market')">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:shadow-lg transition-all border border-blue-100 dark:border-blue-800/50">
                                <i class="fa-solid fa-book-open"></i>
                            </div>
                            <span class="text-[11px] md:text-sm font-bold text-gray-700 dark:text-gray-300">Khóa học</span>
                        </div>
                        <div class="flex flex-col items-center gap-3 cursor-pointer group" onclick="document.getElementById('pendingTasksList').scrollIntoView({behavior: 'smooth'})">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-900/40 dark:to-orange-800/20 text-orange-600 dark:text-orange-400 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:shadow-lg transition-all border border-orange-100 dark:border-orange-800/50">
                                <i class="fa-solid fa-file-signature"></i>
                            </div>
                            <span class="text-[11px] md:text-sm font-bold text-gray-700 dark:text-gray-300">Bài tập</span>
                        </div>
                        <div class="flex flex-col items-center gap-3 cursor-pointer group" onclick="switchTab('practice'); loadStudentPracticeHistory()">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/40 dark:to-purple-800/20 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:shadow-lg transition-all border border-purple-100 dark:border-purple-800/50 relative">
                                <i class="fa-solid fa-brain"></i>
                            </div>
                            <span class="text-[11px] md:text-sm font-bold text-gray-700 dark:text-gray-300">Luyện tập</span>
                        </div>
                        <div class="flex flex-col items-center gap-3 cursor-pointer group" onclick="window.showNotification('Tính năng Thi online đang được phát triển 🚀', 'success')">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/40 dark:to-red-800/20 text-red-600 dark:text-red-400 flex items-center justify-center text-2xl group-hover:scale-110 group-hover:shadow-lg transition-all border border-red-100 dark:border-red-800/50">
                                <i class="fa-solid fa-laptop-code"></i>
                            </div>
                            <span class="text-[11px] md:text-sm font-bold text-gray-700 dark:text-gray-300">Thi online</span>
                        </div>
                    </div>
                </div>

                `;
    
    html = html.substring(0, startIndex) + newUI + html.substring(endIndex);
    fs.writeFileSync('student.html', html, 'utf8');
    console.log('Successfully refined student.html top area.');
} else {
    console.log('Could not find replace targets in student.html');
}
