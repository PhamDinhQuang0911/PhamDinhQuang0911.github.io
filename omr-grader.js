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
// 3. EXAMS & DATA MANAGEMENT (Firestore + LocalStorage)
// ========================================================
async function loadTeacherExams() {
    try {
        let loaded = [];
        // Try Firestore
        if (state.teacherUid) {
            try {
                const qExams = query(collection(db, "omr_exams"), where("teacherId", "==", state.teacherUid));
                const snap = await getDocs(qExams);
                loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch(err) {
                console.warn("Firestore omr_exams query failed, using localStorage fallback:", err);
            }
        }

        // Fallback or merge with localStorage
        const localKey = 'omr_exams_' + (state.teacherUid || 'guest');
        const localData = JSON.parse(localStorage.getItem(localKey) || '[]');
        if (loaded.length === 0 && localData.length > 0) {
            loaded = localData;
        }

        // Seed Sample Exam if none exists
        if (loaded.length === 0) {
            const sampleExam = createSampleExamObj();
            loaded = [sampleExam];
            saveLocalExams(loaded);
            if (state.teacherUid) {
                try {
                    await setDoc(doc(db, "omr_exams", sampleExam.id), sampleExam);
                    // Also seed keys and sample students
                    const sampleKeys = createSampleKeys(sampleExam.id);
                    for (const k of sampleKeys) {
                        await setDoc(doc(db, "omr_keys", k.id), k);
                    }
                    const sampleStudents = createSampleStudents(sampleExam.id);
                    for (const s of sampleStudents) {
                        await setDoc(doc(db, "omr_students", s.id), s);
                    }
                } catch(e) {}
            }
        }

        state.exams = loaded;
        const lastSelectedId = localStorage.getItem('omr_last_exam_id_' + state.teacherUid);
        const targetExam = state.exams.find(e => e.id === lastSelectedId) || state.exams[0];
        await selectExam(targetExam.id);
    } catch(err) {
        console.error("Lỗi tải bài thi OMR:", err);
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
    if (titleEl) titleEl.textContent = exam.name;
    if (badgeEl) {
        const tplName = (window.MAU && window.MAU[exam.sheet_template]) ? window.MAU[exam.sheet_template].ten : exam.sheet_template;
        badgeEl.textContent = tplName || 'CV 1239';
    }

    // Load Exam Keys
    await loadExamKeys(exam.id);
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
    document.getElementById('scanUploadArea').classList.toggle('hidden', !isUpload);
    document.getElementById('scanCameraArea').classList.toggle('hidden', isUpload);
    
    document.getElementById('btnModeUpload').className = isUpload 
        ? "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-800 text-emerald-600 shadow-xs"
        : "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-500 hover:text-slate-800 dark:text-slate-400";
    document.getElementById('btnModeCamera').className = !isUpload 
        ? "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-white dark:bg-slate-800 text-emerald-600 shadow-xs"
        : "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-500 hover:text-slate-800 dark:text-slate-400";

    if (!isUpload) {
        window.startCameraStream();
    } else {
        window.stopCameraStream();
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

    state.lastSubmission = submission;
    state.lastRawResult = rawResult;

    // Display in Last Result Inspector
    displayLastResultInspector(submission, rawResult);

    // Auto save if enabled
    const autoSave = document.getElementById('autoSaveToggle')?.checked ?? true;
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
                    template: tpl
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

function renderSvgOverlay(rawResult, code) {
    const svg = document.getElementById('resSvgOverlay');
    if (!svg || !rawResult || !rawResult.template) return;
    const tpl = rawResult.template;
    const key = state.keys[code] || state.keys[Object.keys(state.keys)[0]] || { answers: '', part2: [], part3: [] };

    let marks = '';
    const ring = (pt, color, stroke = 2.5, r = 14) => {
        const x = pt[0] * 100;
        const y = pt[1] * 100;
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" />`;
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
                    marks += ring(pt, '#10b981', 3, 15); // Green (Correct)
                } else if (isStudentMark && !isKeyMark) {
                    marks += ring(pt, '#ef4444', 3, 15); // Red (Wrong)
                } else if (!isStudentMark && isKeyMark && studentAns && studentAns !== '-') {
                    marks += ring(pt, '#f59e0b', 2, 14); // Yellow (Key position)
                }
            });
        }
    }

    // Set SVG viewBox to match template dimensions in cm * 100
    const w = (tpl.khung ? tpl.khung[2] : 16.53) * 100;
    const h = (tpl.khung ? tpl.khung[3] : 23.39) * 100;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = marks;
}

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
// 5. LIVE CAMERA STREAM CONTROLLER
// ========================================================
state.cameraZoom = 1.0;
state.isTorchOn = false;

