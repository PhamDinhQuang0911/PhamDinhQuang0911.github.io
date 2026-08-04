const fs = require('fs');
let html = fs.readFileSync('dashboard.html', 'utf8');

const jsToAdd = `
    // ----- BÁO CÁO (REPORTS) LOGIC -----
    function switchReportTab(tabId) {
        // Reset tất cả các tab
        const tabs = ['overview', 'student', 'class', 'raw', 'grade', 'topic', 'exam'];
        tabs.forEach(t => {
            const el = document.getElementById('repTab-' + t);
            if(el) {
                el.classList.remove('border-primary-600', 'text-primary-600');
                el.classList.add('border-transparent', 'text-gray-500');
            }
        });
        
        // Active tab hiện tại
        const activeTab = document.getElementById('repTab-' + tabId);
        if(activeTab) {
            activeTab.classList.remove('border-transparent', 'text-gray-500');
            activeTab.classList.add('border-primary-600', 'text-primary-600');
        }

        // Hiện sidebar học sinh nếu chọn tab Từng học sinh
        const sidebar = document.getElementById('reportStudentSidebar');
        const mainContent = document.getElementById('reportMainContent');
        if(tabId === 'student') {
            sidebar.classList.remove('hidden');
            sidebar.classList.add('flex');
            
            // Tạm thời render nội dung
            mainContent.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-400"><i class="fa-solid fa-user-graduate text-6xl mb-4 text-gray-200"></i><h3 class="text-lg font-bold">Chọn học sinh để xem</h3></div>';
        } else if(tabId === 'topic') {
            sidebar.classList.add('hidden');
            sidebar.classList.remove('flex');
            
            mainContent.innerHTML = '<div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><h3 class="font-bold text-gray-800 text-lg mb-4">Kết quả theo dạng bài</h3><div class="space-y-4"><div class="flex flex-col gap-2"><div class="flex justify-between text-sm"><span class="font-bold text-gray-700">Góc giữa 2 mặt phẳng</span><span class="font-bold text-primary-600">85%</span></div><div class="h-3 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-primary-500 rounded-full" style="width: 85%;"></div></div></div><div class="flex flex-col gap-2"><div class="flex justify-between text-sm"><span class="font-bold text-gray-700">Khoảng cách từ điểm đến mp</span><span class="font-bold text-yellow-500">45%</span></div><div class="h-3 bg-gray-100 rounded-full overflow-hidden"><div class="h-full bg-yellow-400 rounded-full" style="width: 45%;"></div></div></div></div></div>';
        } else {
            sidebar.classList.add('hidden');
            sidebar.classList.remove('flex');
            mainContent.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-400"><i class="fa-solid fa-chart-column text-6xl mb-4 text-gray-200"></i><h3 class="text-lg font-bold">Chức năng đang được cập nhật...</h3></div>';
        }
    }
`;

// Insert the JS logic into the script block
if(!html.includes('switchReportTab')) {
    html = html.replace('</script>\n</body>', jsToAdd + '\n</script>\n</body>');
}

// Modify switchTab to support 'reports'
html = html.replace(/function switchTab\(tab\) \{/g, `function switchTab(tab) {
        if(tab === 'reports') {
            document.getElementById('tabContentStudents').classList.add('hidden');
            document.getElementById('tabContentExams').classList.add('hidden');
            document.getElementById('tabContentReports').classList.remove('hidden');
            document.getElementById('tabContentReports').classList.add('flex');
            
            document.getElementById('tabBtnStudents').classList.replace('text-primary-700', 'text-gray-500');
            document.getElementById('tabBtnStudents').classList.remove('bg-white', 'shadow-sm');
            document.getElementById('tabBtnExams').classList.replace('text-primary-700', 'text-gray-500');
            document.getElementById('tabBtnExams').classList.remove('bg-white', 'shadow-sm');
            
            document.getElementById('tabBtnReports').classList.replace('text-gray-500', 'text-primary-700');
            document.getElementById('tabBtnReports').classList.add('bg-white', 'shadow-sm');
            return;
        } else {
            const rpt = document.getElementById('tabContentReports');
            if(rpt) {
                rpt.classList.add('hidden');
                rpt.classList.remove('flex');
            }
            const btn = document.getElementById('tabBtnReports');
            if(btn) {
                btn.classList.replace('text-primary-700', 'text-gray-500');
                btn.classList.remove('bg-white', 'shadow-sm');
            }
        }
`);

fs.writeFileSync('dashboard.html', html, 'utf8');
console.log('JS for reports added successfully.');
