const fs = require('fs');
let c = fs.readFileSync('exam.html', 'utf8');

// ===============================
// FIX 1: Include Firestore doc ID when loading examHistory
// Without this, currentResultId is undefined, and requestResubmit throws an error
// ===============================
c = c.replace(
    "window.examHistory = [];\n                snap.forEach(d => window.examHistory.push(d.data()));",
    "window.examHistory = [];\n                snap.forEach(d => window.examHistory.push({ id: d.id, ...d.data() }));"
);

// ===============================
// FIX 2: Review mode logic for homework not graded yet
// When student submitted but teacher hasn't graded: show "Chua cham" + photos + allow edit if in deadline
// Current code: isReviewMode = true whenever mode=review OR !canEdit 
// Problem: canEdit=false when deadline passed (even if not graded), so student can't see their photos
// Fix: Separate "no edit" (deadline passed) from "review" (graded). 
// When NOT graded and deadline active -> show edit mode (isEditMode=true)
// When NOT graded and deadline passed -> show review mode but with "Chua cham" notice
// When graded -> show full review with score+feedback+resubmit button
// ===============================
c = c.replace(
    `                        if (urlParams.get('mode') === 'review' || !canEdit) {
                            // Chế độ Đọc (Review)
                            document.getElementById('lobbyScreen').classList.add('hidden'); 
                            window.isEditMode = false;
                            window.isReviewMode = true;
                            renderHomeworkView(); 
                            return;
                        } else {
                            // CÒN HẠN -> Cho phép sửa ảnh (Edit Mode)
                            document.getElementById('lobbyScreen').classList.add('hidden');
                            window.isEditMode = true;
                            window.isReviewMode = false;
                            renderHomeworkView();
                            
                            // Đổi giao diện nút Nộp bài thành Cập nhật
                            setTimeout(() => {
                                const btn = document.querySelector('#hwUploadArea button[onclick="submitHomework()"]');
                                if(btn) {
                                    btn.innerHTML = '<i class="fa-solid fa-pen"></i> CẬP NHẬT LẠI BÀI LÀM';
                                    btn.classList.remove('bg-blue-600', 'shadow-blue-200', 'hover:bg-blue-700');
                                    btn.classList.add('bg-orange-500', 'shadow-orange-200', 'hover:bg-orange-600');
                                }
                            }, 100);
                            return;
                        }`,
    `                        const isGraded = !!resultData.gradedAt;
                        const isResubmitPending = resultData.resubmitStatus === 'requested';
                        
                        if (urlParams.get('mode') === 'review' || isGraded || isResubmitPending) {
                            // Chế độ Đọc (Review) - Đã chấm hoặc xem lại
                            document.getElementById('lobbyScreen').classList.add('hidden'); 
                            window.isEditMode = false;
                            window.isReviewMode = true;
                            renderHomeworkView(); 
                            return;
                        } else if (canEdit) {
                            // CÒN HẠN & CHƯA CHẤM -> Cho phép sửa ảnh (Edit Mode)
                            document.getElementById('lobbyScreen').classList.add('hidden');
                            window.isEditMode = true;
                            window.isReviewMode = false;
                            renderHomeworkView();
                            
                            // Đổi giao diện nút Nộp bài thành Cập nhật
                            setTimeout(() => {
                                const btn = document.querySelector('#hwUploadArea button[onclick="submitHomework()"]');
                                if(btn) {
                                    btn.innerHTML = '<i class="fa-solid fa-pen"></i> CẬP NHẬT LẠI BÀI LÀM';
                                    btn.classList.remove('bg-blue-600', 'shadow-blue-200', 'hover:bg-blue-700');
                                    btn.classList.add('bg-orange-500', 'shadow-orange-200', 'hover:bg-orange-600');
                                }
                            }, 100);
                            return;
                        } else {
                            // HẾT HẠN & CHƯA CHẤM -> Xem lại bài đã nộp (không sửa được, hiện "Chưa chấm")
                            document.getElementById('lobbyScreen').classList.add('hidden'); 
                            window.isEditMode = false;
                            window.isReviewMode = true;
                            renderHomeworkView(); 
                            return;
                        }`
);

