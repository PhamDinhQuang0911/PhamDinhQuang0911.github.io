const fs = require('fs');
let html = fs.readFileSync('student.html', 'utf8');

// 1. UPDATE HTML FOR #tab-dashboard
const startHTML = html.indexOf('<div id="tab-dashboard"');
const endHTML = html.indexOf('<div id="tab-practice"');

const newHTML = `<div id="tab-dashboard" class="tab-content space-y-8 animate-fade-in">
    <!-- KHUNG CHÀO MỪNG -->
    <div class="bg-gradient-to-br from-primary-600 to-blue-600 rounded-3xl p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
        <div class="relative z-10">
            <h1 class="text-2xl md:text-4xl font-black mb-3 tracking-tight">Chào mừng trở lại, <span id="welcomeName">...</span>! 👋</h1>
            <p class="text-primary-100 mb-8 text-sm md:text-lg max-w-2xl leading-relaxed">Hôm nay là một ngày tuyệt vời để học tập. Kiểm tra ngay các bài tập đang chờ bạn phía dưới nhé!</p>
            <button onclick="switchTab('classes')" class="bg-white text-primary-700 px-6 md:px-8 py-3 rounded-full font-black hover:bg-primary-50 transition shadow-md text-sm md:text-base flex items-center gap-2 inline-flex"><i class="fa-solid fa-arrow-down"></i> Vào lớp học ngay</button>
        </div>
        <div class="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-white/10 to-transparent skew-x-12 transform origin-top-right"></div>
        <div class="absolute bottom-0 left-10 w-40 h-40 bg-primary-500/30 rounded-full blur-2xl"></div>
        <!-- Cây phong (Seasonal Tree) -->
        <div id="sidebarDecorTree" class="absolute bottom-0 right-0 w-40 h-40 md:w-56 md:h-56 pointer-events-none opacity-90 flex items-end justify-end overflow-hidden"></div>
    </div>
    
    <!-- KHU NÚT NHANH (Mới) -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
        <!-- Nút Luyện tập AI (Thu nhỏ) -->
        <div onclick="switchTab('practice'); loadStudentPracticeHistory()" class="bg-indigo-50 p-4 md:p-6 rounded-3xl shadow-sm border border-indigo-100 cursor-pointer hover:-translate-y-1 transition-all group relative overflow-hidden flex flex-col items-center justify-center text-center">
            <div class="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl flex items-center justify-center text-2xl shadow-md group-hover:scale-110 transition-transform duration-300 mb-3">
                <i class="fa-solid fa-brain"></i>
            </div>
            <h3 class="text-[15px] md:text-lg font-black text-indigo-900 group-hover:text-indigo-600 transition-colors">Luyện tập AI</h3>
            <span class="absolute top-3 right-3 bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">Mới</span>
        </div>

        <!-- Nút Khóa học -->
        <div onclick="switchTab('classes')" class="bg-blue-50 p-4 md:p-6 rounded-3xl shadow-sm border border-blue-100 cursor-pointer hover:-translate-y-1 transition-all group flex flex-col items-center justify-center text-center">
            <div class="w-14 h-14 bg-gradient-to-br from-blue-500 to-cyan-500 text-white rounded-2xl flex items-center justify-center text-2xl shadow-md group-hover:scale-110 transition-transform duration-300 mb-3">
                <i class="fa-solid fa-book-open"></i>
            </div>
            <h3 class="text-[15px] md:text-lg font-black text-blue-900 group-hover:text-blue-600 transition-colors">Khóa học của tôi</h3>
        </div>

        <!-- Nút Đăng ký khóa mới -->
        <div onclick="switchTab('market')" class="bg-orange-50 p-4 md:p-6 rounded-3xl shadow-sm border border-orange-100 cursor-pointer hover:-translate-y-1 transition-all group flex flex-col items-center justify-center text-center md:col-span-1 col-span-2">
            <div class="w-14 h-14 bg-gradient-to-br from-orange-400 to-red-500 text-white rounded-2xl flex items-center justify-center text-2xl shadow-md group-hover:scale-110 transition-transform duration-300 mb-3">
                <i class="fa-solid fa-cart-shopping"></i>
            </div>
            <h3 class="text-[15px] md:text-lg font-black text-orange-900 group-hover:text-orange-600 transition-colors">Đăng ký khóa mới</h3>
        </div>
    </div>
    
    <!-- KHU BÀI TẬP VỀ NHÀ -->
    <div>
        <h3 class="font-bold text-gray-800 text-xl mb-6 flex items-center gap-3"><span class="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-sm"><i class="fa-solid fa-bell"></i></span><span id="pendingTitle">Đang kiểm tra bài tập...</span></h3>
        <div id="pendingTasksList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
            <div class="col-span-full py-12 text-center bg-white rounded-2xl border border-dashed border-primary-200"><i class="fa-solid fa-circle-notch fa-spin text-primary-500 text-3xl mb-4"></i><p class="text-gray-500 font-medium">Đang tải dữ liệu...</p></div>
        </div>
    </div>
</div>
            
            `;

