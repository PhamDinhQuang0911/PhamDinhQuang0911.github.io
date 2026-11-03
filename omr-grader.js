import { 
    initializeApp, getAuth, onAuthStateChanged, signOut,
    getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, deleteDoc,
    enableMultiTabIndexedDbPersistence
} from "./supabase-db-compat.js?v=25";

const app = initializeApp({});
const auth = getAuth(app);
const db = getFirestore(app);

// Global State
window.omrState = {
    user: null,
    teacherUid: null,
    exams: [],
    exam: null,
    keys: {},
    students: [],
    submissions: [],
    activeTab: 'scan',
    currentCameraStream: null,
    currentFacingMode: 'environment',
    lastSubmission: null,
    isProcessing: false
};

const state = window.omrState;

// ========================================================
// 1. AUTHENTICATION & LMS USER INTEGRATION
// ========================================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Fallback: Check localStorage from QMath LMS session
        const localUserStr = localStorage.getItem('qmath_user') || localStorage.getItem('loggedInUser');
        if (localUserStr) {
            try {
                const u = JSON.parse(localUserStr);
                if (u && (u.uid || u.email)) {
                    state.user = u;
                    state.teacherUid = u.uid || u.email;
                    initTeacherUI();
                    await loadTeacherExams();
                    return;
                }
            } catch(e) {}
        }
        // Redirect to login page of LMS
        Swal.fire({
            icon: 'warning',
            title: 'Chưa đăng nhập QMath LMS',
            text: 'Vui lòng đăng nhập tài khoản giáo viên để sử dụng tính năng Chấm thi OMR!',
            confirmButtonText: 'Đến trang đăng nhập',
            confirmButtonColor: '#10b981'
        }).then(() => {
            window.location.href = 'index.html?redirect=omr-grader.html';
        });
        return;
    }

    state.user = user;
    state.teacherUid = user.uid;
    initTeacherUI();
    await loadTeacherExams();
});

function initTeacherUI() {
    const nameEl = document.getElementById('userDisplayName');
    const avatarEl = document.getElementById('userAvatar');
    const name = state.user.displayName || state.user.name || state.user.email || 'Giáo viên';
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) {
        const initial = name.trim().charAt(0).toUpperCase() || 'G';
        avatarEl.textContent = initial;
    }
}

window.handleLmsLogout = async () => {
    const res = await Swal.fire({
        title: 'Đăng xuất khỏi hệ thống?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Đăng xuất',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#ef4444'
    });
    if (res.isConfirmed) {
        try { await signOut(auth); } catch(e) {}
        localStorage.removeItem('qmath_user');
        localStorage.removeItem('loggedInUser');
        window.location.href = 'index.html';
    }
};

// ========================================================
// 2. THEME & TABS SWITCHING
// ========================================================
window.toggleDarkMode = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    document.body?.classList.toggle('night', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    localStorage.setItem('qmath_theme', isDark ? 'dark' : 'light');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = isDark ? 'fa-solid fa-sun text-amber-400' : 'fa-solid fa-moon text-slate-600';
};

// Initialize Theme
(function() {
    const saved = localStorage.getItem('theme') || localStorage.getItem('qmath_theme');
    const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        document.documentElement.classList.add('dark');
        document.body?.classList.add('night');
        const icon = document.getElementById('themeIcon');
        if (icon) icon.className = 'fa-solid fa-sun text-amber-400';
    }
})();

window.switchTab = (tabName) => {
    state.activeTab = tabName;
    ['overview', 'scan', 'results', 'keys', 'students', 'downloads', 'exams'].forEach(t => {
        const v = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if (v) v.classList.toggle('hidden', t !== tabName);
        if (btn) {
            if (t === tabName) {
                btn.className = "tab-btn px-3 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400 dark:border-emerald-400 transition-all flex items-center gap-2 shrink-0";
            } else {
                btn.className = "tab-btn px-3 sm:px-4 py-3 font-bold text-xs sm:text-sm border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-all flex items-center gap-2 shrink-0";
            }
        }
    });

    if (tabName === 'scan') {
        // If switching away from camera, ensure camera is stopped
    } else {
        window.stopCameraStream();
    }

    if (tabName === 'overview') updateOverviewStats();
    if (tabName === 'results') window.renderResultsTable();
    if (tabName === 'keys') window.renderKeysTab();
    if (tabName === 'students') window.renderStudentsTab();
    if (tabName === 'downloads') window.renderDownloadsTab();
    if (tabName === 'exams') window.renderExamsListTab();
};

// ========================================================
// 3. EXAMS & DATA MANAGEMENT (Firestore + LocalStorage + LMS Integration)
// ========================================================
state.lmsExams = [];

function normalizeLmsExam(raw) {
    const qList = Array.isArray(raw.questions) ? raw.questions : [];
    const mcCount = qList.filter(q => q.type === 'mc').length;
    const tfCount = qList.filter(q => q.type === 'tf').length;
    const shortCount = qList.filter(q => q.type === 'short').length;

    return {
        id: raw.id,
        teacherId: raw.teacherId || state.teacherUid,
        name: raw.title || raw.name || 'Đề thi LMS',
        subject: raw.subject || 'Toán học',
        sheet_template: raw.sheet_template || 'qmcv1239',
        question_count: mcCount > 0 ? mcCount : (raw.question_count || 12),
        part2_count: tfCount > 0 ? tfCount : (raw.part2_count || 4),
        part3_count: shortCount > 0 ? shortCount : (raw.part3_count || 6),
        part1_point: raw.part1_point || 0.25,
        part2_points: raw.part2_points || [0.1, 0.25, 0.5, 1.0],
        part3_point: raw.part3_point || 0.5,
        codes: raw.codes && raw.codes.length > 0 ? raw.codes : (raw.mixedExams ? Object.keys(raw.mixedExams) : ['101', '102']),
        questions: qList,
        isLmsExam: true,
        createdAt: raw.createdAt || new Date().toISOString()
    };
}