// ===============================
// FIX 3: Show "Chua cham" notice in review mode when teacher hasn't graded yet
// Also show submitted images even if not graded
// ===============================
// Find the review mode rendering block and update the logic
// Current: Shows score panel + graded images always
// Fix: If r.gradedAt is falsy -> show "Chua cham" status, show submitted photos (r.answers[0])
c = c.replace(
    `            if (window.isReviewMode) {
                // CHẾ ĐỘ ĐỌC (REVIEW) - HỌC SINH XEM LẠI BÀI ĐÃ CHẤM / ĐANG CHỜ DUYỆT
                const r = window.currentResultData || {};
                
                let statusHtml = '';
                let gradedImagesHtml = '';
                
                if (r.resubmitStatus === 'graded') {
                    statusHtml = \`<div class="bg-green-100 border border-green-300 text-green-800 p-4 rounded-xl mb-6 font-bold flex items-center gap-3"><i class="fa-solid fa-check-double text-2xl"></i> Thầy cô đã chấm bài xong!</div>\`;
                } else if (r.resubmitStatus === 'requested') {
                    statusHtml = \`<div class="bg-yellow-100 border border-yellow-300 text-yellow-800 p-4 rounded-xl mb-6 font-bold flex items-center gap-3"><i class="fa-solid fa-hourglass-half text-2xl animate-spin"></i> Đang chờ giáo viên duyệt yêu cầu nộp lại...</div>\`;
                } else if (r.resubmitStatus === 'rejected') {
                    statusHtml = \`<div class="bg-red-100 border border-red-300 text-red-800 p-4 rounded-xl mb-6 font-bold flex items-center gap-3"><i class="fa-solid fa-ban text-2xl"></i> Giáo viên đã từ chối yêu cầu nộp lại.</div>\`;
                }`,
    `            if (window.isReviewMode) {
                // CHẾ ĐỘ ĐỌC (REVIEW) - HỌC SINH XEM LẠI BÀI ĐÃ CHẤM / ĐANG CHỜ DUYỆT
                const r = window.currentResultData || {};
                
                let statusHtml = '';
                let gradedImagesHtml = '';
                
                if (!r.gradedAt) {
                    // Chưa chấm -> Thông báo chờ
                    statusHtml = \`<div class="bg-gray-100 border border-gray-300 text-gray-700 p-4 rounded-xl mb-6 font-bold flex items-center gap-3"><i class="fa-solid fa-clock text-2xl text-orange-500"></i> Bài làm của em đã được nộp. Giáo viên chưa chấm bài, vui lòng chờ nhé!</div>\`;
                } else if (r.resubmitStatus === 'graded') {
                    statusHtml = \`<div class="bg-green-100 border border-green-300 text-green-800 p-4 rounded-xl mb-6 font-bold flex items-center gap-3"><i class="fa-solid fa-check-double text-2xl"></i> Thầy cô đã chấm bài xong!</div>\`;
                } else if (r.resubmitStatus === 'requested') {
                    statusHtml = \`<div class="bg-yellow-100 border border-yellow-300 text-yellow-800 p-4 rounded-xl mb-6 font-bold flex items-center gap-3"><i class="fa-solid fa-hourglass-half text-2xl animate-spin"></i> Đang chờ giáo viên duyệt yêu cầu nộp lại...</div>\`;
                } else if (r.resubmitStatus === 'rejected') {
                    statusHtml = \`<div class="bg-red-100 border border-red-300 text-red-800 p-4 rounded-xl mb-6 font-bold flex items-center gap-3"><i class="fa-solid fa-ban text-2xl"></i> Giáo viên đã từ chối yêu cầu nộp lại.</div>\`;
                }`
);