if (startHTML !== -1 && endHTML !== -1) {
    html = html.substring(0, startHTML) + newHTML + html.substring(endHTML);
}

// 2. REVERT JS FOR PENDING TASKS
const jsStart = html.indexOf('let html = \'\';\n                pendingExams.forEach(ex => {');
const jsEndStr = 'container.innerHTML = html;';
const jsEnd = html.indexOf(jsEndStr, jsStart);

if (jsStart !== -1 && jsEnd !== -1) {
    const newJS = `let html = '';
                pendingExams.forEach(ex => {
                    html += \`<div class="bg-white p-2 md:p-4 rounded-2xl shadow-sm border border-primary-50 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all hover:border-primary-200 group" onclick="window.location.href='exam.html?id=\${ex.id}'"><div class="w-14 h-14 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold shrink-0 relative"><i class="fa-solid fa-file-pen text-xl"></i><span class="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse"></span></div><div class="flex-1 min-w-0"><div class="flex justify-between items-center mb-1"><span class="text-[10px] font-black text-gray-400 uppercase tracking-wider">Bài tập mới</span><span class="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Chưa làm</span></div><h4 class="font-bold text-gray-800 text-base line-clamp-1 group-hover:text-brand transition-colors">\${ex.title}</h4><p class="text-xs text-gray-500 font-medium mt-1 flex items-center gap-3"><span><i class="fa-regular fa-clock text-primary-500"></i> \${ex.duration}p</span><span><i class="fa-solid fa-list-ol text-primary-500"></i> \${ex.questionCount||0} câu</span></p></div><button class="text-sm bg-brand text-white w-10 h-10 rounded-full font-bold flex items-center justify-center hover:bg-primary-700 transition-all hover:scale-110 shadow-sm"><i class="fa-solid fa-play ml-0.5"></i></button></div>\`;
                });
                `;
    html = html.substring(0, jsStart) + newJS + html.substring(jsEnd);
} else {
    // If we couldn't find the exact match, we will just replace the entire function to be absolutely safe.
    const funcStart = html.indexOf('async function loadPendingTasks');
    if (funcStart !== -1) {
        // Find end of function
        let bracketCount = 0;
        let funcEnd = -1;
        for (let i = funcStart; i < html.length; i++) {
            if (html[i] === '{') bracketCount++;
            if (html[i] === '}') {
                bracketCount--;
                if (bracketCount === 0) {
                    funcEnd = i + 1;
                    break;
                }
            }
        }
        
        if (funcEnd !== -1) {
            const originalFunc = `async function loadPendingTasks(user) {
            const container = document.getElementById('pendingTasksList');
            const titleEl = document.getElementById('pendingTitle');
            if(!container) return;

            container.innerHTML = \`
                <div class="bg-white p-2 md:p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 h-24 animate-pulse">
                    <div class="w-14 h-14 rounded-xl bg-gray-200 shrink-0"></div>
                    <div class="flex-1 space-y-2"><div class="h-4 bg-gray-200 rounded w-3/4"></div><div class="h-3 bg-gray-200 rounded w-1/2"></div></div>
                </div>\`.repeat(3);

            try {
                const qClasses = query(collection(db, "classes"));
                const snapClasses = await getDocs(qClasses);
                const myClassIds = [];
                snapClasses.forEach(doc => {
                    const cl = doc.data();
                    const students = cl.students || [];
                    if (students.some(s => (s.email && s.email.toLowerCase() === user.email.toLowerCase()) || (s.uid === user.uid))) {
                        myClassIds.push(doc.id);
                    }
                });

                if (myClassIds.length === 0) { 
                    titleEl.innerText = "Em chưa tham gia lớp nào";
                    container.innerHTML = '<div class="col-span-full py-8 text-center bg-white rounded-2xl border border-dashed border-primary-200"><p class="text-gray-500 font-medium">Bạn chưa tham gia lớp nào.</p></div>'; 
                    return; 
                }

                const qResults = query(collection(db, "results"), where("studentId", "==", user.uid));
                const snapResults = await getDocs(qResults);
                const submittedExamIds = new Set();
                snapResults.forEach(d => submittedExamIds.add(d.data().examId));

                const qEx = query(collection(db, "exams"), where("accessType", "==", "class"), where("status", "==", "published"));
                const snapEx = await getDocs(qEx);

                let pendingExams = [];
                snapEx.forEach(d => {
                    const ex = d.data();
                    if (submittedExamIds.has(d.id)) return;

                    let isAssignedToMe = false;
                    if (ex.allowedClassIds && Array.isArray(ex.allowedClassIds)) {
                        if (ex.allowedClassIds.some(id => myClassIds.includes(id))) isAssignedToMe = true;
                    } else if (ex.allowedClassId) {
                        if (myClassIds.includes(ex.allowedClassId)) isAssignedToMe = true;
                    }
                    if (isAssignedToMe) pendingExams.push({id: d.id, ...ex});
                });
                
                pendingExams.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                pendingExams = pendingExams.slice(0, 10);

                titleEl.innerHTML = \`Em có <span class="text-red-500 font-black text-2xl mx-1">\${pendingExams.length}</span> bài tập cần hoàn thành\`;

                if (pendingExams.length === 0) { 
                    container.innerHTML = '<div class="col-span-full py-8 text-center bg-white rounded-2xl border border-dashed border-primary-200 shadow-sm"><i class="fa-solid fa-circle-check text-primary-500 text-4xl mb-3"></i><p class="text-gray-800 font-bold mb-1">Tuyệt vời! Bạn đã hoàn thành hết bài tập.</p></div>'; 
                    return; 
                }

                let html = '';
                pendingExams.forEach(ex => {
                    html += \`<div class="bg-white p-2 md:p-4 rounded-2xl shadow-sm border border-primary-50 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all hover:border-primary-200 group" onclick="window.location.href='exam.html?id=\${ex.id}'"><div class="w-14 h-14 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold shrink-0 relative"><i class="fa-solid fa-file-pen text-xl"></i><span class="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse"></span></div><div class="flex-1 min-w-0"><div class="flex justify-between items-center mb-1"><span class="text-[10px] font-black text-gray-400 uppercase tracking-wider">Bài tập mới</span><span class="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Chưa làm</span></div><h4 class="font-bold text-gray-800 text-base line-clamp-1 group-hover:text-brand transition-colors">\${ex.title}</h4><p class="text-xs text-gray-500 font-medium mt-1 flex items-center gap-3"><span><i class="fa-regular fa-clock text-primary-500"></i> \${ex.duration}p</span><span><i class="fa-solid fa-list-ol text-primary-500"></i> \${ex.questionCount||0} câu</span></p></div><button class="text-sm bg-brand text-white w-10 h-10 rounded-full font-bold flex items-center justify-center hover:bg-primary-700 transition-all hover:scale-110 shadow-sm"><i class="fa-solid fa-play ml-0.5"></i></button></div>\`;
                });
                container.innerHTML = html;
            } catch(e) { console.error(e); }
        }`;
            html = html.substring(0, funcStart) + originalFunc + html.substring(funcEnd);
        }
    }
}

// 3. Fix seasonal tree JS: The original app probably injected it into #sidebarDecorTree. Since we moved #sidebarDecorTree into the main header, it will show up there nicely!

fs.writeFileSync('student.html', html, 'utf8');
console.log('Successfully applied all UI requests.');
