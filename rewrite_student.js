const fs = require('fs');
let html = fs.readFileSync('student.html', 'utf8');

const startIndex = html.indexOf('<div id="tab-dashboard" class="tab-content space-y-8 animate-fade-in">');
const endIndex = html.indexOf('<div id="tab-practice"');

if (startIndex !== -1 && endIndex !== -1) {
    const newDashboardHTML = `<div id="tab-dashboard" class="tab-content space-y-6 animate-fade-in pb-10">
                <!-- Top Curved Header (Image 7) -->
                <div class="relative bg-gradient-to-b from-primary-600 to-primary-800 -mx-2 md:-mx-8 -mt-2 md:-mt-8 p-6 md:p-10 pb-16 md:pb-20 text-white rounded-b-[2rem] shadow-lg overflow-hidden">
                    <div class="relative z-10 flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-full bg-white/20 border-2 border-white/50 overflow-hidden shadow-sm">
                                <img id="topAvatar" src="https://placehold.co/150" class="w-full h-full object-cover">
                            </div>
                            <div>
                                <p class="text-xs text-primary-100 font-medium">Xin chào,</p>
                                <h1 class="text-lg md:text-xl font-bold tracking-tight" id="welcomeName2">Học sinh</h1>
                            </div>
                        </div>
                        <button class="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors relative">
                            <i class="fa-solid fa-bell text-lg"></i>
                            <span class="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-primary-700"></span>
                        </button>
                    </div>
                    <!-- Decorative background elements -->
                    <div class="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-white/10 to-transparent skew-x-12 transform origin-top-right pointer-events-none"></div>
                    <div class="absolute bottom-0 left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
                </div>

                <!-- Quick Actions Grid (Icons in circles) -->
                <div class="relative z-20 -mt-10 mx-2 md:mx-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div class="grid grid-cols-4 md:grid-cols-6 gap-y-4 gap-x-2 text-center">
                        <div class="flex flex-col items-center gap-2 cursor-pointer group">
                            <div class="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center text-xl group-hover:bg-primary-100 group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-book"></i>
                            </div>
                            <span class="text-[10px] md:text-xs font-bold text-gray-600">Khóa học</span>
                        </div>
                        <div class="flex flex-col items-center gap-2 cursor-pointer group" onclick="document.getElementById('pendingTasksList').scrollIntoView({behavior: 'smooth'})">
                            <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xl group-hover:bg-blue-100 group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-file-signature"></i>
                            </div>
                            <span class="text-[10px] md:text-xs font-bold text-gray-600">Bài tập</span>
                        </div>
                        <div class="flex flex-col items-center gap-2 cursor-pointer group" onclick="switchTab('practice'); loadStudentPracticeHistory()">
                            <div class="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-xl group-hover:bg-purple-100 group-hover:scale-110 transition-transform relative">
                                <i class="fa-solid fa-brain"></i>
                            </div>
                            <span class="text-[10px] md:text-xs font-bold text-gray-600">Luyện tập</span>
                        </div>
                        <div class="flex flex-col items-center gap-2 cursor-pointer group">
                            <div class="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-xl group-hover:bg-orange-100 group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-chart-simple"></i>
                            </div>
                            <span class="text-[10px] md:text-xs font-bold text-gray-600">Đánh giá</span>
                        </div>
                        <div class="flex flex-col items-center gap-2 cursor-pointer group hidden md:flex" onclick="alert('Tính năng Hỏi đáp đang phát triển')">
                            <div class="w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-xl group-hover:bg-teal-100 group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-comments"></i>
                            </div>
                            <span class="text-[10px] md:text-xs font-bold text-gray-600">Hỏi đáp</span>
                        </div>
                        <div class="flex flex-col items-center gap-2 cursor-pointer group hidden md:flex">
                            <div class="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-xl group-hover:bg-red-100 group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-laptop-code"></i>
                            </div>
                            <span class="text-[10px] md:text-xs font-bold text-gray-600">Thi online</span>
                        </div>
                    </div>
                </div>

                <!-- Promo Banner -->
                <div class="mx-2 md:mx-6 rounded-2xl overflow-hidden shadow-sm relative group cursor-pointer">
                    <div class="bg-gradient-to-r from-indigo-500 to-purple-500 p-6 flex flex-col justify-center items-start text-white min-h-[120px]">
                        <span class="bg-white/20 text-xs font-bold px-2 py-1 rounded mb-2">HOT</span>
                        <h3 class="text-lg font-black mb-1">Khóa Luyện thi ĐGNL 2025</h3>
                        <p class="text-sm text-indigo-100">Đăng ký ngay giảm 50% học phí</p>
                    </div>
                    <div class="absolute right-[-20px] bottom-[-20px] text-white/20 text-8xl transform -rotate-12 group-hover:scale-110 transition-transform">
                        <i class="fa-solid fa-graduation-cap"></i>
                    </div>
                </div>

                <!-- Bài tập về nhà (Homework List - Image 8) -->
                <div class="mx-2 md:mx-6">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-bold text-gray-800 text-lg flex items-center gap-2"><i class="fa-solid fa-pen-to-square text-primary-500"></i> Bài tập về nhà</h3>
                        <button class="text-primary-600 text-sm font-bold hover:underline">Xem tất cả</button>
                    </div>
                    
                    <!-- Danh sách bài tập -->
                    <div id="pendingTasksList" class="flex flex-col gap-3">
                        <div class="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-gray-200">
                            <i class="fa-solid fa-circle-notch fa-spin text-primary-500 text-3xl mb-4"></i>
                            <p class="text-gray-500 font-medium">Đang tải dữ liệu...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB PRACTICE START -->
            `;
    
    html = html.substring(0, startIndex) + newDashboardHTML + html.substring(endIndex);

    // Also need to fix the JS rendering for homework list (pendingTasksList) to match Image 8 cards
    // Look for renderStudentExamList logic in dashboard or student JS?
    // In student.html, there is a loadPendingExams() function or similar? Let's check where pendingTasksList is populated.

    fs.writeFileSync('student.html', html, 'utf8');
    console.log('Successfully updated student.html dashboard tab to match Image 7 & 8.');
} else {
    console.log('Could not find replace targets in student.html');
}