// Fix the score panel to show "Chưa chấm" when not graded, and display submitted images
c = c.replace(
    `                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="bg-orange-50 p-6 rounded-xl border border-orange-200 flex flex-col items-center justify-center text-center">
                                <h4 class="font-bold text-orange-800 text-sm uppercase mb-2 tracking-wider">Điểm số</h4>
                                <div class="text-7xl font-black text-orange-600">\${r.score !== undefined ? r.score : '?'}</div>
                            </div>
                            <div class="bg-blue-50 p-6 rounded-xl border border-blue-200">
                                <h4 class="font-bold text-blue-800 text-sm uppercase mb-3"><i class="fa-solid fa-comment-dots"></i> Lời phê của Giáo viên</h4>
                                <div class="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">\${processedFeedback}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white p-6 md:p-10 rounded-2xl shadow-sm border border-gray-200 mb-6 text-center bg-gray-50">
                        <h4 class="font-bold text-gray-800 text-xl mb-8 uppercase tracking-wide border-b border-gray-200 pb-4">Chi tiết bài chấm</h4>
                        \${gradedImagesHtml || '<div class="text-gray-500 italic py-10 bg-gray-100 rounded-lg"><i class="fa-regular fa-image text-4xl block mb-2"></i>Giáo viên không đính kèm ảnh chi tiết.</div>'}
                    </div>

                    \${(r.resubmitStatus === 'graded' || r.resubmitStatus === 'rejected') ? \`
                    <div class="text-center mt-10 pt-8 border-t border-gray-200">
                        <p class="text-sm text-gray-500 mb-4">Nếu em thấy cần cải thiện điểm số, em có thể xin phép giáo viên để nộp lại bài.</p>
                        <button onclick="window.requestResubmit()" class="py-4 px-10 bg-purple-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-purple-200 hover:bg-purple-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-2 mx-auto">
                            <i class="fa-solid fa-rotate-right"></i> Xin phép Nộp lại bài
                        </button>
                    </div>
                    \` : ''}
                \`;`,
    `                    \${r.gradedAt ? \`
                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="bg-orange-50 p-6 rounded-xl border border-orange-200 flex flex-col items-center justify-center text-center">
                                <h4 class="font-bold text-orange-800 text-sm uppercase mb-2 tracking-wider">Điểm số</h4>
                                <div class="text-7xl font-black text-orange-600">\${r.score !== undefined ? r.score : '?'}</div>
                            </div>
                            <div class="bg-blue-50 p-6 rounded-xl border border-blue-200">
                                <h4 class="font-bold text-blue-800 text-sm uppercase mb-3"><i class="fa-solid fa-comment-dots"></i> Lời phê của Giáo viên</h4>
                                <div class="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">\${processedFeedback}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white p-6 md:p-10 rounded-2xl shadow-sm border border-gray-200 mb-6 text-center bg-gray-50">
                        <h4 class="font-bold text-gray-800 text-xl mb-8 uppercase tracking-wide border-b border-gray-200 pb-4">Chi tiết bài chấm</h4>
                        \${gradedImagesHtml || '<div class="text-gray-500 italic py-10 bg-gray-100 rounded-lg"><i class="fa-regular fa-image text-4xl block mb-2"></i>Giáo viên không đính kèm ảnh chi tiết.</div>'}
                    </div>
                    \${(r.resubmitStatus === 'graded' || r.resubmitStatus === 'rejected') ? \`
                    <div class="text-center mt-10 pt-8 border-t border-gray-200">
                        <p class="text-sm text-gray-500 mb-4">Nếu em thấy cần cải thiện điểm số, em có thể xin phép giáo viên để nộp lại bài.</p>
                        <button onclick="window.requestResubmit()" class="py-4 px-10 bg-purple-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-purple-200 hover:bg-purple-700 hover:-translate-y-1 transition-all flex items-center justify-center gap-2 mx-auto">
                            <i class="fa-solid fa-rotate-right"></i> Xin phép Nộp lại bài
                        </button>
                    </div>
                    \` : ''}
                    \` : \`
                    <div class="bg-white p-6 md:p-10 rounded-2xl shadow-sm border border-gray-200 mb-6 text-center">
                        <h4 class="font-bold text-gray-800 text-xl mb-6 uppercase tracking-wide border-b border-gray-200 pb-4">Ảnh bài làm em đã nộp</h4>
                        \${(r.answers && r.answers[0] && r.answers[0].length > 0) 
                            ? r.answers[0].map((url, i) => \`<div class="relative shadow-xl rounded-xl overflow-hidden border-2 border-gray-200 mb-6 inline-block max-w-[900px] w-full"><div class="absolute -top-3 -left-3 w-10 h-10 bg-blue-600 text-white font-black text-lg flex items-center justify-center rounded-full shadow-lg border-2 border-white z-10">\${i+1}</div><img src="\${url}" class="w-full h-auto block"></div>\`).join('')
                            : '<div class="text-gray-400 italic py-10"><i class="fa-regular fa-image text-4xl block mb-2"></i>Không tìm thấy ảnh bài làm.</div>'
                        }
                    </div>
                    \`}
                \`;`
);

// ===============================
// FIX 4: Homework submit - use same class detection as regular exam
// Replace simplified class detection with full detection logic
// ===============================
c = c.replace(
    `                let detectedClassId = "vang_lai";
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.get('classId')) detectedClassId = urlParams.get('classId');
                
                const resultData = {`,
    `                let detectedClassId = "vang_lai";
                const urlParamsHW = new URLSearchParams(window.location.search);
                if (urlParamsHW.get('classId')) {
                    detectedClassId = urlParamsHW.get('classId');
                } else {
                    // Dò tìm lớp học của học sinh (giống logic thi thông thường)
                    try {
                        const classQueryHW = query(collection(db, "classes"), where("members", "array-contains", currentUser.uid));
                        const classSnapsHW = await getDocs(classQueryHW);
                        for (const clsDoc of classSnapsHW.docs) {
                            const clsData = clsDoc.data();
                            let hasExam = false;
                            if (clsData.exams && Array.isArray(clsData.exams) && clsData.exams.includes(examId)) {
                                hasExam = true;
                            } else if (clsData.exams && Array.isArray(clsData.exams)) {
                                hasExam = clsData.exams.some(e => (e.id === examId || e.examId === examId));
                            } else if (clsData.curriculum && JSON.stringify(clsData.curriculum).includes(examId)) {
                                hasExam = true;
                            }
                            if (hasExam) { detectedClassId = clsDoc.id; break; }
                        }
                    } catch (err) { console.warn("Lỗi dò tìm lớp HW:", err); }
                }
                
                const resultData = {`
);

fs.writeFileSync('exam.html', c);
console.log('All fixes applied to exam.html');