function autoFillKeysFromLmsQuestions(ex) {
    if (!ex.questions || ex.questions.length === 0) return;
    const primaryCode = (ex.codes && ex.codes[0]) ? ex.codes[0] : '101';
    
    // Extract Part 1
    const mcQuestions = ex.questions.filter(q => q.type === 'mc');
    const p1Ans = mcQuestions.map(q => {
        if (q.ans && typeof q.ans === 'string') return q.ans.trim().toUpperCase()[0] || 'A';
        if (q.correct && typeof q.correct === 'string') return q.correct.trim().toUpperCase()[0] || 'A';
        if (Array.isArray(q.options)) {
            const corrIdx = q.options.findIndex(o => o.isCorrect || o.correct);
            if (corrIdx !== -1) return ['A','B','C','D'][corrIdx] || 'A';
        }
        return 'A';
    }).join('');

    // Extract Part 2
    const tfQuestions = ex.questions.filter(q => q.type === 'tf');
    const p2Ans = tfQuestions.map(q => {
        if (Array.isArray(q.answers)) return q.answers.map(a => a === 'D' || a === true ? 'Đ' : 'S').join('');
        if (Array.isArray(q.options)) return q.options.map(opt => opt.isCorrect ? 'Đ' : 'S').join('');
        return 'ĐSĐS';
    });

    // Extract Part 3
    const shortQuestions = ex.questions.filter(q => q.type === 'short');
    const p3Ans = shortQuestions.map(q => String(q.ans || q.correct || '0').trim());

    if (!state.keys[primaryCode]) {
        state.keys[primaryCode] = {
            id: `key_${ex.id}_${primaryCode}`,
            examId: ex.id,
            teacherId: state.teacherUid,
            code: primaryCode,
            answers: p1Ans,
            part2: p2Ans,
            part3: p3Ans,
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(`omr_keys_${ex.id}`, JSON.stringify(Object.values(state.keys)));
    }
}

async function loadTeacherExams() {
    try {
        let omrLoaded = [];
        let lmsLoaded = [];

        // 1. Try loading omr_exams from Firestore
        if (state.teacherUid) {
            try {
                const qOmr = query(collection(db, "omr_exams"), where("teacherId", "==", state.teacherUid));
                const snapOmr = await getDocs(qOmr);
                omrLoaded = snapOmr.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch(e) {
                console.warn("Firestore omr_exams failed:", e);
            }

            // 2. Try loading LMS exams collection
            try {
                const qLms = query(collection(db, "exams"), limit(120));
                const snapLms = await getDocs(qLms);
                lmsLoaded = snapLms.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(e => !e.isDeleted && (e.title || e.name));
            } catch(e) {
                console.warn("Firestore exams query failed:", e);
            }
        }

        // 3. Check localStorage cache for LMS exams (from dashboard.html)
        const uid = state.teacherUid || localStorage.getItem('last_active_uid') || '';
        const cachedBankExams = localStorage.getItem(`bank_exams_${uid}_own`) || localStorage.getItem(`bank_exams_${uid}_shared`);
        if (cachedBankExams) {
            try {
                const parsedCached = JSON.parse(cachedBankExams) || [];
                parsedCached.forEach(ce => {
                    if (ce && !ce.isDeleted && ce.title && !lmsLoaded.some(l => l.id === ce.id)) {
                        lmsLoaded.push(ce);
                    }
                });
            } catch(e) {}
        }

        // 4. Fallback or merge with localStorage omr_exams
        const localKey = 'omr_exams_' + (state.teacherUid || 'guest');
        const localOmr = JSON.parse(localStorage.getItem(localKey) || '[]');
        if (omrLoaded.length === 0 && localOmr.length > 0) {
            omrLoaded = localOmr;
        }

        // Normalize LMS exams
        state.lmsExams = lmsLoaded.map(e => normalizeLmsExam(e));

        // Combined list: OMR exams + LMS exams
        let combined = [...omrLoaded, ...state.lmsExams];

        // Seed Sample Exam if none exists
        if (combined.length === 0) {
            const sampleExam = createSampleExamObj();
            combined = [sampleExam];
            saveLocalExams([sampleExam]);
        }

        state.exams = combined;
        const lastSelectedId = localStorage.getItem('omr_last_exam_id_' + state.teacherUid);
        const targetExam = state.exams.find(e => e.id === lastSelectedId) || state.exams[0];
        await selectExam(targetExam.id);
    } catch(err) {
        console.error("Lỗi tải bài thi OMR/LMS:", err);
    }
}

function createSampleExamObj() {
    return {
        id: 'exam_' + (state.teacherUid || 'demo') + '_' + Date.now(),
        teacherId: state.teacherUid || 'demo',
        name: 'Đề minh họa Tốt nghiệp THPT 2025 - Toán',
        subject: 'Toán học',
        sheet_template: 'qmcv1239',
        question_count: 12,
        part2_count: 4,
        part3_count: 6,
        part1_point: 0.25,
        part2_points: [0.1, 0.25, 0.5, 1.0],
        part3_point: 0.5,
        codes: ['101', '102', '103', '104'],
        createdAt: new Date().toISOString()
    };
}

function createSampleKeys(examId) {
    return [
        {
            id: `key_${examId}_101`,
            examId,
            teacherId: state.teacherUid,
            code: '101',
            answers: 'ABCDABCDABCD',
            part2: ['ĐSĐS', 'SĐSĐ', 'ĐĐSS', 'SSĐĐ'],
            part3: ['3', '-4,5', '12', '1,5', '20', '-1'],
            updatedAt: new Date().toISOString()
        },
        {
            id: `key_${examId}_102`,
            examId,
            teacherId: state.teacherUid,
            code: '102',
            answers: 'BCDAABCDABCD',
            part2: ['SĐSĐ', 'ĐSĐS', 'SSĐĐ', 'ĐĐSS'],
            part3: ['-1', '3', '1,5', '12', '-4,5', '20'],
            updatedAt: new Date().toISOString()
        }
    ];
}

function createSampleStudents(examId) {
    return [
        { id: `st_${examId}_001`, examId, teacherId: state.teacherUid, student_no: '001', name: 'Nguyễn Văn An', class_name: '12A1' },
        { id: `st_${examId}_002`, examId, teacherId: state.teacherUid, student_no: '002', name: 'Trần Thị Bình', class_name: '12A1' },
        { id: `st_${examId}_003`, examId, teacherId: state.teacherUid, student_no: '003', name: 'Lê Hoàng Cường', class_name: '12A1' },
        { id: `st_${examId}_004`, examId, teacherId: state.teacherUid, student_no: '004', name: 'Phạm Minh Đức', class_name: '12A2' },
        { id: `st_${examId}_005`, examId, teacherId: state.teacherUid, student_no: '005', name: 'Vũ Ngọc Hân', class_name: '12A2' }
    ];
}

function saveLocalExams(exams) {
    const localKey = 'omr_exams_' + (state.teacherUid || 'guest');
    localStorage.setItem(localKey, JSON.stringify(exams));
}

async function selectExam(examId) {
    const exam = state.exams.find(e => e.id === examId);
    if (!exam) return;
    state.exam = exam;
    localStorage.setItem('omr_last_exam_id_' + state.teacherUid, exam.id);

    // Update banner
    const titleEl = document.getElementById('activeExamName');
    const badgeEl = document.getElementById('activeExamTemplateBadge');
    if (titleEl) titleEl.textContent = exam.name + (exam.isLmsExam ? ' (LMS)' : '');
    if (badgeEl) {
        const tplName = (window.MAU && window.MAU[exam.sheet_template]) ? window.MAU[exam.sheet_template].ten : exam.sheet_template;
        badgeEl.textContent = (exam.isLmsExam ? 'LMS · ' : '') + (tplName || 'CV 1239');
    }

    // Load Exam Keys
    await loadExamKeys(exam.id);

    // If LMS exam with questions, auto-fill answer keys
    if (exam.isLmsExam && exam.questions && exam.questions.length > 0) {
        autoFillKeysFromLmsQuestions(exam);
    }

    // Load Exam Students
    await loadExamStudents(exam.id);
    // Load Exam Submissions
    await loadExamSubmissions(exam.id);

    updateOverviewStats();
}

async function loadExamKeys(examId) {
    let keys = [];
    try {
        const qSnap = await getDocs(query(collection(db, "omr_keys"), where("examId", "==", examId)));
        keys = qSnap.docs.map(d => d.data());
    } catch(e) {}
    if (keys.length === 0) {
        const local = JSON.parse(localStorage.getItem(`omr_keys_${examId}`) || '[]');
        if (local.length > 0) keys = local;
        else keys = createSampleKeys(examId);
    }
    state.keys = {};
    keys.forEach(k => { state.keys[k.code] = k; });
}

async function loadExamStudents(examId) {
    let list = [];
    try {
        const qSnap = await getDocs(query(collection(db, "omr_students"), where("examId", "==", examId)));
        list = qSnap.docs.map(d => d.data());
    } catch(e) {}
    if (list.length === 0) {
        const local = JSON.parse(localStorage.getItem(`omr_students_${examId}`) || '[]');
        if (local.length > 0) list = local;
        else list = createSampleStudents(examId);
    }
    state.students = list;
}

async function loadExamSubmissions(examId) {
    let list = [];
    try {
        const qSnap = await getDocs(query(collection(db, "omr_submissions"), where("examId", "==", examId)));
        list = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {}
    if (list.length === 0) {
        list = JSON.parse(localStorage.getItem(`omr_submissions_${examId}`) || '[]');
    }
    state.submissions = list;
}

function updateOverviewStats() {
    const totalSub = state.submissions.length;
    const badge = document.getElementById('resultsCountBadge');
    if (badge) badge.textContent = totalSub;

    const elSub = document.getElementById('statTotalSubmissions');
    const elAvg = document.getElementById('statAvgScore');
    const elMax = document.getElementById('statMaxScore');
    const elStu = document.getElementById('statTotalStudents');

    if (elSub) elSub.textContent = totalSub;
    if (elStu) elStu.textContent = state.students.length;

    if (totalSub > 0) {
        const scores = state.submissions.map(s => Number(s.score) || 0);
        const avg = (scores.reduce((a, b) => a + b, 0) / totalSub).toFixed(2);
        const max = Math.max(...scores).toFixed(2);
        if (elAvg) elAvg.textContent = avg;
        if (elMax) elMax.textContent = max;
    } else {
        if (elAvg) elAvg.textContent = '0.0';
        if (elMax) elMax.textContent = '0.0';
    }

    // Recent list preview in overview
    const recentCont = document.getElementById('overviewRecentList');
    if (recentCont) {
        if (totalSub === 0) {
            recentCont.innerHTML = `<p class="text-slate-400 text-xs py-4 text-center italic">Chưa có bài thi nào được chấm.</p>`;
        } else {
            const recent = state.submissions.slice(-5).reverse();
            recentCont.innerHTML = recent.map(s => `
                <div class="py-2.5 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono font-bold text-xs flex items-center justify-center">
                            ${s.student_no || '---'}
                        </div>
                        <div>
                            <div class="font-bold text-slate-800 dark:text-slate-200">${s.student_name || 'Học sinh SBD ' + s.student_no}</div>
                            <div class="text-[11px] text-slate-400">Mã đề: <b class="font-mono">${s.code}</b> · ${s.class_name || ''}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">${Number(s.score).toFixed(2)}đ</span>
                        <div class="text-[10px] text-slate-400">${new Date(s.createdAt).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'})}</div>
                    </div>
                </div>
            `).join('');
        }
    }
}

// ========================================================
// 4. OMR SCANNING & RECOGNITION CORE ENGINE
// ========================================================
window.setScanMode = (mode) => {
    const isUpload = mode === 'upload';
    const uploadArea = document.getElementById('scanUploadArea');
    const cameraArea = document.getElementById('scanCameraArea');
    const btnUpload = document.getElementById('btnModeUpload');
    const btnCamera = document.getElementById('btnModeCamera');

    if (isUpload) {
        window.closeCameraScanner();
    } else {
        if (!state.exam) {
            Swal.fire('Lưu ý', 'Vui lòng chọn hoặc tạo bài thi trước khi quét camera!', 'warning');
            return;
        }
        if (uploadArea) uploadArea.classList.add('hidden');
        if (cameraArea) {
            cameraArea.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
        if (btnUpload) btnUpload.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-500 hover:text-slate-800 dark:text-slate-400";
        if (btnCamera) btnCamera.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-800 text-emerald-600 shadow-xs";
        window.startCameraStream();
    }
};

window.handleFilesSelected = async (files) => {
    if (!files || files.length === 0) return;
    if (!state.exam) {
        Swal.fire('Lưu ý', 'Vui lòng chọn hoặc tạo bài thi trước khi chấm!', 'warning');
        return;
    }

    const fileList = Array.from(files);
    const progressCard = document.getElementById('batchProgressBar');
    const progressFill = document.getElementById('batchProgressFill');
    const progressLabel = document.getElementById('batchProgressLabel');
    const progressPercent = document.getElementById('batchProgressPercent');

    if (fileList.length > 1) {
        progressCard.classList.remove('hidden');
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (progressPercent) progressPercent.textContent = `${i + 1}/${fileList.length} (${Math.round((i + 1) / fileList.length * 100)}%)`;
        if (progressFill) progressFill.style.width = `${Math.round((i + 1) / fileList.length * 100)}%`;
        if (progressLabel) progressLabel.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang chấm ảnh: ${file.name}`;

        try {
            await processSingleSheet(file);
            successCount++;
        } catch(err) {
            console.error("Lỗi chấm bài:", file.name, err);
            failCount++;
        }
    }

    if (fileList.length > 1) {
        setTimeout(() => progressCard.classList.add('hidden'), 1200);
        Swal.fire({
            icon: 'success',
            title: 'Hoàn tất quét bài thi!',
            text: `Đã chấm thành công ${successCount} bài thi${failCount > 0 ? `, thất bại ${failCount} bài do mờ/lỗi góc` : ''}.`,
            timer: 2500
        });
    }

    updateOverviewStats();
    window.renderResultsTable();
};

async function processSingleSheet(fileOrBlob) {
    const rawResult = await recognizeSheetWithOMR(fileOrBlob);
    if (!rawResult) throw new Error("Không tìm đủ 4 mốc đen góc phiếu!");

    // Crop candidate handwriting name
    let nameImg = null;
    if (rawResult.rectifiedImage) {
        nameImg = await cropCandidateHandwrittenName(rawResult.rectifiedImage);
    }

    // Match student name from SBD
    const sbd = (rawResult.student_no || '').replace(/\D/g, '');
    let matchedStudent = state.students.find(s => s.student_no === sbd || s.student_no === String(Number(sbd)));
    const studentName = matchedStudent ? matchedStudent.name : '';
    const className = matchedStudent ? matchedStudent.class_name : '';

    // Calculate score
    const scoreData = calculateExamScore(rawResult.code, rawResult.part1, rawResult.part2, rawResult.part3Text || rawResult.part3);

    const submission = {
        id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        examId: state.exam.id,
        teacherId: state.teacherUid,
        student_no: sbd,
        student_name: studentName,
        class_name: className,
        code: rawResult.code || state.exam.codes[0] || '101',
        score: scoreData.totalScore,
        part1_score: scoreData.part1Score,
        part2_score: scoreData.part2Score,
        part3_score: scoreData.part3Score,
        answers: rawResult.part1,
        part2: rawResult.part2,
        part3: rawResult.part3Text || rawResult.part3,
        flags: rawResult.uncertain || [],
        image_data: rawResult.rectifiedImage,
        name_image: nameImg,
        createdAt: new Date().toISOString()
    };

    // Tự động làm phẳng phiếu và đóng dấu điểm số trang nhã kèm Logo QMath LMS
    try {
        const stampedImg = await generateStampedGradedSheet(submission, rawResult);
        if (stampedImg) {
            submission.image_data = stampedImg;
            submission.stamped_image = stampedImg;
        }
    } catch(stampErr) {
        console.warn("Lỗi đóng dấu kết quả phiếu thi:", stampErr);
    }

    state.lastSubmission = submission;
    state.lastRawResult = rawResult;

    // Display in Last Result Inspector
    displayLastResultInspector(submission, rawResult);

    // Auto save if enabled (check both main toggle and camera HUD toggle)
    const autoSave = document.getElementById('cameraAutoSave')?.checked ?? (document.getElementById('autoSaveToggle')?.checked ?? true);
    if (autoSave) {
        await saveSubmissionToStore(submission);
    }

    // Play pleasant scan sound
    playBeepSound();
    return submission;
}

function recognizeSheetWithOMR(fileOrBlob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(fileOrBlob);
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);

                const gray = window.OMR.xam(ctx.getImageData(0, 0, canvas.width, canvas.height));
                const tplKey = state.exam?.sheet_template || 'qmcv1239';
                const tpl = (window.MAU && window.MAU[tplKey]) ? window.MAU[tplKey] : window.MAU.qmcv1239;

                let result = null;
                if (['qm40', 'bgd2025original', 'phutho', 'tnmaker40', 'qmcv1239'].includes(tplKey) && window.readQMSheet) {
                    result = window.readQMSheet(gray, tpl);
                } else {
                    result = window.OMR.docAnh(gray, tpl, window.OMR.thuNho(gray, 700));
                }

                if (!result) throw new Error("Không nhận diện được đủ 4 mốc đen góc phiếu!");

                // Rectify perspective to standard canvas (1552 px width)
                const outH = getSheetHeight(tplKey, tpl);
                const target = getSheetTransform(tplKey, tpl, outH);
                const outCanvas = document.createElement('canvas');
                outCanvas.width = 1552;
                outCanvas.height = outH;
                const outCtx = outCanvas.getContext('2d');
                const outData = outCtx.createImageData(outCanvas.width, outCanvas.height);

                for (let y = 0; y < outH; y++) {
                    for (let x = 0; x < outCanvas.width; x++) {
                        const cm = window.OMR.ap(target, x, y);
                        const p = window.OMR.ap(result.H, cm[0], cm[1]);
                        const xx = Math.round(p[0]);
                        const yy = Math.round(p[1]);
                        const val = (xx >= 0 && yy >= 0 && xx < gray.w && yy < gray.h) ? gray.d[yy * gray.w + xx] : 255;
                        const idx = (y * outCanvas.width + x) * 4;
                        outData.data[idx] = val;
                        outData.data[idx + 1] = val;
                        outData.data[idx + 2] = val;
                        outData.data[idx + 3] = 255;
                    }
                }
                outCtx.putImageData(outData, 0, 0);

                const p2Count = state.exam?.part2_count || 4;
                const formattedP2 = Array.from({ length: p2Count }, (_, i) => {
                    const chunk = (result.p2 || '').slice(i * 4, i * 4 + 4);
                    return chunk.replace(/D/g, 'Đ').replace(/\*/g, '?');
                });

                resolve({
                    student_no: (result.sbd || '').replace(/\D/g, ''),
                    code: (result.made || '').replace(/\D/g, ''),
                    part1: (result.p1 || '').replace(/\*/g, '?'),
                    part2: formattedP2,
                    part3: [],
                    part3Text: result.p3 || [],
                    calibrated: true,
                    rectifiedImage: outCanvas.toDataURL('image/jpeg', 0.92),
                    uncertain: result.nghi || [],
                    H: result.H,
                    template: tpl,
                    p1m: result.p1m,
                    p2m: result.p2m,
                    p3m: result.p3m,
                    raw: result
                });
            } catch(e) {
                reject(e);
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Không tải được ảnh phiếu thi"));
        };
        img.src = url;
    });
}

function getSheetHeight(tplKey, tpl) {
    if (tplKey === 'tnmaker40') return Math.round(1552 * 1746 / 2479);
    if (tplKey === 'qm40') return Math.round(1552 * 919 / 1735);
    if (['bgd2025original', 'phutho', 'qmcv1239'].includes(tplKey) && tpl?.khung) {
        return Math.round(1552 * tpl.khung[3] / tpl.khung[2]);
    }
    return 2254;
}

function getSheetTransform(tplKey, tpl, outH) {
    if (['bgd2025original', 'phutho', 'qmcv1239', 'tnmaker40', 'qm40'].includes(tplKey) && tpl?.khung) {
        const k = tpl.khung;
        return window.OMR.phepChieu([[0, 0], [1552, 0], [1552, outH], [0, outH]], [[k[0], k[1]], [k[2], k[1]], [k[2], k[3]], [k[0], k[3]]]);
    }
    return window.OMR.phepChieu([[50, 50], [1500, 50], [1500, 2200], [50, 2200]], tpl.moc.slice(0, 4).map(m => [m.x, m.y]));
}

function cropCandidateHandwrittenName(rectifiedDataUrl) {
    const tplKey = state.exam?.sheet_template || 'qmcv1239';
    let rect = [670/1653, 480/2339, 385/1653, 54/2339]; // default qmcv1239
    if (tplKey === 'bgd2025original') rect = [708/1638, 419/2339, 363/1638, 82/2339];
    else if (tplKey === 'phutho') rect = [676/1654, 391/2339, 420/1654, 65/2339];
    else if (tplKey === 'tnmaker40') rect = [1028/2479, 446/1746, 561/2479, 126/1746];
    else if (tplKey === 'qm40') rect = [1132/1735, 82/919, 357/1735, 101/919];

    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const sx = img.naturalWidth * rect[0];
            const sy = img.naturalHeight * rect[1];
            const sw = img.naturalWidth * rect[2];
            const sh = img.naturalHeight * rect[3];
            canvas.width = Math.max(1, Math.round(sw));
            canvas.height = Math.max(1, Math.round(sh));
            canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = rectifiedDataUrl;
    });
}

function calculateExamScore(code, studentP1, studentP2, studentP3) {
    const key = state.keys[code] || state.keys[Object.keys(state.keys)[0]] || { answers: '', part2: [], part3: [] };
    const p1Pt = state.exam?.part1_point ?? 0.25;
    const p2Pts = state.exam?.part2_points || [0.1, 0.25, 0.5, 1.0];
    const p3Pt = state.exam?.part3_point ?? 0.5;

    // Part I
    let p1Correct = 0;
    const keyP1 = key.answers || '';
    const qCount1 = state.exam?.question_count || 12;
    for (let i = 0; i < qCount1; i++) {
        const s = (studentP1 || '')[i];
        const k = keyP1[i];
        if (s && k && s === k && s !== '-' && s !== '?') {
            p1Correct++;
        }
    }
    const part1Score = p1Correct * p1Pt;

    // Part II: True/False with progressive barem
    let part2Score = 0;
    const qCount2 = state.exam?.part2_count || 4;
    for (let q = 0; q < qCount2; q++) {
        const sChunk = (studentP2 && studentP2[q]) ? studentP2[q] : '----';
        const kChunk = (key.part2 && key.part2[q]) ? key.part2[q] : '----';
        let matchCount = 0;
        for (let r = 0; r < 4; r++) {
            if (sChunk[r] && kChunk[r] && sChunk[r] === kChunk[r] && sChunk[r] !== '-' && sChunk[r] !== '?') {
                matchCount++;
            }
        }
        if (matchCount === 1) part2Score += p2Pts[0] || 0.1;
        else if (matchCount === 2) part2Score += p2Pts[1] || 0.25;
        else if (matchCount === 3) part2Score += p2Pts[2] || 0.5;
        else if (matchCount === 4) part2Score += p2Pts[3] || 1.0;
    }

    // Part III: Short answer
    let p3Correct = 0;
    const qCount3 = state.exam?.part3_count || 6;
    for (let q = 0; q < qCount3; q++) {
        let sAns = '';
        if (Array.isArray(studentP3)) {
            const item = studentP3[q];
            if (typeof item === 'object') {
                sAns = (item.negative ? '-' : '') + (item.digits || '');
            } else {
                sAns = String(item || '').trim();
            }
        }
        const kAns = String((key.part3 && key.part3[q]) || '').trim();
        if (sAns && kAns && sAns.replace(/\s+/g, '') === kAns.replace(/\s+/g, '')) {
            p3Correct++;
        }
    }
    const part3Score = p3Correct * p3Pt;
    const totalScore = Math.round((part1Score + part2Score + part3Score) * 100) / 100;

    return {
        part1Score: Math.round(part1Score * 100) / 100,
        part2Score: Math.round(part2Score * 100) / 100,
        part3Score: Math.round(part3Score * 100) / 100,
        totalScore,
        p1Correct,
        p3Correct
    };
}

function displayLastResultInspector(sub, rawResult) {
    const card = document.getElementById('lastResultCard');
    if (!card) return;
    card.classList.remove('hidden');

    document.getElementById('resStudentTitle').textContent = sub.student_name ? `Thí sinh: ${sub.student_name}` : `Thí sinh: SBD ${sub.student_no || '---'}`;
    document.getElementById('resScoreBadge').textContent = `${sub.score.toFixed(2)} đ`;
    document.getElementById('resSbdVal').textContent = sub.student_no || '---';
    document.getElementById('resCodeVal').textContent = sub.code || '---';
    document.getElementById('resTimeVal').textContent = new Date(sub.createdAt).toLocaleTimeString('vi-VN');

    document.getElementById('resP1Score').textContent = sub.part1_score.toFixed(2);
    document.getElementById('resP2Score').textContent = sub.part2_score.toFixed(2);
    document.getElementById('resP3Score').textContent = sub.part3_score.toFixed(2);
    document.getElementById('resTotalScore').textContent = sub.score.toFixed(2);

    // Edit fields
    document.getElementById('editSbdInput').value = sub.student_no;
    document.getElementById('editCodeInput').value = sub.code;
    document.getElementById('editStudentNameInput').value = sub.student_name;

    // Handwriting Image
    const hwImg = document.getElementById('resHandwrittenImg');
    const noHwText = document.getElementById('resNoHandwritingText');
    if (sub.name_image) {
        hwImg.src = sub.name_image;
        hwImg.classList.remove('hidden');
        noHwText.classList.add('hidden');
    } else {
        hwImg.classList.add('hidden');
        noHwText.classList.remove('hidden');
    }

    // Rectified Sheet Image & SVG Overlay
    const sheetImg = document.getElementById('resRectifiedImg');
    sheetImg.src = sub.image_data;
    renderSvgOverlay(rawResult, sub.code);

    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========================================================
// 4B. TẠO ẢNH PHIẾU NẮN PHẲNG & ĐÓNG DẤU ĐIỂM SỐ CHÍNH THỨC KÈM LOGO
// ========================================================
async function generateStampedGradedSheet(sub, rawResult) {
    if (!rawResult || !rawResult.rectifiedImage) return null;
    const tplKey = state.exam?.sheet_template || 'qmcv1239';
    const tpl = rawResult.template || (window.MAU && window.MAU[tplKey]) || window.MAU.qmcv1239;
    if (!tpl) return rawResult.rectifiedImage;

    // Tải ảnh phiếu đã nắn phẳng
    const rectImg = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Lỗi nạp ảnh nắn phẳng"));
        img.src = rawResult.rectifiedImage;
    });

    const sheetW = rectImg.naturalWidth || 1552;
    const sheetH = rectImg.naturalHeight || 2200;
    const headerH = 260; // Khung thông tin & con dấu trang nhã phía trên

    const canvas = document.createElement('canvas');
    canvas.width = sheetW;
    canvas.height = headerH + sheetH;
    const ctx = canvas.getContext('2d');

    // 1. NỀN HEADER SANG TRỌNG (SLATE-50)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, sheetW, headerH);

    // Viền màu xanh ngọc thương hiệu QMath LMS ở đỉnh
    const topBar = ctx.createLinearGradient(0, 0, sheetW, 0);
    topBar.addColorStop(0, '#059669');
    topBar.addColorStop(0.5, '#0d9488');
    topBar.addColorStop(1, '#059669');
    ctx.fillStyle = topBar;
    ctx.fillRect(0, 0, sheetW, 6);

    // Đường phân cách sắc nét phía dưới Header
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(sheetW, headerH);
    ctx.stroke();

    // 2. KHỐI LOGO & THƯƠNG HIỆU WEB (GÓC TRÁI: X: 35 -> 410)
    const logoX = 35, logoY = 32, logoS = 68, rad = 16;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(logoX + rad, logoY);
    ctx.arcTo(logoX + logoS, logoY, logoX + logoS, logoY + logoS, rad);
    ctx.arcTo(logoX + logoS, logoY + logoS, logoX, logoY + logoS, rad);
    ctx.arcTo(logoX, logoY + logoS, logoX, logoY, rad);
    ctx.arcTo(logoX, logoY, logoX + logoS, logoY, rad);
    ctx.closePath();
    const logoGrad = ctx.createLinearGradient(logoX, logoY, logoX + logoS, logoY + logoS);
    logoGrad.addColorStop(0, '#059669');
    logoGrad.addColorStop(1, '#047857');
    ctx.fillStyle = logoGrad;
    ctx.fill();

    // Biểu tượng chữ QM trong logo
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QM', logoX + logoS / 2, logoY + logoS / 2 + 1);
    ctx.restore();

    // Tên thương hiệu
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 23px "Segoe UI", Arial, sans-serif';
    ctx.fillText('QMATH LMS', logoX + logoS + 18, logoY + 28);

    ctx.fillStyle = '#059669';
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.fillText('HỆ THỐNG CHẤM THI OMR TỰ ĐỘNG', logoX + logoS + 18, logoY + 48);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Trung tâm Toán học & Khảo thí StarMind', logoX + logoS + 18, logoY + 66);

    // 3. KHUNG THÔNG TIN THÍ SINH & ĐỀ THI (GIỮA: X: 430 -> 1060)
    const cardX = 430, cardY = 22, cardW = 620, cardH = 216;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 14);
    else ctx.rect(cardX, cardY, cardW, cardH);
    ctx.fill();
    ctx.stroke();

    // Tên kỳ thi / bài kiểm tra
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
    const examName = (state.exam?.name || 'BÀI KIỂM TRA ĐỊNH KỲ').toUpperCase();
    ctx.fillText(examName, cardX + 20, cardY + 34);

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 20, cardY + 48);
    ctx.lineTo(cardX + cardW - 20, cardY + 48);
    ctx.stroke();

    // Chi tiết học sinh
    ctx.fillStyle = '#475569';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Họ và tên thí sinh:', cardX + 20, cardY + 78);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
    ctx.fillText(sub.student_name || 'Chưa cập nhật tên (Theo SBD)', cardX + 155, cardY + 78);

    ctx.fillStyle = '#475569';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Số báo danh (SBD):', cardX + 20, cardY + 110);
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText(sub.student_no || '---', cardX + 155, cardY + 110);

    ctx.fillStyle = '#475569';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Mã đề thi:', cardX + 340, cardY + 110);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText(sub.code || '---', cardX + 415, cardY + 110);

    ctx.fillStyle = '#475569';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Lớp:', cardX + 20, cardY + 142);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px "Segoe UI", Arial, sans-serif';
    ctx.fillText(sub.class_name || (state.exam?.classes?.[0] || '---'), cardX + 155, cardY + 142);

    ctx.fillStyle = '#475569';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Chấm lúc:', cardX + 340, cardY + 142);
    ctx.fillStyle = '#64748b';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.fillText(new Date(sub.createdAt).toLocaleString('vi-VN'), cardX + 415, cardY + 142);

    // Mẫu phiếu chuẩn
    ctx.fillStyle = '#64748b';
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Chuẩn hóa thị giác máy tính OMR · Mẫu BGD 2025 (CV 1239)', cardX + 20, cardY + 185);

    // 4. KHUNG ĐIỂM SỐ TỪNG PHẦN (BÊN PHẢI: X: 1070 -> 1285)
    const sbX = 1070, sbY = 22, sbW = 215, sbH = 216;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(sbX, sbY, sbW, sbH, 14);
    else ctx.rect(sbX, sbY, sbW, sbH);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText('ĐIỂM TỪNG PHẦN', sbX + 16, sbY + 30);

    const drawScoreLine = (label, scoreVal, yPos) => {
        ctx.fillStyle = '#334155';
        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        ctx.fillText(label, sbX + 16, yPos);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText((scoreVal ?? 0).toFixed(2) + ' đ', sbX + sbW - 16, yPos);
        ctx.textAlign = 'left';
    };

    drawScoreLine('Phần I (TN 4 lựa chọn):', sub.part1_score, sbY + 66);
    drawScoreLine('Phần II (Đúng / Sai):', sub.part2_score, sbY + 108);
    drawScoreLine('Phần III (Trả lời ngắn):', sub.part3_score, sbY + 150);

    ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(sbX + 14, sbY + 172);
    ctx.lineTo(sbX + sbW - 14, sbY + 172);
    ctx.stroke();

    ctx.fillStyle = '#059669';
    ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Tổng điểm:', sbX + 16, sbY + 196);
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText((sub.score ?? 0).toFixed(2) + ' đ', sbX + sbW - 16, sbY + 196);
    ctx.textAlign = 'left';

    // 5. CON DẤU XÁC NHẬN CHÍNH THỨC (SEAL: X: 1305 -> 1525, TÂM: 1415, Y: 130)
    ctx.save();
    const sealX = 1415, sealY = 130;
    ctx.translate(sealX, sealY);
    ctx.rotate(-0.08); // Nghiêng nhẹ -4.6 độ cho cảm giác mộc dấu thật

    // Vòng tròn ngoài
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, 75, 0, Math.PI * 2);
    ctx.stroke();

    // Vòng tròn nét đứt thứ 2
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, 68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vòng tròn trong
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.stroke();

    // Chữ trong mộc dấu
    ctx.fillStyle = '#059669';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText('QMATH LMS', 0, -56);

    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.fillText((sub.score ?? 0).toFixed(2), 0, 0);

    ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
    ctx.fillText('ĐIỂM CHÍNH THỨC', 0, 24);

    ctx.font = '9px "Segoe UI", Arial, sans-serif';
    ctx.fillText('★ ĐÃ CHẤM TỰ ĐỘNG ★', 0, 56);
    ctx.restore();

    // 6. VẼ PHIẾU NẮN PHẲNG BÊN DƯỚI HEADER (Y: headerH)
    ctx.drawImage(rectImg, 0, headerH, sheetW, sheetH);

    // 7. VẼ ĐÁNH DẤU CHI TIẾT TRỰC TIẾP CẢ 3 PHẦN LÊN ẢNH
    const key = state.keys[sub.code] || state.keys[Object.keys(state.keys)[0]] || { answers: '', part2: [], part3: [] };
    const kFrame = tpl.khung || [0, 0, 16.53, 23.39];
    const scaleX = sheetW / kFrame[2];
    const scaleY = sheetH / kFrame[3];

    const drawRingOnCanvas = (pt, color, lineW = 3.5, r = 14, dashed = false) => {
        if (!pt) return;
        const cx = pt[0] * scaleX;
        const cy = pt[1] * scaleY + headerH;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        if (dashed) ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    };

    // Đánh dấu Phần I (Trắc nghiệm 4 lựa chọn)
    if (tpl.p1) {
        const qCount1 = Math.min(tpl.p1.length, state.exam?.question_count || 12);
        for (let q = 0; q < qCount1; q++) {
            const studentAns = (sub.answers || '')[q];
            const keyAns = (key.answers || '')[q];
            ['A', 'B', 'C', 'D'].forEach((char, optIdx) => {
                const pt = tpl.p1[q][optIdx];
                if (!pt) return;
                const isStudentMark = studentAns === char;
                const isKeyMark = keyAns === char;

                if (isStudentMark && isKeyMark) {
                    drawRingOnCanvas(pt, '#10b981', 3.5, 14); // Xanh lá: Đúng
                } else if (isStudentMark && !isKeyMark) {
                    drawRingOnCanvas(pt, '#ef4444', 3.5, 14); // Đỏ: Tô sai
                } else if (!isStudentMark && isKeyMark && studentAns && studentAns !== '-') {
                    drawRingOnCanvas(pt, '#f59e0b', 2.5, 13, true); // Vàng nét đứt: Vị trí đáp án đúng
                }
            });
        }
    }

    // Đánh dấu Phần II (Đúng / Sai)
    if (tpl.p2 && tpl.p2.length >= 4) {
        const qCount2 = state.exam?.part2_count || 4;
        for (let q = 0; q < qCount2; q++) {
            const sChunk = (sub.part2 && sub.part2[q]) ? sub.part2[q] : '----';
            const kChunk = (key.part2 && key.part2[q]) ? key.part2[q] : '----';
            for (let r = 0; r < 4; r++) {
                const idx = q * 4 + r;
                if (idx >= tpl.p2.length) continue;
                const ptD = tpl.p2[idx][0];
                const ptS = tpl.p2[idx][1];
                if (!ptD || !ptS) continue;

                const sChar = (sChunk[r] || '-').toUpperCase().replace('D', 'Đ');
                const kChar = (kChunk[r] || '-').toUpperCase().replace('D', 'Đ');

                if (sChar === 'Đ') {
                    if (kChar === 'Đ') {
                        drawRingOnCanvas(ptD, '#10b981', 3.5, 14);
                    } else {
                        drawRingOnCanvas(ptD, '#ef4444', 3.5, 14);
                        if (kChar === 'S') drawRingOnCanvas(ptS, '#f59e0b', 2.5, 13, true);
                    }
                } else if (sChar === 'S') {
                    if (kChar === 'S') {
                        drawRingOnCanvas(ptS, '#10b981', 3.5, 14);
                    } else {
                        drawRingOnCanvas(ptS, '#ef4444', 3.5, 14);
                        if (kChar === 'Đ') drawRingOnCanvas(ptD, '#f59e0b', 2.5, 13, true);
                    }
                } else {
                    if (kChar === 'Đ') drawRingOnCanvas(ptD, '#f59e0b', 2.5, 13, true);
                    else if (kChar === 'S') drawRingOnCanvas(ptS, '#f59e0b', 2.5, 13, true);
                }
            }
        }
    }

    // Đánh dấu Phần III (Trả lời ngắn - Điền số)
    if (tpl.p3 && tpl.p3.length) {
        const qCount3 = state.exam?.part3_count || 6;
        for (let q = 0; q < qCount3; q++) {
            if (q >= tpl.p3.length) continue;
            let sAns = '';
            if (Array.isArray(sub.part3)) {
                sAns = String(sub.part3[q] || '').trim();
            } else if (rawResult.part3Text) {
                sAns = String(rawResult.part3Text[q] || '').trim();
            }
            const kAns = String((key.part3 && key.part3[q]) || '').trim();
            const isMatch = Boolean(sAns && kAns && sAns.replace(/\s+/g, '') === kAns.replace(/\s+/g, ''));

            // Khoanh tròn các ô số học sinh đã tô ở 4 cột
            if (rawResult.p3m && rawResult.p3m[q]) {
                for (let col = 0; col < 4; col++) {
                    const v = rawResult.p3m[q][col];
                    if (v >= 0 && tpl.p3[q][col] && tpl.p3[q][col][v]) {
                        const pt = tpl.p3[q][col][v];
                        drawRingOnCanvas(pt, isMatch ? '#10b981' : '#ef4444', 3.5, 13);
                    }
                }
            }

            // Vẽ bảng điểm / nhãn kết quả câu trả lời ngắn ngay trên đầu mỗi câu
            if (tpl.p3[q][0] && tpl.p3[q][0][0]) {
                const pt0 = tpl.p3[q][0][0];
                const bx = pt0[0] * scaleX - 10;
                const by = pt0[1] * scaleY + headerH - 44;
                const bw = 150, bh = 34;

                ctx.save();
                ctx.fillStyle = isMatch ? '#ecfdf5' : '#fef2f2';
                ctx.strokeStyle = isMatch ? '#10b981' : '#ef4444';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 8);
                else ctx.rect(bx, by, bw, bh);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = isMatch ? '#065f46' : '#991b1b';
                ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (isMatch) {
                    ctx.fillText(`✓ ${sAns || '---'} (+${state.exam?.part3_point ?? 0.5}đ)`, bx + bw / 2, by + bh / 2);
                } else {
                    ctx.fillText(`✗ ${sAns || 'Trống'} (Đ/A: ${kAns || '---'})`, bx + bw / 2, by + bh / 2);
                }
                ctx.restore();
            }
        }
    }

    return canvas.toDataURL('image/jpeg', 0.92);
}

function renderSvgOverlay(rawResult, code) {
    const svg = document.getElementById('resSvgOverlay');
    if (!svg || !rawResult || !rawResult.template) return;
    
    // Nếu phiếu đã được đóng dấu trực tiếp lên Canvas thì không chồng thêm SVG để chống lệch toạ độ
    if (state.lastSubmission?.stamped_image) {
        svg.innerHTML = '';
        return;
    }

    const tpl = rawResult.template;
    const key = state.keys[code] || state.keys[Object.keys(state.keys)[0]] || { answers: '', part2: [], part3: [] };

    let marks = '';
    const ring = (pt, color, stroke = 2.5, r = 14, dashed = false) => {
        const x = pt[0] * 100;
        const y = pt[1] * 100;
        const dashAttr = dashed ? 'stroke-dasharray="4 3"' : '';
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" ${dashAttr} />`;
    };

    // Draw Part 1 circles
    if (tpl.p1) {
        const qCount = Math.min(tpl.p1.length, state.exam?.question_count || 12);
        for (let q = 0; q < qCount; q++) {
            const studentAns = (rawResult.part1 || '')[q];
            const keyAns = (key.answers || '')[q];
            ['A', 'B', 'C', 'D'].forEach((char, optIdx) => {
                const pt = tpl.p1[q][optIdx];
                if (!pt) return;
                const isStudentMark = studentAns === char;
                const isKeyMark = keyAns === char;

                if (isStudentMark && isKeyMark) {
                    marks += ring(pt, '#10b981', 3.5, 14); // Green (Correct)
                } else if (isStudentMark && !isKeyMark) {
                    marks += ring(pt, '#ef4444', 3.5, 14); // Red (Wrong)
                } else if (!isStudentMark && isKeyMark && studentAns && studentAns !== '-') {
                    marks += ring(pt, '#f59e0b', 2.5, 13, true); // Yellow (Key position)
                }
            });
        }
    }

    // Draw Part 2 circles (Đúng / Sai)
    if (tpl.p2 && tpl.p2.length >= 4) {
        const qCount2 = state.exam?.part2_count || 4;
        for (let q = 0; q < qCount2; q++) {
            const sChunk = (rawResult.part2 && rawResult.part2[q]) ? rawResult.part2[q] : '----';
            const kChunk = (key.part2 && key.part2[q]) ? key.part2[q] : '----';
            for (let r = 0; r < 4; r++) {
                const idx = q * 4 + r;
                if (idx >= tpl.p2.length) continue;
                const ptD = tpl.p2[idx][0];
                const ptS = tpl.p2[idx][1];
                if (!ptD || !ptS) continue;

                const sChar = (sChunk[r] || '-').toUpperCase().replace('D', 'Đ');
                const kChar = (kChunk[r] || '-').toUpperCase().replace('D', 'Đ');

                if (sChar === 'Đ') {
                    if (kChar === 'Đ') {
                        marks += ring(ptD, '#10b981', 3.5, 14);
                    } else {
                        marks += ring(ptD, '#ef4444', 3.5, 14);
                        if (kChar === 'S') marks += ring(ptS, '#f59e0b', 2.5, 13, true);
                    }
                } else if (sChar === 'S') {
                    if (kChar === 'S') {
                        marks += ring(ptS, '#10b981', 3.5, 14);
                    } else {
                        marks += ring(ptS, '#ef4444', 3.5, 14);
                        if (kChar === 'Đ') marks += ring(ptD, '#f59e0b', 2.5, 13, true);
                    }
                } else {
                    if (kChar === 'Đ') marks += ring(ptD, '#f59e0b', 2.5, 13, true);
                    else if (kChar === 'S') marks += ring(ptS, '#f59e0b', 2.5, 13, true);
                }
            }
        }
    }

    // Draw Part 3 circles (Trả lời ngắn)
    if (tpl.p3 && tpl.p3.length) {
        const qCount3 = state.exam?.part3_count || 6;
        for (let q = 0; q < qCount3; q++) {
            if (q >= tpl.p3.length) continue;
            const sAns = String((rawResult.part3Text && rawResult.part3Text[q]) || '').trim();
            const kAns = String((key.part3 && key.part3[q]) || '').trim();
            const isMatch = Boolean(sAns && kAns && sAns.replace(/\s+/g, '') === kAns.replace(/\s+/g, ''));

            if (rawResult.p3m && rawResult.p3m[q]) {
                for (let col = 0; col < 4; col++) {
                    const v = rawResult.p3m[q][col];
                    if (v >= 0 && tpl.p3[q][col] && tpl.p3[q][col][v]) {
                        const pt = tpl.p3[q][col][v];
                        marks += ring(pt, isMatch ? '#10b981' : '#ef4444', 3.5, 13);
                    }
                }
            }

            if (tpl.p3[q][0] && tpl.p3[q][0][0]) {
                const pt0 = tpl.p3[q][0][0];
                const bx = pt0[0] * 100 - 10;
                const by = pt0[1] * 100 - 45;
                const bg = isMatch ? '#ecfdf5' : '#fef2f2';
                const stroke = isMatch ? '#10b981' : '#ef4444';
                const textCol = isMatch ? '#065f46' : '#991b1b';
                const label = isMatch ? `✓ ${sAns || '---'} (+${state.exam?.part3_point ?? 0.5}đ)` : `✗ ${sAns || 'Trống'} (Đ/A: ${kAns || '---'})`;
                marks += `
                    <g>
                        <rect x="${bx}" y="${by}" width="150" height="34" rx="8" fill="${bg}" stroke="${stroke}" stroke-width="1.5" />
                        <text x="${bx + 75}" y="${by + 22}" text-anchor="middle" font-size="12" font-weight="bold" fill="${textCol}" font-family="system-ui, sans-serif">${label}</text>
                    </g>
                `;
            }
        }
    }

    // Set SVG viewBox to match template dimensions in cm * 100
    const w = (tpl.khung ? tpl.khung[2] : 16.53) * 100;
    const h = (tpl.khung ? tpl.khung[3] : 23.39) * 100;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = marks;
}

window.downloadGradedSheet = () => {
    if (!state.lastSubmission?.image_data) {
        Swal.fire('Thông báo', 'Chưa có ảnh bài thi để tải về.', 'info');
        return;
    }
    const a = document.createElement('a');
    a.href = state.lastSubmission.image_data;
    const sbd = state.lastSubmission.student_no || 'khong_sbd';
    const name = (state.lastSubmission.student_name || 'thi_sinh').replace(/\s+/g, '_');
    const score = (typeof state.lastSubmission.score === 'number' ? state.lastSubmission.score.toFixed(2) : state.lastSubmission.score);
    a.download = `PhieuCham_${sbd}_${name}_${score}d.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

window.recalcAndSaveEdit = async () => {
    if (!state.lastSubmission) return;
    const newSbd = document.getElementById('editSbdInput').value.trim();
    const newCode = document.getElementById('editCodeInput').value.trim();
    const newName = document.getElementById('editStudentNameInput').value.trim();

    state.lastSubmission.student_no = newSbd;
    state.lastSubmission.code = newCode;
    state.lastSubmission.student_name = newName;

    const scoreData = calculateExamScore(newCode, state.lastSubmission.answers, state.lastSubmission.part2, state.lastSubmission.part3);
    state.lastSubmission.score = scoreData.totalScore;
    state.lastSubmission.part1_score = scoreData.part1Score;
    state.lastSubmission.part2_score = scoreData.part2Score;
    state.lastSubmission.part3_score = scoreData.part3Score;

    // Tự động vẽ lại ảnh đóng dấu với thông tin SBD, Mã đề, Tên mới
    if (state.lastRawResult) {
        try {
            const stampedImg = await generateStampedGradedSheet(state.lastSubmission, state.lastRawResult);
            if (stampedImg) {
                state.lastSubmission.image_data = stampedImg;
                state.lastSubmission.stamped_image = stampedImg;
            }
        } catch(e) {
            console.warn("Lỗi cập nhật ảnh đóng dấu:", e);
        }
    }

    displayLastResultInspector(state.lastSubmission, state.lastRawResult);
    await saveSubmissionToStore(state.lastSubmission);
    Swal.fire('Thành công', 'Đã cập nhật lại kết quả bài thi!', 'success');
};

window.saveCurrentSubmissionManually = async () => {
    if (!state.lastSubmission) return;
    await saveSubmissionToStore(state.lastSubmission);
    Swal.fire('Đã lưu', 'Bài chấm đã được lưu thành công vào cơ sở dữ liệu!', 'success');
};

async function saveSubmissionToStore(sub) {
    // Check if duplicate SBD exists for this exam, replace it
    const existingIdx = state.submissions.findIndex(s => s.student_no === sub.student_no && s.student_no !== '');
    if (existingIdx !== -1) {
        state.submissions[existingIdx] = sub;
    } else {
        state.submissions.push(sub);
    }

    // Save to Firestore
    if (state.teacherUid) {
        try {
            await setDoc(doc(db, "omr_submissions", sub.id), sub);
        } catch(e) {
            console.warn("Lưu Firestore thất bại, lưu localStorage:", e);
        }
    }
    // Save to localStorage
    localStorage.setItem(`omr_submissions_${sub.examId}`, JSON.stringify(state.submissions));
    updateOverviewStats();
}

function playBeepSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // 880Hz pleasant ping
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
    } catch(e) {}
}

// ========================================================
// 5. LIVE FULLSCREEN CAMERA STREAM CONTROLLER & CONTINUOUS AUTO-SCANNER
// ========================================================
state.cameraZoom = 1.0;
state.isTorchOn = false;
state.backCameras = [];
state.activeCameraIndex = 0;
state.currentCameraDeviceId = null;
state.ultraWideCamera = null;
state.mainCamera = null;
state.guideOrientation = 'portrait';
state.autoScanEnabled = true;
state.isAutoScanning = false;
state.autoScanSpeed = localStorage.getItem('omr_scan_speed') || 'normal'; // 'slow', 'normal', 'fast'
state.autoScanCooldown = parseInt(localStorage.getItem('omr_scan_cooldown') || '3500');
state.strictFiducials = localStorage.getItem('omr_strict_fiducials') !== 'false';
state.consecutiveCornerDetections = 0;
let autoScanInterval = null;
let lastAutoScanTime = 0;

function showCameraHUDMessage(htmlMsg, durationMs = 2200) {
    const badge = document.getElementById('cameraScanStatus');
    const textEl = document.getElementById('cameraScanStatusText');
    if (!badge) return;
    if (textEl) textEl.innerHTML = htmlMsg;
    else badge.innerHTML = htmlMsg;
    badge.classList.remove('hidden', 'opacity-0');
    badge.classList.add('opacity-100');
    clearTimeout(badge._hideTimer);
    badge._hideTimer = setTimeout(() => {
        badge.classList.add('opacity-0');
        setTimeout(() => badge.classList.add('hidden'), 200);
    }, durationMs);
}

window.toggleGuideOrientation = () => {
    const guide = document.getElementById('cameraA4Guide');
    const lbl = document.getElementById('guideOrientationLabel');
    if (!guide) return;
    state.guideOrientation = state.guideOrientation === 'portrait' ? 'landscape' : 'portrait';
    if (state.guideOrientation === 'landscape') {
        guide.classList.remove('aspect-[1552/2254]', 'landscape:aspect-[1552/2254]');
        guide.classList.add('aspect-[2254/1552]');
        if (lbl) lbl.textContent = 'Khung ngang';
        showCameraHUDMessage('📐 Khung ngang (Phiếu 40 câu / Quét ngang)');
    } else {
        guide.classList.remove('aspect-[2254/1552]');
        guide.classList.add('aspect-[1552/2254]');
        if (lbl) lbl.textContent = 'Khung dọc';
        showCameraHUDMessage('📐 Khung dọc (Chuẩn A4 BGD)');
    }
};

window.toggleAutoScan = () => {
    state.autoScanEnabled = !state.autoScanEnabled;
    const btn = document.getElementById('btnToggleAutoScan');
    const label = document.getElementById('autoScanLabel');
    if (label) {
        label.textContent = state.autoScanEnabled ? 'Tự quét: BẬT' : 'Tự quét: TẮT';
    }
    if (btn) {
        btn.className = state.autoScanEnabled 
            ? 'px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm cursor-pointer'
            : 'px-2.5 py-1 rounded-xl bg-slate-800 text-slate-400 border border-slate-700 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer';
    }
    if (state.autoScanEnabled) {
        startAutoScanLoop();
    } else {
        stopAutoScanLoop();
    }
};

// Cài đặt Tự động quét (Auto-Scan Modal Controls)
window.openAutoScanSettings = () => {
    const modal = document.getElementById('autoScanSettingsModal');
    if (!modal) return;
    document.querySelectorAll('.speed-opt-btn').forEach(b => {
        b.className = 'speed-opt-btn py-2 px-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center font-bold text-slate-600 dark:text-slate-300 cursor-pointer';
    });
    const activeBtn = document.getElementById(`speedBtn_${state.autoScanSpeed}`);
    if (activeBtn) {
        activeBtn.className = 'speed-opt-btn py-2 px-1 rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 font-bold text-center cursor-pointer';
    }
    const cdSelect = document.getElementById('autoScanCooldownSelect');
    if (cdSelect) cdSelect.value = String(state.autoScanCooldown);
    const strictCheck = document.getElementById('strictFiducialsCheck');
    if (strictCheck) strictCheck.checked = state.strictFiducials;

    modal.classList.remove('hidden');
};

window.closeAutoScanSettings = () => {
    const modal = document.getElementById('autoScanSettingsModal');
    if (modal) modal.classList.add('hidden');
    if (state.autoScanEnabled) {
        startAutoScanLoop();
    }
};

window.setAutoScanSpeed = (speed) => {
    state.autoScanSpeed = speed;
    localStorage.setItem('omr_scan_speed', speed);
    document.querySelectorAll('.speed-opt-btn').forEach(b => {
        b.className = 'speed-opt-btn py-2 px-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center font-bold text-slate-600 dark:text-slate-300 cursor-pointer';
    });
    const activeBtn = document.getElementById(`speedBtn_${speed}`);
    if (activeBtn) {
        activeBtn.className = 'speed-opt-btn py-2 px-1 rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 font-bold text-center cursor-pointer';
    }
    if (state.autoScanEnabled) startAutoScanLoop();
};

window.setAutoScanCooldown = (val) => {
    state.autoScanCooldown = parseInt(val) || 3500;
    localStorage.setItem('omr_scan_cooldown', String(state.autoScanCooldown));
};

window.setStrictFiducials = (val) => {
    state.strictFiducials = Boolean(val);
    localStorage.setItem('omr_strict_fiducials', String(state.strictFiducials));
};

function startAutoScanLoop() {
    stopAutoScanLoop();
    if (!state.autoScanEnabled) return;

    const intervalMs = state.autoScanSpeed === 'fast' ? 500 : (state.autoScanSpeed === 'slow' ? 1200 : 800);

    autoScanInterval = setInterval(async () => {
        const video = document.getElementById('cameraVideo');
        const guide = document.getElementById('cameraA4Guide');
        const sheetArea = document.getElementById('scanCameraArea');
        const resSheet = document.getElementById('cameraResultSheet');

        // Only scan if camera is open and video is actively streaming
        if (!video || !state.currentCameraStream || sheetArea?.classList.contains('hidden')) return;
        if (state.isAutoScanning || video.readyState < 2) return;

        // Nghỉ giữa các lần quét khi kết quả đang hiển thị
        if (resSheet && !resSheet.classList.contains('hidden') && Date.now() - lastAutoScanTime < state.autoScanCooldown) {
            return;
        }

        try {
            state.isAutoScanning = true;
            const vr = video.getBoundingClientRect();
            const gr = guide ? guide.getBoundingClientRect() : null;
            if (!gr || vr.width <= 0 || vr.height <= 0 || video.videoWidth <= 0 || video.videoHeight <= 0) {
                state.isAutoScanning = false;
                return;
            }

            const objFit = window.getComputedStyle(video).objectFit || 'cover';
            const scale = objFit === 'cover'
                ? Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight)
                : Math.min(vr.width / video.videoWidth, vr.height / video.videoHeight);

            const drawW = video.videoWidth * scale;
            const drawH = video.videoHeight * scale;
            const offsetX = (vr.width - drawW) / 2;
            const offsetY = (vr.height - drawH) / 2;

            let computedSx = (gr.left - vr.left - offsetX) / scale;
            let computedSy = (gr.top - vr.top - offsetY) / scale;
            let computedSw = gr.width / scale;
            let computedSh = gr.height / scale;

            // 18% margin for detection
            const padX = computedSw * 0.18;
            const padY = computedSh * 0.18;
            computedSx = Math.max(0, computedSx - padX);
            computedSy = Math.max(0, computedSy - padY);
            computedSw = Math.min(video.videoWidth - computedSx, computedSw + padX * 2);
            computedSh = Math.min(video.videoHeight - computedSy, computedSh + padY * 2);

            if (computedSw < 200 || computedSh < 200) {
                state.isAutoScanning = false;
                return;
            }

            // Fast lightweight test canvas
            const testCanvas = document.createElement('canvas');
            const targetW = 600;
            const targetH = Math.round(targetW * (computedSh / computedSw));
            testCanvas.width = targetW;
            testCanvas.height = targetH;
            const tCtx = testCanvas.getContext('2d', { willReadFrequently: true });
            tCtx.drawImage(video, computedSx, computedSy, computedSw, computedSh, 0, 0, targetW, targetH);

            const gray = window.OMR.xam(tCtx.getImageData(0, 0, targetW, targetH));
            const small = window.OMR.thuNho(gray, 500);
            const blocks = window.OMR.timKhoi(small.g).filter(b => b.c > small.g.w * 0.012 && b.c < small.g.w * 0.05);

            if (blocks.length >= 4) {
                const corners = [[0, 0], [small.g.w, 0], [small.g.w, small.g.h], [0, small.g.h]].map(([x, y]) => 
                    blocks.reduce((best, b) => !best || Math.hypot(b.x - x, b.y - y) < Math.hypot(best.x - x, best.y - y) ? b : best, null)
                );
                const uniqueCorners = new Set(corners);
                if (uniqueCorners.size === 4) {
                    const [c0, c1, c2, c3] = corners;
                    let isValidQuad = true;

                    if (state.strictFiducials) {
                        // 1. Kiểm tra hình dạng vuông của từng mốc đen góc (chống nhận nhầm phím/vết bẩn)
                        const isSquareish = b => b && b.w && b.h && Math.abs(b.w / b.h - 1) < 0.45;
                        if (!isSquareish(c0) || !isSquareish(c1) || !isSquareish(c2) || !isSquareish(c3)) {
                            isValidQuad = false;
                        }

                        // 2. Kích thước cạnh tứ giác
                        const wTop = Math.hypot(c1.x - c0.x, c1.y - c0.y);
                        const wBot = Math.hypot(c2.x - c3.x, c2.y - c3.y);
                        const hLeft = Math.hypot(c3.x - c0.x, c3.y - c0.y);
                        const hRight = Math.hypot(c2.x - c1.x, c2.y - c1.y);

                        // Chiếm tỷ lệ đủ lớn trong khung (> 30%)
                        if (wTop < small.g.w * 0.30 || hLeft < small.g.h * 0.30) {
                            isValidQuad = false;
                        }

                        // Tương quan cạnh đối
                        if (Math.abs(wTop - wBot) / Math.max(wTop, wBot) > 0.40 || Math.abs(hLeft - hRight) / Math.max(hLeft, hRight) > 0.40) {
                            isValidQuad = false;
                        }

                        // Tỷ lệ khổ giấy A4
                        const avgW = (wTop + wBot) / 2;
                        const avgH = (hLeft + hRight) / 2;
                        const ratio = avgH / avgW;
                        const isPortraitA4 = (ratio >= 1.15 && ratio <= 1.75);
                        const isLandscapeA4 = (ratio >= 0.55 && ratio <= 0.90);
                        if (!isPortraitA4 && !isLandscapeA4) {
                            isValidQuad = false;
                        }
                    }

                    if (isValidQuad) {
                        state.consecutiveCornerDetections = (state.consecutiveCornerDetections || 0) + 1;
                        
                        // Làm sáng góc khung căn màu xanh ngọc – dùng CSS class để không bị purge
                        document.querySelectorAll('.camera-corner-bracket').forEach(b => {
                            b.classList.add('detected');
                        });

                        const reqFrames = state.autoScanSpeed === 'fast' ? 1 : 2;
                        if (state.consecutiveCornerDetections >= reqFrames) {
                            state.consecutiveCornerDetections = 0;
                            lastAutoScanTime = Date.now();
                            await window.captureCameraFrame();
                        }
                    } else {
                        state.consecutiveCornerDetections = 0;
                        document.querySelectorAll('.camera-corner-bracket').forEach(b => {
                            b.classList.remove('detected');
                        });
                    }
                } else {
                    state.consecutiveCornerDetections = 0;
                }
            } else {
                state.consecutiveCornerDetections = 0;
            }
        } catch(e) {
            // Ignore frame detection error in periodic loop
        } finally {
            state.isAutoScanning = false;
        }
    }, intervalMs);
}

function stopAutoScanLoop() {
    if (autoScanInterval) {
        clearInterval(autoScanInterval);
        autoScanInterval = null;
    }
    state.isAutoScanning = false;
}

async function getAvailableCameras() {
    try {
        if (!navigator.mediaDevices?.enumerateDevices) return [];
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        
        console.log("Danh sách toàn bộ camera:", videoInputs);

        // Filter rear cameras (exclude front / selfie / user)
        const rear = videoInputs.filter(d => {
            const lbl = (d.label || '').toLowerCase();
            if (lbl.includes('front') || lbl.includes('trước') || lbl.includes('user') || lbl.includes('selfie') || /camera\s*2?\s*1\b/.test(lbl)) {
                return false;
            }
            return true;
        });

        state.backCameras = rear.length > 0 ? rear : videoInputs;

        // Classify Ultra-wide (0.5x) and Main (1x)
        // 1. Explicit keyword match
        let ultraWide = state.backCameras.find(d => {
            const lbl = (d.label || '').toLowerCase();
            return lbl.includes('ultra') || lbl.includes('0.5') || lbl.includes('0.6') || lbl.includes('super') || lbl.includes('wide-angle') || lbl.includes('góc rộng');
        });

        // 2. Android Camera2 ID 2 (typical auxiliary Ultra-Wide sensor on Xiaomi, Samsung, Oppo!)
        if (!ultraWide) {
            ultraWide = state.backCameras.find(d => /camera\s*2?\s*2\b/i.test(d.label) || /\b2,\s*facing\s*back/i.test(d.label));
        }

        // 3. Positional fallback: if 2+ rear cameras exist, 2nd is almost universally Ultra-Wide
        if (!ultraWide && state.backCameras.length > 1) {
            ultraWide = state.backCameras[1];
        }

        state.ultraWideCamera = ultraWide || null;

        // Main camera (1x): camera2 0 or 1st rear camera
        let main = state.backCameras.find(d => {
            const lbl = (d.label || '').toLowerCase();
            return lbl.includes('camera2 0') || lbl.includes('0, facing back') || lbl.includes('main') || lbl.includes('primary');
        });
        state.mainCamera = main || state.backCameras[0] || null;

        console.log("Camera chính (1x):", state.mainCamera?.label);
        console.log("Camera góc rộng (0.5x):", state.ultraWideCamera?.label);

        return state.backCameras;
    } catch(e) {
        console.warn("Không liệt kê được danh sách camera:", e);
        return [];
    }
}

function updateZoomUI(zoomVal, caps) {
    const badge = document.getElementById('cameraZoomBadge');
    if (badge) {
        badge.textContent = (typeof zoomVal === 'number' ? zoomVal.toFixed(1) : zoomVal) + 'x';
    }
    const btn05 = document.getElementById('btnZoom05');
    const btn10 = document.getElementById('btnZoom10');
    const btn20 = document.getElementById('btnZoom20');

    const is05 = Math.abs(zoomVal - 0.5) < 0.25;
    const is10 = Math.abs(zoomVal - 1.0) < 0.25;
    const is20 = Math.abs(zoomVal - 2.0) < 0.25;

    const activeClass = 'zoom-btn px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold border border-emerald-400 transition-all active:scale-90 shadow-md';
    const inactiveClass = 'zoom-btn px-2.5 py-1 rounded-lg bg-black/70 hover:bg-black/90 text-white text-xs font-bold border border-white/20 transition-all active:scale-90 shadow-sm';

    if (btn05) btn05.className = is05 ? activeClass : inactiveClass;
    if (btn10) btn10.className = is10 ? activeClass : inactiveClass;
    if (btn20) btn20.className = is20 ? activeClass : inactiveClass;
}

window.startCameraStream = async () => {
    const video = document.getElementById('cameraVideo');
    if (!video) return;

    window.stopCameraStream();

    try {
        // FULL-SENSOR 4:3 constraints (like the native Photo app).
        // Requesting 16:9 makes the browser crop the top/bottom of the 4:3 sensor => narrower FOV ("zoomed in").
        const base = state.currentCameraDeviceId
            ? { deviceId: { exact: state.currentCameraDeviceId } }
            : { facingMode: { ideal: 'environment' } };
        const attempts = [
            { ...base, width: { ideal: 4032 }, height: { ideal: 3024 }, aspectRatio: { exact: 4/3 }, resizeMode: { ideal: 'none' } },
            { ...base, width: { ideal: 2560 }, height: { ideal: 1920 }, aspectRatio: { ideal: 4/3 }, resizeMode: { ideal: 'none' } },
            { ...base, width: { ideal: 1920 }, height: { ideal: 1440 }, aspectRatio: { ideal: 4/3 } },
            { ...base }
        ];

        let stream = null, lastErr = null;
        for (const c of attempts) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: c, audio: false });
                break;
            } catch (e) { lastErr = e; }
        }
        if (!stream) throw lastErr || new Error('No camera');

        state.currentCameraStream = stream;
        video.srcObject = stream;
        await video.play();

        // Enumerate devices once permission is granted
        await getAvailableCameras();

        const [track] = stream.getVideoTracks();
        if (track) {
            const settings = track.getSettings ? track.getSettings() : {};
            if (settings.deviceId) {
                state.currentCameraDeviceId = settings.deviceId;
                const idx = state.backCameras.findIndex(c => c.deviceId === settings.deviceId);
                if (idx !== -1) state.activeCameraIndex = idx;
            }

            if (track.getCapabilities) {
                const caps = track.getCapabilities();
                state.cameraCapabilities = caps;

                // Zoom control setup
                const zoomControls = document.getElementById('cameraZoomControls');
                if (caps.zoom && typeof caps.zoom.min === 'number') {
                    // Always reset to the widest zoom the lens allows (never digitally zoomed in)
                    try {
                        await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
                        state.cameraZoom = caps.zoom.min;
                    } catch(e) {}
                }
                if (zoomControls) zoomControls.classList.remove('hidden');

                // Torch control setup
                const torchBtn = document.getElementById('btnCameraTorch');
                if (torchBtn) {
                    torchBtn.classList.toggle('hidden', !caps.torch);
                }
            }

            // Show actual stream info so we can verify no sensor crop (4:3 = full sensor)
            setTimeout(() => {
                const w = video.videoWidth, h = video.videoHeight;
                if (!w || !h) return;
                const r = Math.max(w, h) / Math.min(w, h);
                const ratioTxt = Math.abs(r - 4/3) < 0.05 ? '4:3 toàn cảm biến' : (Math.abs(r - 16/9) < 0.05 ? '16:9 (bị cắt)' : r.toFixed(2));
                const z = track.getSettings ? track.getSettings().zoom : undefined;
                showCameraHUDMessage(`📷 ${w}×${h} · ${ratioTxt}${z ? ' · zoom ' + Number(z).toFixed(2) + 'x' : ''}`, 3500);
            }, 600);
        }

        // Determine active zoom UI based on active lens
        const isUltraWideActive = state.ultraWideCamera && state.currentCameraDeviceId === state.ultraWideCamera.deviceId;
        updateZoomUI(isUltraWideActive ? 0.5 : 1.0, state.cameraCapabilities || {});

        // Start Continuous Auto-Scan loop
        if (state.autoScanEnabled) {
            startAutoScanLoop();
        }
    } catch(err) {
        console.error("Không mở được camera:", err);
        Swal.fire('Lỗi Camera', 'Không thể truy cập camera. Vui lòng cấp quyền camera trong cài đặt trình duyệt hoặc chuyển sang chế độ tải ảnh phiếu!', 'error');
        window.closeCameraScanner();
    }
};

window.stopCameraStream = () => {
    stopAutoScanLoop();
    if (state.currentCameraStream) {
        state.currentCameraStream.getTracks().forEach(t => t.stop());
        state.currentCameraStream = null;
    }
    const video = document.getElementById('cameraVideo');
    if (video) video.srcObject = null;
    state.isTorchOn = false;
};

window.closeCameraScanner = () => {
    window.stopCameraStream();
    window.dismissCameraResultSheet();
    const cameraArea = document.getElementById('scanCameraArea');
    if (cameraArea) cameraArea.classList.add('hidden');
    document.body.style.overflow = '';
    
    // Update scan mode buttons
    const btnUpload = document.getElementById('btnModeUpload');
    const btnCamera = document.getElementById('btnModeCamera');
    if (btnUpload) btnUpload.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-800 text-emerald-600 shadow-xs";
    if (btnCamera) btnCamera.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-500 hover:text-slate-800 dark:text-slate-400";
    
    const uploadArea = document.getElementById('scanUploadArea');
    if (uploadArea) uploadArea.classList.remove('hidden');
};

window.cycleBackCamera = async () => {
    if (state.backCameras.length > 1) {
        state.activeCameraIndex = (state.activeCameraIndex + 1) % state.backCameras.length;
        const target = state.backCameras[state.activeCameraIndex];
        state.currentCameraDeviceId = target.deviceId;
        
        const isUltraWide = target === state.ultraWideCamera || /ultra|wide|0\.5|camera\s*2?\s*2/i.test(target.label);
        const labelText = isUltraWide ? 'Camera 0.5x (Góc siêu rộng)' : (target.label ? target.label.slice(0, 20) : ('Ống kính ' + (state.activeCameraIndex + 1)));
        showCameraHUDMessage(`<i class="fa-solid fa-camera-rotate text-emerald-400"></i> ${labelText}`);
        
        await window.startCameraStream();
        if (isUltraWide) {
            updateZoomUI(0.5, {});
        } else {
            updateZoomUI(1.0, {});
        }
    } else {
        // Fallback toggle environment / user
        state.currentFacingMode = state.currentFacingMode === 'environment' ? 'user' : 'environment';
        state.currentCameraDeviceId = null;
        showCameraHUDMessage(`<i class="fa-solid fa-camera-rotate text-emerald-400"></i> Đổi camera trước/sau`);
        await window.startCameraStream();
    }
};

window.switchCameraLens = window.cycleBackCamera;

window.setCameraZoom = async (val) => {
    if (!state.currentCameraStream) return;
    const [track] = state.currentCameraStream.getVideoTracks();
    if (!track) return;
    const caps = state.cameraCapabilities || (track.getCapabilities ? track.getCapabilities() : {});

    // CASE 0.5x (RỘNG - ULTRA-WIDE)
    if (val <= 0.8) {
        // 1. Try native optical/digital track zoom if track supports min <= 0.75
        if (caps.zoom && typeof caps.zoom.min === 'number' && caps.zoom.min <= 0.75) {
            try {
                await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
                state.cameraZoom = caps.zoom.min;
                updateZoomUI(0.5, caps);
                showCameraHUDMessage('📷 0.5x Góc siêu rộng (Native)');
                return;
            } catch(e) {}
        }

        // 2. Switch physical camera device to Ultra-Wide
        if (state.backCameras.length > 1) {
            let targetCam = state.ultraWideCamera;
            if (!targetCam || targetCam.deviceId === state.currentCameraDeviceId) {
                targetCam = state.backCameras.find(c => c.deviceId !== state.currentCameraDeviceId);
            }

            if (targetCam) {
                showCameraHUDMessage('📷 Đang chuyển sang Camera 0.5x (Góc siêu rộng)...');
                state.currentCameraDeviceId = targetCam.deviceId;
                state.activeCameraIndex = state.backCameras.findIndex(c => c.deviceId === targetCam.deviceId);
                await window.startCameraStream();
                updateZoomUI(0.5, {});
                showCameraHUDMessage('📷 Đã bật Camera 0.5x (Góc siêu rộng)');
                return;
            }
        }

        // If only 1 camera exists on device
        updateZoomUI(0.5, {});
        showCameraHUDMessage('📷 Thiết bị chỉ có 1 camera sau - Đang dùng góc rộng nhất!');
        return;
    }

    // CASE 1x (GÓC CHUẨN)
    if (val >= 0.9 && val <= 1.2) {
        if (state.mainCamera && state.currentCameraDeviceId !== state.mainCamera.deviceId) {
            showCameraHUDMessage('📷 Đang chuyển sang Camera 1x (Chính)...');
            state.currentCameraDeviceId = state.mainCamera.deviceId;
            state.activeCameraIndex = state.backCameras.findIndex(c => c.deviceId === state.mainCamera.deviceId);
            await window.startCameraStream();
        }
        if (caps.zoom) {
            try {
                await track.applyConstraints({ advanced: [{ zoom: 1.0 }] });
                state.cameraZoom = 1.0;
            } catch(e) {}
        }
        updateZoomUI(1.0, caps);
        showCameraHUDMessage('📷 Camera 1x (Gốc chuẩn)');
        return;
    }

    // CASE 2x (THU PHÓNG)
    if (val >= 1.8) {
        if (caps.zoom) {
            try {
                const targetZ = Math.min(caps.zoom.max || 5.0, val);
                await track.applyConstraints({ advanced: [{ zoom: targetZ }] });
                state.cameraZoom = targetZ;
            } catch(e) {}
        }
        updateZoomUI(val, caps);
        showCameraHUDMessage(`📷 Thu phóng ${val}x`);
        return;
    }
};

window.toggleCameraTorch = async () => {
    if (!state.currentCameraStream) return;
    const [track] = state.currentCameraStream.getVideoTracks();
    if (!track || !track.applyConstraints) return;

    try {
        state.isTorchOn = !state.isTorchOn;
        await track.applyConstraints({ advanced: [{ torch: state.isTorchOn }] });
        const icon = document.getElementById('torchIcon');
        const btn = document.getElementById('btnCameraTorch');
        if (icon) {
            icon.className = state.isTorchOn ? 'fa-solid fa-bolt text-amber-300' : 'fa-solid fa-bolt text-white';
        }
        if (btn) {
            btn.className = state.isTorchOn 
                ? 'w-9 h-9 rounded-full bg-amber-500 text-black flex items-center justify-center text-xs backdrop-blur-md shadow-lg transition-all active:scale-95 cursor-pointer border border-amber-300'
                : 'w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs backdrop-blur-md shadow-lg transition-all active:scale-95 cursor-pointer border border-white/20';
        }
    } catch(e) {
        console.warn("Lỗi bật đèn pin:", e);
    }
};

function showCameraResultSheet(sub) {
    const sheet = document.getElementById('cameraResultSheet');
    if (!sheet) return;

    const nameEl = document.getElementById('camResStudentName');
    const sbdEl = document.getElementById('camResSbd');
    const codeEl = document.getElementById('camResCode');
    const scoreEl = document.getElementById('camResScore');
    const breakdownEl = document.getElementById('camResPartBreakdown');

    if (nameEl) nameEl.textContent = sub.student_name || 'Thí sinh (Tự động)';
    if (sbdEl) sbdEl.textContent = 'SBD: ' + (sub.student_no || '---');
    if (codeEl) codeEl.textContent = 'Mã: ' + (sub.code || '---');
    if (scoreEl) scoreEl.textContent = (typeof sub.score === 'number' ? sub.score.toFixed(2) : sub.score);
    if (breakdownEl) {
        breakdownEl.textContent = `P.I: ${sub.part1_score ?? 0}đ | P.II: ${sub.part2_score ?? 0}đ | P.III: ${sub.part3_score ?? 0}đ`;
    }

    // Candidate Handwritten Name Crop Preview
    const nameCropBox = document.getElementById('camResNameCropBox');
    const nameCropImg = document.getElementById('camResNameCropImg');
    const iconBox = document.getElementById('camResIconBox');
    if (sub.name_image && nameCropImg && nameCropBox) {
        nameCropImg.src = sub.name_image;
        nameCropBox.classList.remove('hidden');
        if (iconBox) iconBox.classList.add('hidden');
    } else {
        if (nameCropBox) nameCropBox.classList.add('hidden');
        if (iconBox) iconBox.classList.remove('hidden');
    }

    sheet.classList.remove('hidden');
    void sheet.offsetHeight; // Trigger reflow for slide animation
    sheet.classList.remove('translate-y-full');
}

window.dismissCameraResultSheet = () => {
    const sheet = document.getElementById('cameraResultSheet');
    if (!sheet) return;
    sheet.classList.add('translate-y-full');
    setTimeout(() => {
        sheet.classList.add('hidden');
    }, 280);
};

window.viewDetailedLastResult = () => {
    window.dismissCameraResultSheet();
    window.closeCameraScanner();
    const card = document.getElementById('lastResultCard');
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.captureCameraFrame = async () => {
    const video = document.getElementById('cameraVideo');
    const guide = document.getElementById('cameraA4Guide');
    if (!video || !state.currentCameraStream) return;

    // Haptic feedback
    if (navigator.vibrate) {
        try { navigator.vibrate(35); } catch(e) {}
    }

    // Dismiss any previously open bottom sheet
    window.dismissCameraResultSheet();

    // Flash animation on viewfinder
    const flash = document.getElementById('cameraFlashOverlay');
    if (flash) {
        flash.classList.remove('opacity-0');
        flash.classList.add('opacity-80');
        setTimeout(() => {
            flash.classList.remove('opacity-80');
            flash.classList.add('opacity-0');
        }, 120);
    }

    // Precise cropping to A4 guide area
    const vr = video.getBoundingClientRect();
    const gr = guide ? guide.getBoundingClientRect() : null;

    const canvas = document.createElement('canvas');
    let sx = 0, sy = 0, sw = video.videoWidth || 1920, sh = video.videoHeight || 1440;

    if (gr && vr.width > 0 && vr.height > 0 && video.videoWidth > 0 && video.videoHeight > 0) {
        const objFit = window.getComputedStyle(video).objectFit || 'cover';
        const scale = objFit === 'cover'
            ? Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight)
            : Math.min(vr.width / video.videoWidth, vr.height / video.videoHeight);
        const drawW = video.videoWidth * scale;
        const drawH = video.videoHeight * scale;
        const offsetX = (vr.width - drawW) / 2;
        const offsetY = (vr.height - drawH) / 2;

        let computedSx = (gr.left - vr.left - offsetX) / scale;
        let computedSy = (gr.top - vr.top - offsetY) / scale;
        let computedSw = gr.width / scale;
        let computedSh = gr.height / scale;

        // 20% generous padding margin so outer corner markers are never clipped
        const padX = computedSw * 0.20;
        const padY = computedSh * 0.20;
        computedSx = Math.max(0, computedSx - padX);
        computedSy = Math.max(0, computedSy - padY);
        computedSw = Math.min(video.videoWidth - computedSx, computedSw + padX * 2);
        computedSh = Math.min(video.videoHeight - computedSy, computedSh + padY * 2);

        if (computedSw > 200 && computedSh > 200) {
            sx = computedSx;
            sy = computedSy;
            sw = computedSw;
            sh = computedSh;
        }
    }

    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const statusBadge = document.getElementById('cameraScanStatus');
    const statusText = document.getElementById('cameraStatusText');
    if (statusBadge) {
        statusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-emerald-400"></i> Đang nhận diện...';
        statusBadge.classList.remove('hidden');
    }
    if (statusText) {
        statusText.innerHTML = '<span class="text-emerald-300 font-bold"><i class="fa-solid fa-spinner fa-spin"></i> Đang phân tích phiếu thi...</span>';
    }

    canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
            let sub = null;
            try {
                // Ưu tiên 1: Chấm vùng đã crop rộng 20% quanh khung ngắm
                sub = await processSingleSheet(blob);
            } catch(cropErr) {
                console.warn("Chấm vùng crop chưa khớp 4 mốc, tự động quét toàn khung video sensor:", cropErr);
                // Ưu tiên 2 (Tự động Fallback): Chụp trọn vẹn 100% cảm biến camera để không bị sót mép phiếu
                const fullCanvas = document.createElement('canvas');
                fullCanvas.width = video.videoWidth || 1920;
                fullCanvas.height = video.videoHeight || 1440;
                const fCtx = fullCanvas.getContext('2d');
                fCtx.drawImage(video, 0, 0, fullCanvas.width, fullCanvas.height);
                const fullBlob = await new Promise(r => fullCanvas.toBlob(r, 'image/jpeg', 0.95));
                if (fullBlob) {
                    sub = await processSingleSheet(fullBlob);
                } else {
                    throw cropErr;
                }
            }

            if (statusBadge) {
                statusBadge.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> Đã nhận diện!';
                setTimeout(() => statusBadge.classList.add('hidden'), 2000);
            }
            if (statusText) {
                statusText.innerHTML = `<span class="text-emerald-300 font-bold">✓ Đã chấm xong: ${(typeof sub.score === 'number' ? sub.score.toFixed(2) : sub.score)} điểm · ${sub.student_name || ('SBD ' + sub.student_no)}</span>`;
                setTimeout(() => {
                    if (statusText) statusText.textContent = 'Canh 4 ô đen góc phiếu vào 4 góc khung ngắm để tự động chấm.';
                }, 3200);
            }
            showCameraResultSheet(sub);
        } catch(err) {
            console.warn("Scan frame error:", err);
            if (statusBadge) {
                statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i> Căn 4 góc đen chưa rõ, thử lại';
                statusBadge.classList.remove('hidden');
                setTimeout(() => statusBadge.classList.add('hidden'), 3500);
            }
            if (statusText) {
                statusText.innerHTML = '<span class="text-amber-300 font-bold">⚠️ Chưa nhận diện đủ 4 mốc đen. Hãy đưa phiếu vào trọn khung hình!</span>';
                setTimeout(() => {
                    if (statusText) statusText.textContent = 'Canh 4 ô đen góc phiếu vào 4 góc khung ngắm để tự động chấm.';
                }, 3200);
            }
        }
    }, 'image/jpeg', 0.95);
};

// ========================================================
// 6. RESULTS TABLE, MODAL & EXPORT
// ========================================================
window.renderResultsTable = () => {
    const tbody = document.getElementById('resultsTableBody');
    const label = document.getElementById('resultsCountLabel');
    if (!tbody) return;

    const queryStr = (document.getElementById('resultSearchInput')?.value || '').toLowerCase().trim();
    let filtered = state.submissions;
    if (queryStr) {
        filtered = state.submissions.filter(s => 
            (s.student_no && s.student_no.toLowerCase().includes(queryStr)) ||
            (s.student_name && s.student_name.toLowerCase().includes(queryStr)) ||
            (s.code && s.code.toLowerCase().includes(queryStr))
        );
    }

    if (label) label.textContent = `${filtered.length} kết quả`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 italic">Không tìm thấy kết quả nào phù hợp.</td></tr>`;
        return;
    }

    // Sort by SBD or score
    const sorted = [...filtered].sort((a, b) => Number(a.student_no || 0) - Number(b.student_no || 0));

    tbody.innerHTML = sorted.map((s, idx) => `
        <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-750 transition-colors">
            <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
            <td class="p-3 font-mono font-bold text-slate-800 dark:text-slate-100">${s.student_no || '---'}</td>
            <td class="p-3">
                <div class="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    ${s.student_name || 'Học sinh ' + (s.student_no || '')}
                    ${s.name_image ? `<img src="${s.name_image}" class="h-5 max-w-[80px] object-contain border border-slate-200 dark:border-slate-700 rounded bg-white" title="Chữ viết tay gốc">` : ''}
                </div>
                <div class="text-[11px] text-slate-400">${s.class_name || ''}</div>
            </td>
            <td class="p-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">${s.code || '---'}</td>
            <td class="p-3 text-center font-mono text-slate-600 dark:text-slate-400">${(s.part1_score ?? 0).toFixed(2)}</td>
            <td class="p-3 text-center font-mono text-slate-600 dark:text-slate-400">${(s.part2_score ?? 0).toFixed(2)}</td>
            <td class="p-3 text-center font-mono text-slate-600 dark:text-slate-400">${(s.part3_score ?? 0).toFixed(2)}</td>
            <td class="p-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">${(s.score ?? 0).toFixed(2)}</td>
            <td class="p-3 text-center text-slate-400 text-[11px]">${new Date(s.createdAt).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'})}</td>
            <td class="p-3 text-center">
                <div class="flex items-center justify-center gap-1.5">
                    <button type="button" onclick="window.viewSubmissionDetail('${s.id}')" class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center justify-center transition-colors" title="Xem chi tiết phiếu chấm">
                        <i class="fa-solid fa-eye text-xs"></i>
                    </button>
                    <button type="button" onclick="window.deleteSubmission('${s.id}')" class="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 flex items-center justify-center transition-colors" title="Xóa kết quả này">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
};

window.viewSubmissionDetail = (subId) => {
    const sub = state.submissions.find(s => s.id === subId);
    if (!sub) return;
    state.lastSubmission = sub;
    window.switchTab('scan');
    // Display in inspector
    displayLastResultInspector(sub, {
        template: (window.MAU && window.MAU[state.exam.sheet_template]) || window.MAU.qmcv1239,
        part1: sub.answers,
        code: sub.code
    });
};

window.deleteSubmission = async (subId) => {
    const res = await Swal.fire({
        title: 'Xóa kết quả bài chấm này?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#ef4444'
    });
    if (!res.isConfirmed) return;

    state.submissions = state.submissions.filter(s => s.id !== subId);
    if (state.teacherUid) {
        try { await deleteDoc(doc(db, "omr_submissions", subId)); } catch(e) {}
    }
    localStorage.setItem(`omr_submissions_${state.exam.id}`, JSON.stringify(state.submissions));
    window.renderResultsTable();
    updateOverviewStats();
};

window.clearAllSubmissionsForCurrentExam = async () => {
    if (state.submissions.length === 0) return;
    const res = await Swal.fire({
        title: 'Xóa toàn bộ kết quả chấm của bài thi này?',
        text: 'Thao tác này không thể hoàn tác!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa tất cả',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#ef4444'
    });
    if (!res.isConfirmed) return;

    for (const s of state.submissions) {
        if (state.teacherUid) {
            try { await deleteDoc(doc(db, "omr_submissions", s.id)); } catch(e) {}
        }
    }
    state.submissions = [];
    localStorage.removeItem(`omr_submissions_${state.exam.id}`);
    window.renderResultsTable();
    updateOverviewStats();
    Swal.fire('Đã xóa', 'Toàn bộ bài chấm đã được làm trống!', 'success');
};

window.exportResultsToExcel = () => {
    if (state.submissions.length === 0) {
        Swal.fire('Thông báo', 'Chưa có kết quả nào để xuất file!', 'info');
        return;
    }

    const headers = ['STT', 'SBD', 'Họ và tên', 'Lớp', 'Mã đề', 'Điểm Phần I', 'Điểm Phần II', 'Điểm Phần III', 'Tổng điểm', 'Thời gian chấm'];
    const rows = state.submissions.map((s, idx) => [
        idx + 1,
        `"${s.student_no || ''}"`,
        `"${(s.student_name || '').replace(/"/g, '""')}"`,
        `"${(s.class_name || '').replace(/"/g, '""')}"`,
        `"${s.code || ''}"`,
        (s.part1_score ?? 0).toFixed(2),
        (s.part2_score ?? 0).toFixed(2),
        (s.part3_score ?? 0).toFixed(2),
        (s.score ?? 0).toFixed(2),
        `"${new Date(s.createdAt).toLocaleString('vi-VN')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Ket_qua_cham_OMR_${(state.exam?.name || 'Bai_thi').replace(/\s+/g, '_')}_${Date.now()}.csv`;
    link.click();
};

// ========================================================
// 7. KEYS & BAREM TAB
// ========================================================
window.renderKeysTab = () => {
    if (!state.exam) return;
    const selector = document.getElementById('keyCodeSelector');
    if (selector) {
        selector.innerHTML = state.exam.codes.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    const currentCode = selector?.value || state.exam.codes[0] || '101';
    window.loadCodeKeyInputs(currentCode);
};

window.handleKeyExamCodeChange = (code) => {
    window.loadCodeKeyInputs(code);
};

window.loadCodeKeyInputs = (code) => {
    const key = state.keys[code] || { answers: '', part2: [], part3: [] };
    
    // Part 1 Grid
    const p1Cont = document.getElementById('part1KeyGrid');
    const qCount1 = state.exam?.question_count || 12;
    if (p1Cont) {
        p1Cont.innerHTML = Array.from({ length: qCount1 }, (_, i) => {
            const currentAns = (key.answers || '')[i] || '-';
            return `
                <div class="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span class="font-bold text-slate-500">Câu ${i + 1}:</span>
                    <select data-p1="${i}" class="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold text-emerald-600 outline-none">
                        <option value="-" ${currentAns==='-'?'selected':''}>-</option>
                        <option value="A" ${currentAns==='A'?'selected':''}>A</option>
                        <option value="B" ${currentAns==='B'?'selected':''}>B</option>
                        <option value="C" ${currentAns==='C'?'selected':''}>C</option>
                        <option value="D" ${currentAns==='D'?'selected':''}>D</option>
                    </select>
                </div>
            `;
        }).join('');
    }

    // Part 2 Grid
    const p2Cont = document.getElementById('part2KeyGrid');
    const qCount2 = state.exam?.part2_count || 4;
    if (p2Cont) {
        p2Cont.innerHTML = Array.from({ length: qCount2 }, (_, q) => {
            const currentChunk = (key.part2 && key.part2[q]) ? key.part2[q] : '----';
            return `
                <div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <b class="text-xs text-slate-700 dark:text-slate-200">Câu ${q + 1} (Đúng/Sai)</b>
                    ${['a', 'b', 'c', 'd'].map((opt, r) => {
                        const val = currentChunk[r] || '-';
                        return `
                            <div class="flex items-center justify-between text-xs">
                                <span class="font-bold text-slate-500">Ý ${opt})</span>
                                <div class="inline-flex gap-1">
                                    <button type="button" onclick="window.selectP2Btn(this, ${q}, ${r}, 'Đ')" class="p2-btn px-2.5 py-0.5 rounded text-xs font-bold border transition-all ${val==='Đ'?'bg-emerald-600 text-white border-emerald-600':'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}">Đ</button>
                                    <button type="button" onclick="window.selectP2Btn(this, ${q}, ${r}, 'S')" class="p2-btn px-2.5 py-0.5 rounded text-xs font-bold border transition-all ${val==='S'?'bg-rose-600 text-white border-rose-600':'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}">S</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('');
    }

    // Part 3 Grid
    const p3Cont = document.getElementById('part3KeyGrid');
    const qCount3 = state.exam?.part3_count || 6;
    if (p3Cont) {
        p3Cont.innerHTML = Array.from({ length: qCount3 }, (_, i) => {
            const val = (key.part3 && key.part3[i]) || '';
            return `
                <div class="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                    <label class="block font-bold text-slate-500">Câu ${i + 1}:</label>
                    <input type="text" data-p3="${i}" value="${val}" placeholder="VD: -4,5" class="w-full px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold text-center outline-none">
                </div>
            `;
        }).join('');
    }
};

window.selectP2Btn = (btn, q, r, val) => {
    const parent = btn.parentElement;
    parent.querySelectorAll('button').forEach(b => {
        b.className = "p2-btn px-2.5 py-0.5 rounded text-xs font-bold border transition-all bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600";
    });
    btn.className = val === 'Đ' 
        ? "p2-btn px-2.5 py-0.5 rounded text-xs font-bold border transition-all bg-emerald-600 text-white border-emerald-600"
        : "p2-btn px-2.5 py-0.5 rounded text-xs font-bold border transition-all bg-rose-600 text-white border-rose-600";
    btn.dataset.val = val;
};

window.applyBulkKey = () => {
    const text = document.getElementById('bulkKeyInput')?.value || '';
    if (!text) return;
    try {
        const qCount = state.exam?.question_count || 12;
        const res = window.parseQuickAnswers ? window.parseQuickAnswers(text, qCount) : { answers: text.toUpperCase().replace(/[^ABCD]/g, '') };
        const ansStr = res.answers || '';
        document.querySelectorAll('[data-p1]').forEach((sel, i) => {
            if (ansStr[i]) sel.value = ansStr[i];
        });
        Swal.fire({
            icon: 'success',
            title: 'Đã áp dụng chuỗi đáp án!',
            text: `Đã điền đáp án cho ${Math.min(ansStr.length, qCount)} câu Phần I.`,
            timer: 1800
        });
    } catch(err) {
        Swal.fire('Lỗi định dạng', err.message, 'warning');
    }
};

window.saveAllKeys = async () => {
    const code = document.getElementById('keyCodeSelector')?.value || '101';
    const qCount1 = state.exam?.question_count || 12;
    const qCount2 = state.exam?.part2_count || 4;
    const qCount3 = state.exam?.part3_count || 6;

    // Read P1
    let p1Answers = '';
    document.querySelectorAll('[data-p1]').forEach(sel => {
        p1Answers += sel.value || '-';
    });

    // Read P2
    const p2Cards = document.getElementById('part2KeyGrid')?.children || [];
    let p2Chunks = [];
    for (let q = 0; q < qCount2; q++) {
        const card = p2Cards[q];
        let chunk = '';
        if (card) {
            card.querySelectorAll('.inline-flex').forEach(flex => {
                const active = flex.querySelector('.bg-emerald-600, .bg-rose-600');
                chunk += active ? active.textContent.trim() : '-';
            });
        }
        p2Chunks.push(chunk || '----');
    }

    // Read P3
    let p3Answers = [];
    document.querySelectorAll('[data-p3]').forEach(inp => {
        p3Answers.push(inp.value.trim());
    });

    const keyObj = {
        id: `key_${state.exam.id}_${code}`,
        examId: state.exam.id,
        teacherId: state.teacherUid,
        code,
        answers: p1Answers,
        part2: p2Chunks,
        part3: p3Answers,
        updatedAt: new Date().toISOString()
    };

    state.keys[code] = keyObj;

    // Save to Firestore
    if (state.teacherUid) {
        try {
            await setDoc(doc(db, "omr_keys", keyObj.id), keyObj);
        } catch(e) {}
    }
    // Save to localStorage
    localStorage.setItem(`omr_keys_${state.exam.id}`, JSON.stringify(Object.values(state.keys)));

    Swal.fire('Thành công', `Đã lưu đáp án cho mã đề ${code}!`, 'success');
};

// ========================================================
// 8. STUDENTS & ROSTER SYNC FROM LMS
// ========================================================
window.renderStudentsTab = () => {
    const tbody = document.getElementById('studentsTableBody');
    if (!tbody) return;

    if (state.students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-400 italic">Chưa có danh sách học sinh. Bấm "Đồng bộ từ Lớp học LMS" để nạp ngay!</td></tr>`;
        return;
    }

    tbody.innerHTML = state.students.map((s, idx) => {
        const sub = state.submissions.find(sub => sub.student_no === s.student_no);
        const statusBadge = sub 
            ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Đã chấm (${sub.score.toFixed(2)}đ)</span>`
            : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-700">Chưa chấm</span>`;

        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-750">
                <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
                <td class="p-3 font-mono font-bold text-slate-800 dark:text-slate-100">${s.student_no}</td>
                <td class="p-3 font-bold text-slate-900 dark:text-white">${s.name}</td>
                <td class="p-3 text-slate-500">${s.class_name || '---'}</td>
                <td class="p-3 text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('');
};

window.openSyncLmsClassModal = async () => {
    const modal = document.getElementById('syncLmsClassModal');
    const select = document.getElementById('lmsClassSelector');
    if (!modal || !select) return;

    modal.classList.remove('hidden');
    select.innerHTML = `<option value="">Đang tải danh sách lớp học của bạn...</option>`;

    try {
        let classes = [];
        if (state.teacherUid) {
            const qClasses = query(collection(db, "classes"), where("teacherId", "==", state.teacherUid));
            const snap = await getDocs(qClasses);
            classes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        if (classes.length === 0) {
            select.innerHTML = `<option value="">Bạn chưa tạo lớp học nào trong QMath LMS</option>`;
            return;
        }

        select.innerHTML = classes.map(c => `
            <option value="${c.id}">${c.name || 'Lớp học'} (${c.studentCount || (c.students?.length) || 0} học sinh)</option>
        `).join('');
    } catch(err) {
        console.error("Lỗi tải lớp LMS:", err);
        select.innerHTML = `<option value="">Lỗi tải dữ liệu lớp học</option>`;
    }
};

window.confirmSyncFromLmsClass = async () => {
    const classId = document.getElementById('lmsClassSelector')?.value;
    if (!classId) return;

    try {
        Swal.showLoading();
        const classDoc = await getDoc(doc(db, "classes", classId));
        if (!classDoc.exists()) throw new Error("Lớp học không tồn tại!");
        const classData = classDoc.data();
        const className = classData.name || 'Lớp';

        let rawStudents = classData.students || [];
        if (rawStudents.length === 0) {
            // Check subcollection
            const qSt = await getDocs(collection(db, `classes/${classId}/students`));
            rawStudents = qSt.docs.map(d => d.data());
        }

        if (rawStudents.length === 0) {
            Swal.fire('Thông báo', 'Lớp học này hiện chưa có học sinh nào!', 'info');
            return;
        }

        // Format to OMR Students with SBD (001, 002...)
        const newStudents = rawStudents.map((st, idx) => {
            const sbd = String(idx + 1).padStart(3, '0');
            const stName = st.name || st.studentName || st.fullName || 'Học sinh';
            return {
                id: `st_${state.exam.id}_${sbd}`,
                examId: state.exam.id,
                teacherId: state.teacherUid,
                student_no: sbd,
                name: stName,
                class_name: className
            };
        });

        state.students = newStudents;
        // Save to Firestore & localStorage
        if (state.teacherUid) {
            for (const s of newStudents) {
                try { await setDoc(doc(db, "omr_students", s.id), s); } catch(e) {}
            }
        }
        localStorage.setItem(`omr_students_${state.exam.id}`, JSON.stringify(newStudents));

        document.getElementById('syncLmsClassModal').classList.add('hidden');
        window.renderStudentsTab();
        updateOverviewStats();
        Swal.fire('Thành công', `Đã đồng bộ ${newStudents.length} học sinh từ lớp ${className}!`, 'success');
    } catch(err) {
        Swal.fire('Lỗi đồng bộ', err.message, 'error');
    }
};

window.openImportStudentsCsvModal = () => {
    document.getElementById('importStudentsCsvModal').classList.remove('hidden');
};

window.confirmImportStudentsCsv = async () => {
    const text = document.getElementById('importStudentsText')?.value || '';
    if (!text.trim()) return;

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const imported = [];

    lines.forEach((line, idx) => {
        const parts = line.split(/[,;\t]/).map(p => p.trim());
        const sbd = parts[0] || String(idx + 1).padStart(3, '0');
        const name = parts[1] || `Học sinh ${sbd}`;
        const className = parts[2] || '';
        imported.push({
            id: `st_${state.exam.id}_${sbd}`,
            examId: state.exam.id,
            teacherId: state.teacherUid,
            student_no: sbd,
            name,
            class_name: className
        });
    });

    state.students = imported;
    if (state.teacherUid) {
        for (const s of imported) {
            try { await setDoc(doc(db, "omr_students", s.id), s); } catch(e) {}
        }
    }
    localStorage.setItem(`omr_students_${state.exam.id}`, JSON.stringify(imported));

    document.getElementById('importStudentsCsvModal').classList.add('hidden');
    window.renderStudentsTab();
    updateOverviewStats();
    Swal.fire('Thành công', `Đã nạp ${imported.length} học sinh vào danh sách!`, 'success');
};

window.clearCurrentExamStudents = async () => {
    if (state.students.length === 0) return;
    const res = await Swal.fire({
        title: 'Xóa danh sách học sinh bài thi này?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa',
        confirmButtonColor: '#ef4444'
    });
    if (!res.isConfirmed) return;

    for (const s of state.students) {
        if (state.teacherUid) {
            try { await deleteDoc(doc(db, "omr_students", s.id)); } catch(e) {}
        }
    }
    state.students = [];
    localStorage.removeItem(`omr_students_${state.exam.id}`);
    window.renderStudentsTab();
    updateOverviewStats();
};

// ========================================================
// 9. DOWNLOADS TAB (PRINTABLE SHEET TEMPLATES)
// ========================================================
window.renderDownloadsTab = () => {
    const cont = document.getElementById('downloadSheetsList');
    if (!cont) return;

    const sheets = [
        {
            name: 'QM 2025 - CV 1239 - Chuẩn Kỳ Thi',
            desc: '40 câu A/B/C/D · 8 câu Đúng/Sai · 6 câu trả lời ngắn · SBD 8 số · Mã đề 4 số.',
            pdf: './omr/assets/qm-cv1239.pdf',
            preview: './omr/assets/qm-cv1239.jpg'
        },
        {
            name: 'Phiếu TLTN - BGD 2025 Gốc',
            desc: 'Phiếu dọc TLTN 2025 gốc của Bộ GD&ĐT · 40 câu A/B/C/D · 8 câu Đúng/Sai · 6 câu TLN.',
            pdf: './omr/assets/phieu-chinh.pdf',
            preview: './omr/assets/phieu-chinh.png'
        },
        {
            name: 'Phiếu ngang 40 câu - TNMaker',
            desc: 'Phiếu khổ ngang 40 câu A/B/C/D · Mã đề 4 số · Số phách.',
            pdf: './omr/assets/tnmaker-40.pdf',
            preview: './omr/assets/tnmaker-40.png'
        },
        {
            name: 'Phiếu TLTN_HSG_Phú Thọ',
            desc: '50 câu A/B/C/D · 10 câu Đúng/Sai · 12 câu TLN · Dành cho HSG.',
            pdf: './omr/assets/phu-tho.pdf',
            preview: './omr/assets/phu-tho.jpg'
        },
        {
            name: 'QM_40_Ngang - Đen Trắng',
            desc: '40 câu A/B/C/D · Khổ ngang gọn gàng tiết kiệm giấy in.',
            pdf: './omr/assets/phieu-ngang.pdf',
            preview: './omr/assets/qm-40-ngang.png'
        }
    ];

    cont.innerHTML = sheets.map(s => `
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-2xs flex flex-col justify-between">
            <div>
                <div class="h-48 bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden p-2">
                    <img src="${s.preview}" class="max-h-full object-contain shadow-xs rounded">
                </div>
                <div class="p-4 space-y-1.5">
                    <h4 class="font-bold text-sm text-slate-800 dark:text-white">${s.name}</h4>
                    <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">${s.desc}</p>
                </div>
            </div>
            <div class="p-4 pt-0 flex gap-2">
                <a href="${s.pdf}" target="_blank" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold text-center transition-all flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-file-pdf"></i> Tải PDF In A4
                </a>
                <a href="${s.preview}" target="_blank" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors" title="Xem ảnh">
                    <i class="fa-solid fa-eye"></i>
                </a>
            </div>
        </div>
    `).join('');
};

// ========================================================
// 10. EXAMS LIST & CREATE MODAL
// ========================================================
window.renderExamsListTab = () => {
    const cont = document.getElementById('examsListContainer');
    if (!cont) return;

    cont.innerHTML = state.exams.map(e => `
        <div class="bg-white dark:bg-slate-800 p-5 rounded-2xl border ${state.exam?.id === e.id ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200 dark:border-slate-700'} shadow-2xs flex flex-col justify-between space-y-4">
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${state.exam?.id === e.id ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}">
                            ${state.exam?.id === e.id ? 'Đang chọn' : (e.isLmsExam ? 'LMS' : 'Bài thi')}
                        </span>
                        ${e.isLmsExam ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">Kho đề</span>' : ''}
                    </div>
                    <span class="text-[10px] text-slate-400 font-mono">${new Date(e.createdAt || Date.now()).toLocaleDateString('vi-VN')}</span>
                </div>
                <h4 class="font-extrabold text-base text-slate-800 dark:text-white leading-tight">${e.name}</h4>
                <div class="text-xs text-slate-500 dark:text-slate-400 space-y-0.5">
                    <div>Mẫu phiếu: <b class="text-slate-700 dark:text-slate-300">${(window.MAU && window.MAU[e.sheet_template]) ? window.MAU[e.sheet_template].ten : e.sheet_template}</b></div>
                    <div>Mã đề: <b class="font-mono text-slate-700 dark:text-slate-300">${(e.codes || []).join(', ')}</b></div>
                    <div>Cấu trúc: <b class="text-slate-700 dark:text-slate-300">${e.question_count || 12} TN · ${e.part2_count || 4} Đ/S · ${e.part3_count || 6} TLN</b></div>
                </div>
            </div>

            <div class="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button type="button" onclick="window.selectExamAndSwitch('${e.id}')" class="flex-1 py-2 ${state.exam?.id === e.id ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' : 'bg-emerald-600 hover:bg-emerald-700 text-white'} rounded-xl text-xs font-bold transition-all shadow-xs">
                    ${state.exam?.id === e.id ? 'Đang chấm bài này' : 'Chọn bài này'}
                </button>
                ${!e.isLmsExam ? `
                <button type="button" onclick="window.deleteExam('${e.id}')" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition-colors" title="Xóa bài thi này">
                    <i class="fa-solid fa-trash"></i>
                </button>` : ''}
            </div>
        </div>
    `).join('');
};

window.selectExamAndSwitch = async (id) => {
    await selectExam(id);
    window.switchTab('scan');
};

window.deleteExam = async (examId) => {
    if (state.exams.length <= 1) {
        Swal.fire('Lưu ý', 'Bạn cần giữ lại ít nhất một bài thi!', 'warning');
        return;
    }
    const res = await Swal.fire({
        title: 'Xóa bài thi này?',
        text: 'Toàn bộ đáp án, danh sách học sinh và kết quả chấm của bài thi sẽ bị xóa!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa',
        confirmButtonColor: '#ef4444'
    });
    if (!res.isConfirmed) return;

    state.exams = state.exams.filter(e => e.id !== examId);
    if (state.teacherUid) {
        try { await deleteDoc(doc(db, "omr_exams", examId)); } catch(e) {}
    }
    saveLocalExams(state.exams);
    await selectExam(state.exams[0].id);
    window.renderExamsListTab();
};

window.openCreateExamModal = () => {
    document.getElementById('createExamModal').classList.remove('hidden');
};

window.closeCreateExamModal = () => {
    document.getElementById('createExamModal').classList.add('hidden');
};

window.confirmCreateExam = async () => {
    const name = document.getElementById('newExamName')?.value.trim();
    if (!name) {
        Swal.fire('Lưu ý', 'Vui lòng nhập tên bài thi!', 'warning');
        return;
    }
    const tpl = document.getElementById('newExamTemplate')?.value || 'qmcv1239';
    const codes = (document.getElementById('newExamCodes')?.value || '101, 102').split(',').map(s => s.trim()).filter(Boolean);
    const p1Count = parseInt(document.getElementById('newExamCountP1')?.value) || 12;
    const p2Count = parseInt(document.getElementById('newExamCountP2')?.value) || 4;
    const p3Count = parseInt(document.getElementById('newExamCountP3')?.value) || 6;

    const newExam = {
        id: 'exam_' + (state.teacherUid || 'demo') + '_' + Date.now(),
        teacherId: state.teacherUid,
        name,
        subject: 'Toán học',
        sheet_template: tpl,
        question_count: p1Count,
        part2_count: p2Count,
        part3_count: p3Count,
        part1_point: 0.25,
        part2_points: [0.1, 0.25, 0.5, 1.0],
        part3_point: 0.5,
        codes,
        createdAt: new Date().toISOString()
    };

    state.exams.unshift(newExam);
    saveLocalExams(state.exams);
    if (state.teacherUid) {
        try { await setDoc(doc(db, "omr_exams", newExam.id), newExam); } catch(e) {}
    }

    window.closeCreateExamModal();
    await selectExam(newExam.id);
    window.switchTab('keys');
    Swal.fire('Thành công', 'Đã tạo bài thi mới! Hãy thiết lập đáp án cho các mã đề.', 'success');
};

// Sync autoSave checkboxes between Main View and Camera HUD
setTimeout(() => {
    const autoSaveMain = document.getElementById('autoSaveToggle');
    const autoSaveCam = document.getElementById('cameraAutoSave');
    if (autoSaveMain && autoSaveCam) {
        autoSaveMain.addEventListener('change', () => { autoSaveCam.checked = autoSaveMain.checked; });
        autoSaveCam.addEventListener('change', () => { autoSaveMain.checked = autoSaveCam.checked; });
    }
}, 500);

// ========================================================
// 11. LMS EXAM PICKER MODAL (KHO ĐỀ THI LMS QMATH)
// ========================================================
window.openLmsExamPickerModal = () => {
    const modal = document.getElementById('lmsExamPickerModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const searchInput = document.getElementById('lmsExamSearchInput');
    if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 100);
    }
    window.renderLmsExamPickerList();
};

window.closeLmsExamPickerModal = () => {
    const modal = document.getElementById('lmsExamPickerModal');
    if (modal) modal.classList.add('hidden');
};

window.renderLmsExamPickerList = () => {
    const listEl = document.getElementById('lmsExamPickerList');
    if (!listEl) return;
    const filter = (document.getElementById('lmsExamSearchInput')?.value || '').toLowerCase().trim();

    // Get LMS exams from state.exams or state.lmsExams
    const lmsItems = (state.exams || []).filter(e => e.isLmsExam);

    const filtered = lmsItems.filter(e => {
        return !filter || (e.name && e.name.toLowerCase().includes(filter));
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="p-8 text-center text-slate-400">
                <i class="fa-solid fa-file-circle-question text-3xl mb-2 opacity-50"></i>
                <p class="text-xs font-semibold">Không tìm thấy đề thi LMS nào ${filter ? 'khớp từ khóa "' + filter + '"' : 'trong tài khoản của bạn'}.</p>
                <p class="text-[11px] text-slate-500 mt-1">Đề thi bạn tạo ở mục "Kho đề thi" hoặc "Soạn đề" trên LMS sẽ tự động xuất hiện tại đây.</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = filtered.map(item => {
        const isCurrent = state.exam?.id === item.id;
        const totalQ = (item.question_count || 0) + (item.part2_count || 0) + (item.part3_count || 0);
        return `
            <div class="pt-2.5 first:pt-0 flex items-center justify-between gap-3 group">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 mb-1">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Kho đề LMS
                        </span>
                        ${isCurrent ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500 text-white">Đang chọn</span>' : ''}
                        <span class="text-[11px] text-slate-400 font-mono">${item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : ''}</span>
                    </div>
                    <h5 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate group-hover:text-emerald-600 transition-colors">
                        ${item.name}
                    </h5>
                    <div class="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                        <span>Cấu trúc: <b>${item.question_count || 12} TN · ${item.part2_count || 4} Đ/S · ${item.part3_count || 6} TLN</b></span>
                        <span>Mã đề: <b>${(item.codes || ['101']).join(', ')}</b></span>
                    </div>
                </div>
                <button type="button" onclick="window.selectLmsExamForGrading('${item.id}')" class="px-3.5 py-1.5 rounded-xl ${isCurrent ? 'bg-slate-100 dark:bg-slate-700 text-slate-500 cursor-default' : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xs cursor-pointer'} text-xs font-bold transition-all shrink-0">
                    ${isCurrent ? 'Đang dùng' : 'Chọn chấm'}
                </button>
            </div>
        `;
    }).join('');
};

window.selectLmsExamForGrading = async (examId) => {
    window.closeLmsExamPickerModal();
    await selectExam(examId);
    window.switchTab('scan');
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Đã chọn đề LMS: ${state.exam?.name}`,
        showConfirmButton: false,
        timer: 2500
    });
};