window.startCameraStream = async () => {
    const video = document.getElementById('cameraVideo');
    if (!video) return;

    window.stopCameraStream();

    try {
        const constraints = {
            video: {
                facingMode: { ideal: state.currentFacingMode },
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
                aspectRatio: { ideal: 1.333333 } // 4:3 preferred for documents/tablets
            },
            audio: false
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        state.currentCameraStream = stream;
        video.srcObject = stream;
        await video.play();

        // Inspect lens capabilities (Zoom, Torch, Focus)
        const [track] = stream.getVideoTracks();
        if (track && track.getCapabilities) {
            const caps = track.getCapabilities();
            state.cameraCapabilities = caps;

            // 1. Zoom control setup
            const zoomControls = document.getElementById('cameraZoomControls');
            const zoomBadge = document.getElementById('cameraZoomBadge');
            if (caps.zoom && caps.zoom.max > 1) {
                if (zoomControls) zoomControls.classList.remove('hidden');
                if (zoomBadge) zoomBadge.classList.remove('hidden');
            } else {
                if (zoomControls) zoomControls.classList.add('hidden');
            }

            // 2. Torch control setup
            const torchBtn = document.getElementById('btnCameraTorch');
            if (caps.torch && torchBtn) {
                torchBtn.classList.remove('hidden');
            }
        }
    } catch(err) {
        console.error("Không mở được camera:", err);
        Swal.fire('Lỗi Camera', 'Không thể truy cập camera. Vui lòng cấp quyền camera trong cài đặt trình duyệt hoặc chuyển sang chế độ tải ảnh phiếu!', 'error');
        window.setScanMode('upload');
    }
};

window.stopCameraStream = () => {
    if (state.currentCameraStream) {
        state.currentCameraStream.getTracks().forEach(t => t.stop());
        state.currentCameraStream = null;
    }
    const video = document.getElementById('cameraVideo');
    if (video) video.srcObject = null;
    state.isTorchOn = false;
};

window.switchCameraLens = () => {
    state.currentFacingMode = state.currentFacingMode === 'environment' ? 'user' : 'environment';
    window.startCameraStream();
};

window.setCameraZoom = async (val) => {
    if (!state.currentCameraStream) return;
    const [track] = state.currentCameraStream.getVideoTracks();
    if (!track || !track.applyConstraints) return;

    try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.zoom) {
            const targetZoom = Math.max(caps.zoom.min || 1, Math.min(caps.zoom.max || 5, val));
            await track.applyConstraints({ advanced: [{ zoom: targetZoom }] });
            state.cameraZoom = targetZoom;
            const badge = document.getElementById('cameraZoomBadge');
            if (badge) badge.textContent = targetZoom.toFixed(1) + 'x';
            
            document.querySelectorAll('.zoom-btn').forEach(btn => {
                const bVal = parseFloat(btn.textContent);
                if (bVal === val) {
                    btn.className = 'zoom-btn w-9 h-9 rounded-full bg-emerald-600 text-white text-xs font-black backdrop-blur-md border border-emerald-400 transition-all active:scale-90';
                } else {
                    btn.className = 'zoom-btn w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white text-xs font-black backdrop-blur-md border border-white/20 transition-all active:scale-90';
                }
            });
        }
    } catch(e) {
        console.warn("Lỗi chỉnh zoom camera:", e);
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
            icon.className = state.isTorchOn ? 'fa-solid fa-bolt text-amber-400' : 'fa-solid fa-bolt text-white';
        }
        if (btn) {
            btn.className = state.isTorchOn 
                ? 'w-8 h-8 rounded-full bg-amber-500/80 text-black flex items-center justify-center text-xs backdrop-blur-md shadow-md transition-all active:scale-95 cursor-pointer'
                : 'w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-xs backdrop-blur-md shadow-md transition-all active:scale-95 cursor-pointer';
        }
    } catch(e) {
        console.warn("Lỗi bật đèn pin:", e);
    }
};

window.captureCameraFrame = async () => {
    const video = document.getElementById('cameraVideo');
    if (!video || !state.currentCameraStream) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
            Swal.showLoading();
            await processSingleSheet(blob);
            Swal.close();
        } catch(err) {
            Swal.close();
            Swal.fire({
                icon: 'warning',
                title: 'Chưa căn chỉnh đúng phiếu',
                text: err.message || 'Hãy đảm bảo 4 mốc đen góc phiếu nằm rõ trong khung hình và đủ ánh sáng!',
                timer: 2800
            });
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
                    <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${state.exam?.id === e.id ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                        ${state.exam?.id === e.id ? 'Đang chọn' : 'Bài thi'}
                    </span>
                    <span class="text-[10px] text-slate-400 font-mono">${new Date(e.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
                <h4 class="font-extrabold text-base text-slate-800 dark:text-white leading-tight">${e.name}</h4>
                <div class="text-xs text-slate-500 space-y-0.5">
                    <div>Mẫu phiếu: <b>${e.sheet_template}</b></div>
                    <div>Mã đề: <b>${(e.codes || []).join(', ')}</b></div>
                    <div>Cấu trúc: <b>${e.question_count} TN · ${e.part2_count} Đ/S · ${e.part3_count} TLN</b></div>
                </div>
            </div>

            <div class="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button type="button" onclick="window.selectExamAndSwitch('${e.id}')" class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs">
                    Chọn bài này
                </button>
                <button type="button" onclick="window.deleteExam('${e.id}')" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition-colors" title="Xóa bài thi này">
                    <i class="fa-solid fa-trash"></i>
                </button>
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
