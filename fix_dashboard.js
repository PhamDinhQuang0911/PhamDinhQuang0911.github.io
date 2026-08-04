const fs = require('fs');
let html = fs.readFileSync('dashboard.html', 'utf8');

// 1. Fix the botched back button in the header
html = html.replace(/<div class="flex items-center gap-2">\s*<h2 class="text-base/g, `<button onclick="switchView('classes')" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors text-gray-600"><i class="fa-solid fa-arrow-left"></i></button>\n                    <div class="overflow-hidden">\n                        <div class="flex items-center gap-2">\n                            <h2 class="text-base`);

// 2. Add Báo cáo button to the tab group
const tabsRegex = /<button onclick="window\.switchTab\('exams'\)" id="tabBtnExams"([^>]+)><i class="fa-solid fa-file-signature"><\/i> <span class="hidden md:inline">Bài tập<\/span><\/button>/;
const reportsBtn = `\n                    <button onclick="window.switchTab('reports')" id="tabBtnReports" class="px-3 md:px-4 py-1.5 text-xs md:text-sm font-bold rounded-md transition-all text-gray-500 hover:text-gray-700 flex items-center gap-1 shrink-0"><i class="fa-solid fa-chart-column"></i> <span class="hidden md:inline">Báo cáo</span></button>`;
if(!html.includes('id="tabBtnReports"')) {
    html = html.replace(tabsRegex, match => match + reportsBtn);
}

// 3. Add tabContentReports after tabContentExams
const examsContent = `<div id="tabContentExams" class="hidden space-y-6 w-full max-w-7xl mx-auto"><div id="teacherExamList" class="space-y-3"></div></div>`;
const reportsContent = `
                <!-- Giao diện Báo Cáo (New UI Overhaul) -->
                <div id="tabContentReports" class="hidden w-full max-w-7xl mx-auto flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden" style="min-height: 70vh;">
                    <!-- Thanh điều hướng báo cáo -->
                    <div class="flex items-center gap-6 px-6 pt-4 border-b border-gray-100 overflow-x-auto no-scrollbar shrink-0">
                        <button onclick="switchReportTab('overview')" id="repTab-overview" class="text-sm font-bold pb-3 border-b-2 border-transparent hover:text-primary-600 text-gray-500 whitespace-nowrap transition-colors">Kết quả học tập</button>
                        <button onclick="switchReportTab('student')" id="repTab-student" class="text-sm font-bold pb-3 border-b-2 border-primary-600 text-primary-600 whitespace-nowrap transition-colors">Từng học sinh</button>
                        <button onclick="switchReportTab('class')" id="repTab-class" class="text-sm font-bold pb-3 border-b-2 border-transparent hover:text-primary-600 text-gray-500 whitespace-nowrap transition-colors">Cả lớp</button>
                        <button onclick="switchReportTab('raw')" id="repTab-raw" class="text-sm font-bold pb-3 border-b-2 border-transparent hover:text-primary-600 text-gray-500 whitespace-nowrap transition-colors">Theo buổi (raw)</button>
                        <button onclick="switchReportTab('grade')" id="repTab-grade" class="text-sm font-bold pb-3 border-b-2 border-transparent hover:text-primary-600 text-gray-500 whitespace-nowrap transition-colors">Lớp / Khối</button>
                        <button onclick="switchReportTab('topic')" id="repTab-topic" class="text-sm font-bold pb-3 border-b-2 border-transparent hover:text-primary-600 text-gray-500 whitespace-nowrap transition-colors">Theo dạng</button>
                        <button onclick="switchReportTab('exam')" id="repTab-exam" class="text-sm font-bold pb-3 border-b-2 border-transparent hover:text-primary-600 text-gray-500 whitespace-nowrap transition-colors">Điểm thi</button>
                    </div>

                    <!-- Thanh filter chung -->
                    <div class="px-6 py-4 flex flex-wrap items-center gap-4 bg-gray-50/50 border-b border-gray-100 shrink-0">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-gray-400">MÔN</span>
                            <button class="px-4 py-1.5 rounded-full bg-primary-600 text-white text-sm font-bold shadow-sm shadow-primary-200 transition-transform active:scale-95">Toán</button>
                            <button class="px-4 py-1.5 rounded-full text-gray-500 text-sm font-bold hover:bg-gray-100 transition-colors bg-white border border-gray-200">KHTN</button>
                        </div>
                        <div class="w-px h-6 bg-gray-200 hidden md:block"></div>
                        <div class="relative">
                            <select class="appearance-none bg-white border border-gray-200 text-gray-700 font-bold py-1.5 pl-3 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm cursor-pointer min-w-[150px]">
                                <option>Tất cả lớp</option>
                            </select>
                            <i class="fa-solid fa-chevron-down absolute right-3 top-2.5 text-xs text-gray-400 pointer-events-none"></i>
                        </div>
                    </div>

                    <!-- Nội dung báo cáo từng tab -->
                    <div class="flex-1 flex overflow-hidden relative">
                        <!-- Sidebar học sinh (cho tab Từng học sinh) -->
                        <div class="w-64 border-r border-gray-100 flex-col bg-white shrink-0 hidden" id="reportStudentSidebar">
                            <div class="p-4 border-b border-gray-100 bg-gray-50/80">
                                <span class="text-xs font-bold text-gray-400 mb-2 block" id="reportStudentCount">0 HỌC SINH</span>
                                <div class="relative">
                                    <input type="text" placeholder="Tìm kiếm..." class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500">
                                    <i class="fa-solid fa-search absolute left-3 top-2.5 text-gray-400"></i>
                                </div>
                            </div>
                            <div class="flex-1 overflow-y-auto custom-scrollbar" id="reportStudentList">
                                <div class="text-center py-8 text-gray-400 text-sm">Đang tải...</div>
                            </div>
                        </div>

                        <!-- Main content báo cáo -->
                        <div class="flex-1 overflow-y-auto custom-scrollbar p-6 bg-gray-50/30" id="reportMainContent">
                            <div class="flex flex-col items-center justify-center h-full text-gray-400">
                                <i class="fa-solid fa-chart-column text-6xl mb-4 text-gray-200"></i>
                                <h3 class="text-lg font-bold">Chưa có dữ liệu báo cáo</h3>
                                <p class="text-sm mt-1">Vui lòng chọn học sinh hoặc thay đổi bộ lọc</p>
                            </div>
                        </div>
                    </div>
                </div>
`;
if(!html.includes('id="tabContentReports"')) {
    html = html.replace(examsContent, examsContent + reportsContent);
}

// Write back
fs.writeFileSync('dashboard.html', html, 'utf8');
console.log('Fixed dashboard.html successfully.');
