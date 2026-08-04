const fs = require('fs');
let html = fs.readFileSync('dashboard-mapid.html', 'utf8');

// 1. We will replace everything from <!-- Middle Panel: Topic Content --> to the end of <main>
const startIndex = html.indexOf('<!-- Middle Panel: Topic Content -->');
const endIndex = html.indexOf('</main>');

if (startIndex !== -1 && endIndex !== -1) {
    const newRightPanel = `
        <!-- Main Right Panel (Replaces Middle and Right panels from old design to match Image 6) -->
        <div class="flex-1 flex flex-col bg-gray-50 min-w-0" id="topicContentPanel" style="display:none;">
            <!-- Tabs Navigation inside Right Panel -->
            <div class="bg-white px-6 pt-4 border-b border-gray-200 flex gap-8 shrink-0">
                <button onclick="switchMapTab('overview')" id="mapTab-overview" class="pb-3 border-b-2 border-primary-600 text-primary-600 font-bold text-sm transition-colors">Tổng quan</button>
                <button onclick="switchMapTab('topics')" id="mapTab-topics" class="pb-3 border-b-2 border-transparent hover:text-primary-600 text-gray-500 font-bold text-sm transition-colors">Dạng bài</button>
                <button onclick="switchMapTab('theory')" id="mapTab-theory" class="pb-3 border-b-2 border-transparent hover:text-primary-600 text-gray-500 font-bold text-sm transition-colors">Lý thuyết</button>
            </div>

            <div class="flex-1 overflow-y-auto p-6 custom-scroll relative">
                <!-- Tab: Tổng quan -->
                <div id="mapContent-overview" class="max-w-4xl mx-auto space-y-6">
                    
                    <!-- Card Chi tiết -->
                    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                        <div class="flex justify-between items-start mb-6">
                            <div>
                                <h2 class="text-2xl font-bold text-gray-800 mb-2" id="topicContentTitle">Chi tiết Chuyên đề</h2>
                                <div class="flex items-center gap-2 text-sm text-gray-500" id="pathContainer">
                                    <!-- Breadcrumb path renders here -->
                                </div>
                            </div>
                            <div class="flex gap-2">
                                <button id="btnImportTopic" class="px-4 py-2 bg-primary-50 text-primary-700 font-bold rounded-lg hover:bg-primary-100 transition-colors flex items-center gap-2 border border-primary-200"><i class="fa-solid fa-plus"></i> Thêm câu hỏi</button>
                                <button class="px-4 py-2 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"><i class="fa-solid fa-file-pdf"></i> Xuất PDF</button>
                            </div>
                        </div>

                        <!-- ID Box -->
                        <div class="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-6 flex items-center justify-between">
                            <div>
                                <div class="text-xs font-bold text-gray-400 mb-1">MÃ ĐỊNH DANH (ID)</div>
                                <code id="previewID" class="text-xl font-black text-primary-600 font-mono">--</code>
                            </div>
                            <button onclick="copyID()" class="w-10 h-10 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-primary-600 hover:border-primary-300 flex items-center justify-center transition-colors shadow-sm" title="Copy ID"><i class="fa-regular fa-copy"></i></button>
                        </div>

                        <!-- Thống kê câu hỏi -->
                        <div>
                            <h3 class="text-sm font-bold text-gray-700 mb-3 uppercase">Thống kê Câu hỏi</h3>
                            <div class="flex flex-wrap gap-3">
                                <div class="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700">
                                    <span class="w-2 h-2 rounded-full bg-green-500"></span>
                                    <span class="font-bold text-sm">Nhận biết: <span id="statNb">0</span> câu</span>
                                </div>
                                <div class="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
                                    <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                                    <span class="font-bold text-sm">Thông hiểu: <span id="statTh">0</span> câu</span>
                                </div>
                                <div class="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-lg text-orange-700">
                                    <span class="w-2 h-2 rounded-full bg-orange-500"></span>
                                    <span class="font-bold text-sm">Vận dụng: <span id="statVd">0</span> câu</span>
                                </div>
                                <div class="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700">
                                    <span class="w-2 h-2 rounded-full bg-red-500"></span>
                                    <span class="font-bold text-sm">Vận dụng cao: <span id="statVdc">0</span> câu</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Card Cài đặt nhánh -->
                    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                        <h3 class="text-sm font-bold text-gray-700 mb-4 uppercase">Cài đặt Thuộc tính Nhánh</h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label class="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-primary-50 transition-colors">
                                <input type="checkbox" id="chkTheory" class="w-5 h-5 text-primary-600 rounded border-gray-300 focus:ring-primary-500 transition-all mt-0.5">
                                <div>
                                    <div class="font-bold text-sm text-gray-800">Dạng Lý thuyết</div>
                                    <div class="text-xs text-gray-500 mt-1">Đánh dấu toàn bộ câu hỏi trong nhánh này là câu hỏi lý thuyết.</div>
                                </div>
                            </label>
                            <label class="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-green-50 transition-colors">
                                <input type="checkbox" id="chkRealWorld" class="w-5 h-5 text-green-600 rounded border-gray-300 focus:ring-green-500 transition-all mt-0.5">
                                <div>
                                    <div class="font-bold text-sm text-gray-800">Toán Thực tế</div>
                                    <div class="text-xs text-gray-500 mt-1">Đánh dấu toàn bộ câu hỏi trong nhánh này liên quan đến thực tiễn.</div>
                                </div>
                            </label>
                        </div>
                        <div class="mt-6 pt-6 border-t border-gray-100 flex justify-end">
                            <button id="btnDeleteNode" class="px-4 py-2 bg-red-50 text-red-600 font-bold rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2">
                                <i class="fa-solid fa-trash"></i> Xóa nhánh này
                            </button>
                        </div>
                    </div>

                </div>

                <!-- Tab: Dạng bài (Hiện danh sách câu hỏi) -->
                <div id="mapContent-topics" class="hidden max-w-4xl mx-auto">
                    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 min-h-[400px]">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="font-bold text-gray-800 text-lg">Danh sách Câu hỏi</h3>
                            <button class="px-3 py-1.5 bg-gray-100 text-gray-600 font-bold rounded text-sm hover:bg-gray-200 transition-colors" id="btnSelectBank"><i class="fa-solid fa-database mr-1"></i> Chọn từ Ngân hàng</button>
                        </div>
                        <div id="topicQuestionsList" class="space-y-4">
                            <div class="text-center text-gray-400 py-10 flex flex-col items-center">
                                <i class="fa-solid fa-box-open text-4xl mb-3 text-gray-200"></i>
                                <p>Chưa có câu hỏi nào.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tab: Lý thuyết -->
                <div id="mapContent-theory" class="hidden max-w-4xl mx-auto">
                    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 min-h-[400px] flex items-center justify-center text-gray-400">
                        <div class="text-center">
                            <i class="fa-solid fa-book-open text-6xl mb-4 text-gray-200"></i>
                            <h3 class="text-lg font-bold text-gray-500">Chưa có bài giảng lý thuyết</h3>
                            <p class="text-sm mt-2">Tính năng soạn thảo lý thuyết đang được cập nhật.</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>

        <!-- Initial Placeholder when no node is selected -->
        <div id="topicBuilderGuide" class="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 bg-gray-50">
            <div class="text-center max-w-sm">
                <i class="fa-solid fa-diagram-project text-6xl mb-6 text-primary-200"></i>
                <h3 class="text-lg font-bold text-gray-600 mb-3">Xây dựng Ngân hàng ID</h3>
                <p class="text-sm mb-6 text-gray-500">Hãy click vào một mục trong Cây kiến thức bên trái để xem chi tiết hoặc bổ sung câu hỏi.</p>
            </div>
        </div>
    `;

    html = html.substring(0, startIndex) + newRightPanel + '\n    ' + html.substring(endIndex);
    
    // Add JS for switchMapTab
    const jsLogic = `
    function switchMapTab(tabId) {
        ['overview', 'topics', 'theory'].forEach(t => {
            const btn = document.getElementById('mapTab-' + t);
            const content = document.getElementById('mapContent-' + t);
            if(btn && content) {
                if(t === tabId) {
                    btn.classList.add('border-primary-600', 'text-primary-600');
                    btn.classList.remove('border-transparent', 'text-gray-500');
                    content.classList.remove('hidden');
                } else {
                    btn.classList.remove('border-primary-600', 'text-primary-600');
                    btn.classList.add('border-transparent', 'text-gray-500');
                    content.classList.add('hidden');
                }
            }
        });
    }
    `;
    if(!html.includes('switchMapTab')) {
        html = html.replace('</script>\n</body>', jsLogic + '\n</script>\n</body>');
    }
    
    // Fix existing selectNode logic to hide guide and show panel
    html = html.replace(/document\.getElementById\('topicContentPanel'\)\.style\.display = 'flex';/g, "document.getElementById('topicContentPanel').style.display = 'flex'; document.getElementById('topicBuilderGuide').style.display = 'none'; switchMapTab('overview');");

    fs.writeFileSync('dashboard-mapid.html', html, 'utf8');
    console.log('Successfully updated dashboard-mapid.html to match Image 6.');
} else {
    console.log('Could not find replace targets in dashboard-mapid.html');
}
