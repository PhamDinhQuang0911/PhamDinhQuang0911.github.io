const fs = require('fs');
let html = fs.readFileSync('student.html', 'utf8');

const startHTML = html.indexOf('<!-- KHU NÚT NHANH (Mới) -->');
const endHTML = html.indexOf('<!-- KHU BÀI TẬP VỀ NHÀ -->');

const newGridHTML = `<!-- KHU NÚT NHANH (Mới) -->
    <div class="grid grid-cols-3 gap-3 md:gap-6">
        <!-- Nút Luyện tập AI -->
        <div onclick="switchTab('practice'); loadStudentPracticeHistory()" class="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:-translate-y-1 transition-all group relative overflow-hidden flex flex-col items-center justify-center text-center">
            <div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300 mb-2">
                <i class="fa-solid fa-brain"></i>
            </div>
            <h3 class="text-sm md:text-base font-bold text-gray-700 group-hover:text-indigo-600 transition-colors">Luyện tập AI</h3>
            <span class="absolute top-2 right-2 bg-red-100 text-red-600 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">Mới</span>
        </div>

        <!-- Nút Khóa học -->
        <div onclick="switchTab('classes')" class="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:-translate-y-1 transition-all group flex flex-col items-center justify-center text-center">
            <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 mb-2">
                <i class="fa-solid fa-book-open"></i>
            </div>
            <h3 class="text-sm md:text-base font-bold text-gray-700 group-hover:text-blue-600 transition-colors">Khóa học của tôi</h3>
        </div>

        <!-- Nút Đăng ký khóa mới -->
        <div onclick="switchTab('market')" class="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 cursor-pointer hover:-translate-y-1 transition-all group flex flex-col items-center justify-center text-center">
            <div class="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center text-xl group-hover:bg-orange-600 group-hover:text-white transition-colors duration-300 mb-2">
                <i class="fa-solid fa-cart-shopping"></i>
            </div>
            <h3 class="text-sm md:text-base font-bold text-gray-700 group-hover:text-orange-600 transition-colors">Đăng ký khóa mới</h3>
        </div>
    </div>
    
    `;

if (startHTML !== -1 && endHTML !== -1) {
    html = html.substring(0, startHTML) + newGridHTML + html.substring(endHTML);
}

// 2. Insert Autumn Tree Image directly into the Welcome Header
const headerDecorStr = '<div id="sidebarDecorTree" class="absolute bottom-0 right-0 w-40 h-40 md:w-56 md:h-56 pointer-events-none opacity-90 flex items-end justify-end overflow-hidden"></div>';
const newHeaderDecorStr = `<div class="absolute bottom-0 right-4 w-32 h-32 md:w-48 md:h-48 pointer-events-none opacity-90 flex items-end justify-end overflow-hidden">
            <img src="assets/autumn-tree.png" alt="Mùa thu" class="w-full h-full object-contain filter drop-shadow-xl animate-fade-in origin-bottom" style="animation-duration: 2s;">
        </div>`;
html = html.replace(headerDecorStr, newHeaderDecorStr);

fs.writeFileSync('student.html', html, 'utf8');
console.log('Successfully aligned grid and added autumn tree directly.');
