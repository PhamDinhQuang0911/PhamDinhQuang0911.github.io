import { 
    initializeApp, getAuth, onAuthStateChanged, signOut,
    getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, deleteDoc,
    limit, orderBy, includeQuestions, getOrCreateParentWatchToken,
    enableMultiTabIndexedDbPersistence
} from "./supabase-db-compat.js?v=26";

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
    omrClasses: [],
    activeOmrClassId: null,
    submissions: [],
    activeTab: 'scan',
    currentCameraStream: null,
    currentFacingMode: 'environment',
    lastSubmission: null,
    isProcessing: false,
    failedBatchFiles: []
};

const state = window.omrState;

// Preload local OMR classes from storage immediately
try {
    loadLocalOmrClasses();
} catch(e) {}

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

function preloadBrandLogo(url) {
    if (!url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        try {
            const testC = document.createElement('canvas');
            testC.width = 2; testC.height = 2;
            testC.getContext('2d').drawImage(img, 0, 0, 2, 2);
            testC.toDataURL();
            state.brandLogoElement = img;
        } catch (err) {
            if (url !== './apple-touch-icon.png') {
                preloadBrandLogo('./apple-touch-icon.png');
            }
        }
    };
    img.onerror = () => {
        if (url !== './apple-touch-icon.png') {
            preloadBrandLogo('./apple-touch-icon.png');
        }
    };
    img.src = url;
}

async function ensureBrandLogoReady() {
    if (state.brandLogoElement && state.brandLogoElement.complete && state.brandLogoElement.naturalWidth > 0) {
        return state.brandLogoElement;
    }
    const domLogo = document.getElementById('omrBrandLogoImg') || document.querySelector('.global-logo-img');
    if (domLogo && domLogo.complete && domLogo.naturalWidth > 0) {
        try {
            const testC = document.createElement('canvas');
            testC.width = 2; testC.height = 2;
            testC.getContext('2d').drawImage(domLogo, 0, 0, 2, 2);
            testC.toDataURL();
            state.brandLogoElement = domLogo;
            return domLogo;
        } catch (_) {}
    }
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            state.brandLogoElement = img;
            resolve(img);
        };
        img.onerror = () => resolve(null);
        img.src = './apple-touch-icon.png';
    });
}

// Preload default Thầy Choang logo immediately
preloadBrandLogo('./apple-touch-icon.png');

function initTeacherUI() {
    const nameEl = document.getElementById('userDisplayName');
    const avatarEl = document.getElementById('userAvatar');
    const name = state.user.displayName || state.user.name || state.user.email || 'Giáo viên';
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) {
        const initial = name.trim().charAt(0).toUpperCase() || 'G';
        avatarEl.textContent = initial;
    }

    // Cập nhật trạng thái lưu trữ Telegram và chế độ xem phiếu bài chấm
    if (typeof updateTelegramStatusIndicator === 'function') updateTelegramStatusIndicator();
    if (typeof window.setSheetViewMode === 'function') window.setSheetViewMode(currentSheetViewMode);

    // Đồng bộ Logo Thầy Choang từ cài đặt giao diện qmath.io.vn (site_settings/homepage_hero)
    getDoc(doc(db, "site_settings", "homepage_hero")).then(snap => {
        if (snap && snap.exists()) {
            const d = snap.data();
            if (d && d.logo) {
                document.querySelectorAll('.global-logo-img').forEach(el => {
                    el.src = d.logo;
                });
                preloadBrandLogo(d.logo);
            }
        }
    }).catch(e => console.warn("Không tải được logo từ site_settings, dùng logo mặc định:", e));
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

window.toggleOmrSidebar = () => {
    const sb = document.getElementById('mainSidebar');
    const ov = document.getElementById('omrSidebarOverlay');
    if (!sb) return;
    const isOpen = sb.classList.contains('omr-sidebar-open');
    if (!isOpen) {
        sb.classList.add('omr-sidebar-open');
        sb.classList.remove('-translate-x-full');
        if (ov) ov.classList.remove('hidden');
    } else {
        sb.classList.remove('omr-sidebar-open');
        sb.classList.add('-translate-x-full');
        if (ov) ov.classList.add('hidden');
    }
};

window.closeOmrSidebar = () => {
    const sb = document.getElementById('mainSidebar');
    const ov = document.getElementById('omrSidebarOverlay');
    if (sb) {
        sb.classList.remove('omr-sidebar-open');
        sb.classList.add('-translate-x-full');
    }
    if (ov) ov.classList.add('hidden');
};

const TAB_SUBTITLES = {
    scan: 'Chấm bài (Cam / Ảnh)',
    results: 'Bảng điểm & Báo PHHS',
    overview: 'Thống kê & Phổ điểm',
    keys: 'Đáp án & Thang điểm',
    students: 'Danh sách Lớp & SBD',
    exams: 'Danh sách Đề thi',
    downloads: 'Mẫu Phiếu In A4 (PDF)'
};

window.switchTab = (tabName, pushHistory = true) => {
    state.activeTab = tabName;
    if (pushHistory && tabName !== 'scan') {
        if (!window.history.state || window.history.state.tab !== tabName) {
            try { window.history.pushState({ tab: tabName }, ''); } catch (_) {}
        }
    }

    ['overview', 'scan', 'results', 'keys', 'students', 'downloads', 'exams'].forEach(t => {
        const v = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if (v) v.classList.toggle('hidden', t !== tabName);
        if (btn) {
            if (t === tabName) {
                btn.className = "tab-btn active-omr-tab w-full px-2.5 py-2 rounded-xl font-bold text-xs flex items-center justify-between transition-all cursor-pointer";
            } else {
                btn.className = "tab-btn w-full px-2.5 py-2 rounded-xl font-bold text-xs flex items-center justify-between text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#262335] transition-all cursor-pointer";
            }
        }
    });

    const subEl = document.getElementById('mobileCurrentTabSubtitle');
    if (subEl && TAB_SUBTITLES[tabName]) {
        subEl.textContent = TAB_SUBTITLES[tabName];
    }

    if (tabName !== 'scan') {
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
// MOBILE NAVIGATION & GESTURE BACK (Vuốt viền / nút Back không thoát ra Dashboard)
// ========================================================
if (!window.history.state) {
    try { window.history.replaceState({ tab: 'scan' }, ''); } catch (_) {}
}

window.addEventListener('popstate', (e) => {
    // 1. Nếu đang mở modal nào đó thì chỉ đóng modal đó
    const openModals = Array.from(document.querySelectorAll('.fixed:not(.hidden)'))
        .filter(el => el.id && (el.id.endsWith('Modal') || el.id === 'lmsExamPickerModal'));
    if (openModals.length > 0) {
        openModals.forEach(m => {
            m.classList.add('hidden');
            if (m.id === 'scanKeyQrModal' && window.stopQrScanner) window.stopQrScanner();
        });
        return;
    }

    // 2. Nếu đang mở camera scanner
    const cameraOverlay = document.getElementById('cameraScannerOverlay');
    if (cameraOverlay && !cameraOverlay.classList.contains('hidden')) {
        window.closeCameraScanner();
        return;
    }

    // 3. Nếu đang xem chi tiết 1 bài chấm (#lastResultCard đang mở)
    const lastCard = document.getElementById('lastResultCard');
    if (lastCard && !lastCard.classList.contains('hidden')) {
        window.closeSubmissionDetail(true);
        return;
    }

    // 4. Nếu đang ở tab khác 'scan', quay lại tab 'scan'
    if (state.activeTab && state.activeTab !== 'scan') {
        window.switchTab('scan', false);
        return;
    }
});

// ========================================================
// 3. EXAMS & DATA MANAGEMENT (Firestore + LocalStorage + LMS Integration)
// ========================================================
state.lmsExams = [];
state.lmsClasses = [];

function extractKeysFromQuestionArray(qList) {
    const mcQuestions = qList.filter(q => q && (q.type === 'mc' || !q.type));
    const p1Ans = mcQuestions.map(q => {
        if (typeof q.correct === 'number' && q.correct >= 0 && q.correct <= 3) {
            return ['A', 'B', 'C', 'D'][q.correct];
        }
        if (typeof q.correct === 'string' && q.correct.trim() !== '') {
            const c = q.correct.trim().toUpperCase();
            if (['0', '1', '2', '3'].includes(c)) return ['A', 'B', 'C', 'D'][Number(c)];
            if (['A', 'B', 'C', 'D'].includes(c[0])) return c[0];
        }
        if (q.ans !== undefined && q.ans !== null && String(q.ans).trim() !== '') {
            const a = String(q.ans).trim().toUpperCase();
            if (['0', '1', '2', '3'].includes(a)) return ['A', 'B', 'C', 'D'][Number(a)];
            if (['A', 'B', 'C', 'D'].includes(a[0])) return a[0];
        }
        if (Array.isArray(q.options)) {
            const corrIdx = q.options.findIndex(o => o && (o.isCorrect || o.correct));
            if (corrIdx !== -1) return ['A', 'B', 'C', 'D'][corrIdx] || 'A';
        }
        return 'A';
    }).join('');

    const tfQuestions = qList.filter(q => q && q.type === 'tf');
    const p2Ans = tfQuestions.map(q => {
        if (Array.isArray(q.statements) && q.statements.length > 0) {
            return q.statements.slice(0, 4).map(s => {
                if (!s) return 'S';
                const v = s.isTrue !== undefined ? s.isTrue : (s.correct !== undefined ? s.correct : s.ans);
                return (v === true || v === 'true' || v === 1 || v === 'Đ' || v === 'D') ? 'Đ' : 'S';
            }).join('').padEnd(4, 'S');
        }
        if (Array.isArray(q.answers) && q.answers.length > 0) {
            return q.answers.slice(0, 4).map(a => (a === 'Đ' || a === 'D' || a === true || a === 'true' || a === 1) ? 'Đ' : 'S').join('').padEnd(4, 'S');
        }
        if (Array.isArray(q.options) && q.options.length > 0) {
            return q.options.slice(0, 4).map(opt => (opt && (opt.isCorrect || opt.correct || opt.isTrue)) ? 'Đ' : 'S').join('').padEnd(4, 'S');
        }
        return 'ĐSĐS';
    });

    const shortQuestions = qList.filter(q => q && q.type === 'short');
    const p3Ans = shortQuestions.map(q => {
        const rawVal = q.answer !== undefined ? q.answer : (q.ans !== undefined ? q.ans : (q.correct !== undefined ? q.correct : ''));
        return String(rawVal ?? '').trim();
    });

    return { p1Ans, p2Ans, p3Ans, mcCount: mcQuestions.length, tfCount: tfQuestions.length, shortCount: shortQuestions.length };
}

function computeOmrExam4DigitCode(id) {
    const str = String(id || '1010');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    const num = (Math.abs(hash) % 8999) + 1001; // 1001..9999 (4 chữ số cố định theo ID đề)
    return String(num);
}
window.computeOmrExam4DigitCode = computeOmrExam4DigitCode;

function normalizeLmsExam(raw) {
    const qList = Array.isArray(raw.questions) ? raw.questions : [];
    const mcCount = qList.filter(q => q && (q.type === 'mc' || !q.type)).length;
    const tfCount = qList.filter(q => q && q.type === 'tf').length;
    const shortCount = qList.filter(q => q && q.type === 'short').length;

    const omrCode = String(raw.omrCode || raw.examCode || computeOmrExam4DigitCode(raw.id)).trim();
    let codes = [omrCode];
    if (Array.isArray(raw.codes) && raw.codes.length > 0) {
        codes = raw.codes.map(c => String(c).trim()).filter(Boolean);
    } else if (raw.mixedExams && typeof raw.mixedExams === 'object' && Object.keys(raw.mixedExams).length > 0) {
        codes = Object.keys(raw.mixedExams);
    }
    if (!codes.includes(omrCode)) codes.unshift(omrCode);
    if (!codes.includes('101')) codes.push('101');

    return {
        id: raw.id,
        teacherId: raw.teacherId || raw.authorId || state.teacherUid,
        name: raw.title || raw.name || 'Đề thi LMS',
        subject: raw.subject || 'Toán học',
        sheet_template: raw.sheet_template || 'qmcv1239',
        question_count: mcCount > 0 ? mcCount : (raw.question_count || 12),
        part2_count: tfCount > 0 ? tfCount : (raw.part2_count || 4),
        part3_count: shortCount > 0 ? shortCount : (raw.part3_count || 6),
        part1_point: raw.part1_point || 0.25,
        part2_points: raw.part2_points || [0.1, 0.25, 0.5, 1.0],
        part3_point: raw.part3_point || 0.5,
        omrCode,
        codes,
        questions: qList,
        mixedExams: raw.mixedExams || null,
        classId: raw.classId || (Array.isArray(raw.allowedClassIds) && raw.allowedClassIds[0]) || raw.allowedClassId || '',
        className: raw.className || '',
        allowedClassIds: Array.isArray(raw.allowedClassIds) ? raw.allowedClassIds : [],
        isLmsExam: true,
        createdAt: raw.createdAt || new Date().toISOString()
    };
}

function autoFillKeysFromLmsQuestions(ex, forceOverwrite = false) {
    if (!ex) return false;
    const hasQuestions = Array.isArray(ex.questions) && ex.questions.length > 0;
    const hasMixed = ex.mixedExams && typeof ex.mixedExams === 'object' && Object.keys(ex.mixedExams).length > 0;
    if (!hasQuestions && !hasMixed) return false;

    let updated = false;

    // 1. Nếu đề thi có nhiều mã đề trộn (mixedExams)
    if (hasMixed) {
        for (const [mCode, mData] of Object.entries(ex.mixedExams)) {
            const qArr = Array.isArray(mData) ? mData : (Array.isArray(mData?.questions) ? mData.questions : []);
            if (qArr.length > 0) {
                const { p1Ans, p2Ans, p3Ans } = extractKeysFromQuestionArray(qArr);
                if (forceOverwrite || !state.keys[mCode] || state.keys[mCode].isSample) {
                    state.keys[mCode] = {
                        id: `key_${ex.id}_${mCode}`,
                        examId: ex.id,
                        teacherId: state.teacherUid,
                        code: mCode,
                        answers: p1Ans,
                        part2: p2Ans,
                        part3: p3Ans,
                        fromLms: true,
                        updatedAt: new Date().toISOString()
                    };
                    updated = true;
                }
            }
        }
    }

    // 2. Đề gốc (questions) -> gán cho mã đề chính (và các mã đề chưa có đáp án riêng)
    if (hasQuestions) {
        const { p1Ans, p2Ans, p3Ans, mcCount, tfCount, shortCount } = extractKeysFromQuestionArray(ex.questions);
        if (mcCount > 0) ex.question_count = mcCount;
        if (tfCount > 0) ex.part2_count = tfCount;
        if (shortCount > 0) ex.part3_count = shortCount;

        const targetCodes = (Array.isArray(ex.codes) && ex.codes.length > 0) ? ex.codes : ['101'];
        targetCodes.forEach((code, idx) => {
            const existing = state.keys[code];
            const shouldWrite = forceOverwrite || !existing || existing.isSample || (idx === 0 && !existing.fromLms);
            if (shouldWrite) {
                state.keys[code] = {
                    id: `key_${ex.id}_${code}`,
                    examId: ex.id,
                    teacherId: state.teacherUid,
                    code: String(code),
                    answers: p1Ans,
                    part2: p2Ans,
                    part3: p3Ans,
                    fromLms: true,
                    updatedAt: new Date().toISOString()
                };
                updated = true;
            }
        });
    }

    if (updated) {
        localStorage.setItem(`omr_keys_${ex.id}`, JSON.stringify(Object.values(state.keys)));
    }
    return updated;
}

state.gradedCountsByExam = {};
state.memoryImages = {};

// Cấu hình Lưu trữ Kênh Telegram (8 Bot Round-Robin)
state.telegramConfig = {
    enabled: false,
    chatId: '',
    botTokens: []
};
try {
    const rawTg = localStorage.getItem('omr_telegram_storage_config') || localStorage.getItem('qmath_telegram_config');
    if (rawTg) {
        state.telegramConfig = { ...state.telegramConfig, ...JSON.parse(rawTg) };
    }
} catch (_) {}

async function loadTeacherExams() {
    await loadFolders();
    try {
        let omrLoaded = [];
        let lmsLoaded = [];
        let omrResultsRows = [];
        let omrSnapSuccess = false;
        let lmsSnapSuccess = false;

        // Tải danh sách đề đã xóa từ localStorage để chống hiện tượng "hồi sinh" đề cũ từ cache
        const localDeletedIds = new Set();
        try {
            const rawDel = JSON.parse(localStorage.getItem('omr_deleted_exam_ids') || '[]');
            if (Array.isArray(rawDel)) rawDel.forEach(id => localDeletedIds.add(String(id)));
        } catch (_) {}

        // 1. Try loading omr_exams from Firestore / Supabase virtual config
        if (state.teacherUid) {
            // Đồng bộ danh sách đề đã bị xóa từ Cloud (doc configurations an toàn, không sinh lỗi 404)
            try {
                const delDocSnap = await getDoc(doc(db, "configurations", "omr_deleted_exams_" + state.teacherUid));
                if (delDocSnap && delDocSnap.exists() && Array.isArray(delDocSnap.data()?.ids)) {
                    delDocSnap.data().ids.forEach(id => localDeletedIds.add(String(id)));
                    try {
                        localStorage.setItem('omr_deleted_exam_ids', JSON.stringify([...localDeletedIds].slice(-500)));
                    } catch (_) {}
                }
            } catch (_) {}

            // Đồng bộ cấu hình Kênh Telegram từ Cloud nếu có
            try {
                const snapTg = await getDoc(doc(db, "configurations", "telegram_storage"));
                if (snapTg && snapTg.exists()) {
                    const cloudTg = snapTg.data();
                    if (cloudTg && (cloudTg.chatId || (cloudTg.botTokens && cloudTg.botTokens.length > 0))) {
                        state.telegramConfig = { ...state.telegramConfig, ...cloudTg };
                        try {
                            localStorage.setItem('omr_telegram_storage_config', JSON.stringify(state.telegramConfig));
                            localStorage.setItem('qmath_telegram_config', JSON.stringify(state.telegramConfig));
                        } catch (_) {}
                        if (typeof updateTelegramStatusIndicator === 'function') updateTelegramStatusIndicator();
                    }
                }
            } catch (_) {}

            try {
                const qOmr = query(collection(db, "omr_exams"), where("teacherId", "==", state.teacherUid));
                const snapOmr = await getDocs(qOmr);
                omrLoaded = snapOmr.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(e => !e.isDeleted && !localDeletedIds.has(e.id));
                omrSnapSuccess = true;
            } catch(e) {
                console.warn("Firestore omr_exams failed:", e);
            }

            // 2. Try loading LMS exams collection (sorted newest first, up to 300)
            try {
                const qLms = query(collection(db, "exams"), orderBy("createdAt", "desc"), limit(300));
                const snapLms = await getDocs(qLms);
                lmsLoaded = snapLms.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(e => !e.isDeleted && (e.title || e.name) && !localDeletedIds.has(e.id));
                lmsSnapSuccess = true;
            } catch(e) {
                try {
                    const snapLms2 = await getDocs(query(collection(db, "exams"), limit(300)));
                    lmsLoaded = snapLms2.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter(ex => !ex.isDeleted && (ex.title || ex.name) && !localDeletedIds.has(ex.id));
                    lmsSnapSuccess = true;
                } catch(e2) {
                    console.warn("Firestore exams query failed:", e2);
                }
            }

            // 2.5. Load OMR results summary from Supabase results table to recover any graded exams & count submissions
            omrResultsRows = [];
        }

        // 3. Check localStorage cache for LMS exams (from dashboard.html)
        const uid = state.teacherUid || localStorage.getItem('last_active_uid') || '';
        const cachedBankExams = localStorage.getItem(`bank_exams_${uid}_own`) || localStorage.getItem(`bank_exams_${uid}_shared`);
        if (cachedBankExams) {
            try {
                const parsedCached = JSON.parse(cachedBankExams) || [];
                if (lmsSnapSuccess) {
                    // Khi đã kết nối Cloud thành công, loại bỏ các đề đã bị xóa trên thiết bị khác khỏi cache
                    const cleanCached = parsedCached.filter(ce => ce && ce.id && !ce.isDeleted && !localDeletedIds.has(ce.id) && lmsLoaded.some(l => l.id === ce.id));
                    if (cleanCached.length !== parsedCached.length) {
                        try { localStorage.setItem(`bank_exams_${uid}_own`, JSON.stringify(cleanCached)); } catch (_) {}
                    }
                } else {
                    // Chỉ thêm từ cache cục bộ khi đang offline mất mạng
                    parsedCached.forEach(ce => {
                        if (ce && !ce.isDeleted && ce.title && !localDeletedIds.has(ce.id) && !lmsLoaded.some(l => l.id === ce.id)) {
                            lmsLoaded.push(ce);
                        }
                    });
                }
            } catch(e) {}
        }

        // 4. Merge with localStorage omr_exams (đồng bộ đa thiết bị: KHÔNG hồi sinh đề đã bị xóa trên Cloud)
        const candidateKeys = new Set([
            'omr_exams_' + (state.teacherUid || 'guest'),
            'omr_exams_guest'
        ]);
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('omr_exams_')) candidateKeys.add(k);
        }
        candidateKeys.forEach(k => {
            try {
                const arr = JSON.parse(localStorage.getItem(k) || '[]');
                if (Array.isArray(arr)) {
                    if (omrSnapSuccess) {
                        // Nếu đã đồng bộ Cloud thành công: chỉ giữ lại đề còn tồn tại trên Cloud hoặc đề nháp offline cục bộ
                        const keptLocal = [];
                        arr.forEach(locEx => {
                            if (!locEx || !locEx.id) return;
                            if (locEx.isDeleted || localDeletedIds.has(locEx.id)) return;
                            if (omrLoaded.some(x => x.id === locEx.id)) {
                                keptLocal.push(locEx);
                            } else if (locEx._isLocalDraft) {
                                omrLoaded.push(locEx);
                                keptLocal.push(locEx);
                            }
                        });
                        localStorage.setItem(k, JSON.stringify(keptLocal));
                    } else {
                        // Khi đang offline mất mạng: nạp từ cache cục bộ nhưng bỏ qua các đề đã nằm trong danh sách đã xóa
                        arr.forEach(locEx => {
                            if (locEx && locEx.id && !locEx.isLmsExam && !locEx.isDeleted && !localDeletedIds.has(locEx.id) && !omrLoaded.some(x => x.id === locEx.id)) {
                                omrLoaded.push(locEx);
                            }
                        });
                    }
                }
            } catch(e) {}
        });

        // Normalize LMS exams
        state.lmsExams = lmsLoaded.map(e => normalizeLmsExam(e));

        // Combined list: OMR exams + LMS exams (deduplicated by id)
        const seenIds = new Set();
        let combined = [];
        [...omrLoaded, ...state.lmsExams].forEach(ex => {
            if (ex && ex.id && !seenIds.has(ex.id)) {
                seenIds.add(ex.id);
                combined.push(ex);
            }
        });

        // 5. Reconstruct any exam that has graded OMR submissions in Supabase results or localStorage
        state.gradedCountsByExam = {};
        omrResultsRows.forEach(r => {
            const exId = r.examId || r.exam_id;
            if (!exId) return;
            state.gradedCountsByExam[exId] = (state.gradedCountsByExam[exId] || 0) + 1;
            if (!seenIds.has(exId)) {
                seenIds.add(exId);
                const recoveredExam = {
                    id: exId,
                    teacherId: r.teacherId || state.teacherUid,
                    name: r.examTitle || r.exam_title || 'Đề kiểm tra OMR',
                    subject: 'Toán học',
                    sheet_template: 'qmcv1239',
                    question_count: 12,
                    part2_count: 4,
                    part3_count: 6,
                    part1_point: p1Point,
        part2_points: [0.1, 0.25, 0.5, 1.0],
        part3_point: p3Point,
        folderId: folderId,
                    codes: [r.examCode || '0101', '101', '102'],
                    classId: r.classId || '',
                    className: r.className || '',
                    createdAt: r.submittedAt || new Date().toISOString()
                };
                combined.unshift(recoveredExam);
            }
        });

        // Also check localStorage omr_submissions_* counts
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('omr_submissions_')) {
                const exId = k.slice('omr_submissions_'.length);
                try {
                    const subs = JSON.parse(localStorage.getItem(k) || '[]');
                    if (Array.isArray(subs) && subs.length > 0) {
                        state.gradedCountsByExam[exId] = Math.max(state.gradedCountsByExam[exId] || 0, subs.length);
                    }
                } catch(e) {}
            }
        }

        // Seed Sample Exam if none exists
        if (combined.length === 0) {
            const sampleExam = createSampleExamObj();
            combined = [sampleExam];
            saveLocalExams([sampleExam]);
        } else {
            saveLocalExams(combined);
        }

        state.exams = combined;

        // Ưu tiên kiểm tra tham số URL (?examId=...&classId=...) khi mở trực tiếp từ Lớp học hoặc Kho đề LMS
        const urlParams = new URLSearchParams(window.location.search);
        const urlExamId = (urlParams.get('examId') || '').trim();
        const urlClassId = (urlParams.get('classId') || '').trim();
        if (urlExamId) {
            await window.selectLmsExamForGrading(urlExamId, urlClassId);
            return;
        }

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
            isSample: true,
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
            isSample: true,
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
    try {
        const localKey = 'omr_exams_' + (state.teacherUid || 'guest');
        // Chỉ lưu các đề tạo thêm trên OMR (không lưu hàng trăm đề LMS vào localStorage gây tràn bộ nhớ)
        const customExamsOnly = (exams || []).filter(e => e && !e.isLmsExam);
        localStorage.setItem(localKey, JSON.stringify(customExamsOnly));
    } catch(e) {
        console.warn("Lưu omr_exams localStorage:", e);
    }
}

window.changeActiveExamTemplate = async (newTpl) => {
    if (!state.exam || !newTpl) return;
    state.exam.sheet_template = newTpl;

    // Lưu cấu hình mẫu phiếu & lớp học cho đề này
    try {
        localStorage.setItem(`omr_exam_class_${state.exam.id}`, JSON.stringify({
            classId: state.exam.classId || '',
            className: state.exam.className || '',
            sheet_template: newTpl
        }));
    } catch(e) {}

    if (!state.exam.isLmsExam) {
        saveLocalExams(state.exams);
        if (state.teacherUid) {
            try { await setDoc(doc(db, "omr_exams", state.exam.id), state.exam, { merge: true }); } catch(e) {}
        }
    }

    updateActiveExamBanner();
    const tplName = (window.MAU && window.MAU[newTpl]) ? window.MAU[newTpl].ten : newTpl;
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `Đã chọn mẫu phiếu: ${tplName}`,
        showConfirmButton: false,
        timer: 2000
    });
};

async function selectExam(examId) {
    let exam = state.exams.find(e => e.id === examId);
    if (!exam) return;

    // Nếu là đề thi LMS mà chưa tải chi tiết mảng questions (do list query rút gọn cột), tải ngay bằng getDoc
    if (exam.isLmsExam && (!Array.isArray(exam.questions) || exam.questions.length === 0)) {
        try {
            const fullDoc = await getDoc(doc(db, "exams", exam.id));
            if (fullDoc.exists()) {
                const fullData = { id: fullDoc.id, ...fullDoc.data() };
                const normalized = normalizeLmsExam({
                    ...fullData,
                    sheet_template: exam.sheet_template || fullData.sheet_template || 'qmcv1239',
                    classId: exam.classId || fullData.classId || '',
                    className: exam.className || fullData.className || ''
                });
                Object.assign(exam, normalized);
            }
        } catch(e) {
            console.warn("Không tải được chi tiết câu hỏi đề LMS:", e);
        }
    }

    // Khôi phục thông tin lớp học & loại phiếu đã gán cho đề thi này (nếu có)
    const savedClassMeta = localStorage.getItem(`omr_exam_class_${exam.id}`);
    if (savedClassMeta) {
        try {
            const parsedMeta = JSON.parse(savedClassMeta);
            if (parsedMeta.classId) exam.classId = parsedMeta.classId;
            if (parsedMeta.className) exam.className = parsedMeta.className;
            if (parsedMeta.sheet_template) exam.sheet_template = parsedMeta.sheet_template;
        } catch(e) {}
    }

    state.exam = exam;
    localStorage.setItem('omr_last_exam_id_' + state.teacherUid, exam.id);

    // Nạp NGAY LẬP TỨC 0ms danh sách bài chấm từ localStorage để UI hiển thị tức thì, không giật lag
    try {
        const cachedSubs = JSON.parse(localStorage.getItem(`omr_submissions_${exam.id}`) || '[]');
        if (Array.isArray(cachedSubs) && cachedSubs.length > 0) {
            state.submissions = cachedSubs;
            if (state.gradedCountsByExam) state.gradedCountsByExam[exam.id] = cachedSubs.length;
        } else {
            state.submissions = [];
        }
    } catch(_) {
        state.submissions = [];
    }

    // Hiển thị banner và vẽ danh sách bài chấm tức thì
    updateActiveExamBanner();
    syncSubmissionClassFilterOptions();
    renderInlineSubmissionsList();
    if (state.activeTab === 'results') window.renderResultsTable();
    updateOverviewStats();

    // Tải song song Keys, Students và Submissions Cloud ngầm (không chờ tuần tự từng mạng)
    await Promise.allSettled([
        loadExamKeys(exam.id),
        loadExamStudents(exam.id),
        loadExamSubmissions(exam.id)
    ]);

    // Đối chiếu và điền tên thí sinh, lớp học theo SBD từ danh bạ lớp OMR
    enrichSubmissionsFromClassRoster();

    // Nếu là đề LMS có câu hỏi, tự động trích xuất đáp án chuẩn từ đề LMS
    if (exam.isLmsExam && ((exam.questions && exam.questions.length > 0) || exam.mixedExams)) {
        autoFillKeysFromLmsQuestions(exam, false);
    }

    updateOverviewStats();
    if (state.activeTab === 'keys') window.renderKeysTab();
    if (state.activeTab === 'students') window.renderStudentsTab();
    if (state.activeTab === 'results') window.renderResultsTable();
    renderInlineSubmissionsList();
}

function updateActiveExamBanner() {
    const exam = state.exam;
    if (!exam) return;
    const titleEl = document.getElementById('activeExamName');
    const badgeEl = document.getElementById('activeExamTemplateBadge');
    const classBadgeEl = document.getElementById('activeExamClassBadge');
    const sidebarTitleEl = document.getElementById('sidebarActiveExamTitle');
    const sidebarMetaEl = document.getElementById('sidebarActiveExamMeta');
    const mobileTitleEl = document.getElementById('mobileActiveExamName');
    const activeTplSelect = document.getElementById('activeExamTemplateSelect');
    const pickerTplSelect = document.getElementById('lmsPickerTemplateSelect');

    const tplKey = exam.sheet_template || 'qmcv1239';
    if (activeTplSelect) activeTplSelect.value = tplKey;
    if (pickerTplSelect) pickerTplSelect.value = tplKey;

    const displayTitle = exam.name;
    const omr4Code = exam.omrCode || computeOmrExam4DigitCode(exam.id);
    const structSummary = `Mã OMR: ${omr4Code} · ${exam.question_count || 12} TN · ${exam.part2_count || 4} Đ/S · ${exam.part3_count || 6} TLN`;

    let classLabel = exam.className ? String(exam.className).trim() : '';
    if (classLabel) {
        if (!classLabel.toLowerCase().startsWith('lớp')) {
            classLabel = 'Lớp ' + classLabel;
        }
    }

    if (titleEl) {
        titleEl.textContent = displayTitle;
        titleEl.title = displayTitle;
    }
    if (sidebarTitleEl) {
        sidebarTitleEl.textContent = displayTitle;
        sidebarTitleEl.title = displayTitle;
    }
    if (mobileTitleEl) {
        mobileTitleEl.textContent = displayTitle + (classLabel ? ` · ${classLabel}` : '');
        mobileTitleEl.title = displayTitle;
    }
    if (sidebarMetaEl) {
        sidebarMetaEl.textContent = `${structSummary}${classLabel ? ` · ${classLabel}` : ''}`;
    }

    if (badgeEl) {
        const tplName = (window.MAU && window.MAU[tplKey]) ? window.MAU[tplKey].ten : tplKey;
        badgeEl.textContent = `${exam.question_count || 12} TN · ${exam.part2_count || 4} Đ/S · ${exam.part3_count || 6} TLN`;
        badgeEl.title = `Mã OMR: ${omr4Code} · Mẫu: ${tplName || 'CV 1239'}`;
        badgeEl.classList.remove('hidden');
    }
    if (classBadgeEl) {
        if (exam.className) {
            classBadgeEl.textContent = `Lớp: ${exam.className}`;
            classBadgeEl.classList.remove('hidden');
        } else {
            classBadgeEl.classList.add('hidden');
        }
    }
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
    // Tự động gộp tất cả mã đề đã lưu vào danh sách mã đề của bài thi
    if (state.exam && keys.length > 0) {
        const keyCodes = keys.map(k => String(k.code));
        state.exam.codes = Array.from(new Set([...(state.exam.codes || []).map(String), ...keyCodes])).sort();
    }
}

async function loadExamStudents(examId) {
    let list = [];
    try {
        const qSnap = await getDocs(query(collection(db, "omr_students"), where("examId", "==", examId)));
        list = qSnap.docs.map(d => d.data());
    } catch(e) {}
    if (list.length === 0) {
        const local = JSON.parse(localStorage.getItem(`omr_students_${examId}`) || '[]');
        if (local.length > 0) {
            list = local;
        } else {
            // Kiểm tra lớp OMR được gán cho đề thi hoặc lớp OMR đang active
            const linkedClassId = state.exam?.classId;
            const allClasses = Array.isArray(state.omrClasses) ? state.omrClasses : [];
            const linkedCls = allClasses.find(c => c.id === linkedClassId) || (typeof getActiveOmrClass === 'function' ? getActiveOmrClass() : null);
            if (linkedCls && Array.isArray(linkedCls.students) && linkedCls.students.length > 0) {
                list = linkedCls.students.map(st => ({
                    id: `st_${examId}_${st.student_no}`,
                    examId: examId,
                    teacherId: state.teacherUid,
                    student_no: st.student_no,
                    name: st.name,
                    phone: st.phone || '',
                    note: st.note || '',
                    class_id: linkedCls.id,
                    class_name: linkedCls.name
                }));
            } else {
                list = createSampleStudents(examId);
            }
        }
    }
    state.students = list;
}

// ========================================================
// PERSISTENT INDEXEDDB IMAGE STORAGE (Hàng trăm MB, không bao giờ mất ảnh)
// ========================================================
const OMR_DB_NAME = 'QMath_OMR_Storage';
const OMR_DB_VERSION = 1;
const OMR_STORE_IMAGES = 'sheet_images';

let cachedOmrDb = null;
function openOmrIndexedDb() {
    if (cachedOmrDb) return Promise.resolve(cachedOmrDb);
    return new Promise((resolve) => {
        if (!window.indexedDB) return resolve(null);
        try {
            const req = indexedDB.open(OMR_DB_NAME, OMR_DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(OMR_STORE_IMAGES)) {
                    db.createObjectStore(OMR_STORE_IMAGES);
                }
            };
            req.onsuccess = () => {
                cachedOmrDb = req.result;
                cachedOmrDb.onclose = () => { cachedOmrDb = null; };
                cachedOmrDb.onversionchange = () => {
                    try { cachedOmrDb.close(); } catch(_) {}
                    cachedOmrDb = null;
                };
                resolve(cachedOmrDb);
            };
            req.onerror = () => resolve(null);
        } catch (_) {
            resolve(null);
        }
    });
}

async function saveOmrImageToDb(key, dataUrl) {
    if (!key || !dataUrl) return;
    try {
        const db = await openOmrIndexedDb();
        if (!db) return;
        const tx = db.transaction(OMR_STORE_IMAGES, 'readwrite');
        tx.objectStore(OMR_STORE_IMAGES).put(dataUrl, String(key));
    } catch (_) {}
}

async function getOmrImageFromDb(key) {
    if (!key) return null;
    try {
        const db = await openOmrIndexedDb();
        if (!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction(OMR_STORE_IMAGES, 'readonly');
            const req = tx.objectStore(OMR_STORE_IMAGES).get(String(key));
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (_) {
        return null;
    }
}

async function deleteOmrImageFromDb(key) {
    if (!key) return;
    try {
        const db = await openOmrIndexedDb();
        if (!db) return;
        const tx = db.transaction(OMR_STORE_IMAGES, 'readwrite');
        tx.objectStore(OMR_STORE_IMAGES).delete(String(key));
    } catch (_) {}
}

// ========================================================
// HỆ THỐNG LƯU TRỮ KÊNH TELEGRAM (8 BOT ROUND-ROBIN CLOUD BACKUP)
// ========================================================
let tgBotRoundRobinIndex = 0;

function getNextTelegramBotToken() {
    const tokens = (state.telegramConfig?.botTokens || []).map(t => String(t || '').trim()).filter(Boolean);
    if (tokens.length === 0) return null;
    const token = tokens[tgBotRoundRobinIndex % tokens.length];
    tgBotRoundRobinIndex = (tgBotRoundRobinIndex + 1) % tokens.length;
    return token;
}

function updateTelegramStatusIndicator() {
    const el = document.getElementById('tgActiveIndicator');
    if (!el) return;
    const isEnabled = Boolean(state.telegramConfig?.enabled && (state.telegramConfig?.botTokens || []).length > 0 && state.telegramConfig?.chatId);
    if (isEnabled) {
        const botCount = (state.telegramConfig.botTokens || []).length;
        el.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
        el.title = `Đang bật lưu Telegram (${botCount} bot)`;
    } else {
        el.className = 'w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600';
        el.title = 'Chưa bật lưu Telegram';
    }
}
window.updateTelegramStatusIndicator = updateTelegramStatusIndicator;

window.openTelegramConfigModal = function() {
    const modal = document.getElementById('telegramConfigModal');
    if (!modal) return;
    const chk = document.getElementById('tgConfigEnabled');
    const txtChat = document.getElementById('tgConfigChatId');
    const txtTokens = document.getElementById('tgConfigTokens');
    const modeAlbum = document.getElementById('tgModeAlbum');
    const modeSingle = document.getElementById('tgModeSingle');

    if (chk) chk.checked = Boolean(state.telegramConfig?.enabled);
    if (txtChat) txtChat.value = state.telegramConfig?.chatId || '';
    if (txtTokens) txtTokens.value = (state.telegramConfig?.botTokens || []).join('\n');
    if (state.telegramConfig?.sendMode === 'media_group') {
        if (modeAlbum) modeAlbum.checked = true;
    } else {
        if (modeSingle) modeSingle.checked = true;
    }

    window.updateTgBotCountBadge();
    modal.classList.remove('hidden');
};

window.closeTelegramConfigModal = function() {
    document.getElementById('telegramConfigModal')?.classList.add('hidden');
};

window.updateTgBotCountBadge = function() {
    const txt = document.getElementById('tgConfigTokens')?.value || '';
    const tokens = txt.split('\n').map(t => t.trim()).filter(Boolean);
    const badge = document.getElementById('tgBotCountBadge');
    if (badge) {
        badge.textContent = `${tokens.length} bot`;
        badge.className = tokens.length > 0
            ? 'text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold'
            : 'text-[10px] font-mono text-slate-400 font-bold';
    }
};

window.saveTelegramConfig = function() {
    const chk = document.getElementById('tgConfigEnabled');
    const txtChat = document.getElementById('tgConfigChatId');
    const txtTokens = document.getElementById('tgConfigTokens');
    const isAlbum = document.getElementById('tgModeAlbum')?.checked;

    const enabled = Boolean(chk?.checked);
    const chatId = (txtChat?.value || '').trim();
    const rawTokens = (txtTokens?.value || '').split('\n').map(t => t.trim()).filter(Boolean);

    if (enabled && (!chatId || rawTokens.length === 0)) {
        Swal.fire('Thiếu thông tin', 'Vui lòng nhập Chat/Channel ID và ít nhất 1 mã Bot Token trước khi bật tính năng!', 'warning');
        return;
    }

    state.telegramConfig = {
        enabled,
        chatId,
        botTokens: rawTokens,
        sendMode: isAlbum ? 'media_group' : 'parallel_single'
    };

    try {
        localStorage.setItem('omr_telegram_storage_config', JSON.stringify(state.telegramConfig));
        localStorage.setItem('qmath_telegram_config', JSON.stringify(state.telegramConfig));
    } catch (e) {
        console.warn("Không thể lưu cấu hình Telegram vào localStorage:", e);
    }

    updateTelegramStatusIndicator();
    window.closeTelegramConfigModal();

    Swal.fire({
        icon: 'success',
        title: 'Đã lưu cấu hình Telegram!',
        text: enabled
            ? `Hệ thống đã sẵn sàng với ${rawTokens.length} bot nén ảnh thông minh (~75KB) và tải lên siêu tốc!`
            : 'Đã tắt tính năng tự động lưu ảnh lên Telegram.',
        timer: 2000,
        showConfirmButton: false
    });
};

function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binary = atob(parts[1]);
    const len = binary.length;
    const buffer = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        buffer[i] = binary.charCodeAt(i);
    }
    return new Blob([buffer], { type: mime });
}

// ========================================================
// HỆ THỐNG NÉN ẢNH THÔNG MINH & TẢI LÊN TELEGRAM ĐA BOT SIÊU TỐC
// ========================================================
const tgUploadQueue = [];
let tgActiveWorkers = 0;
const tgUploadStats = { total: 0, done: 0, failed: 0 };
let tgPillHideTimeout = null;

// Nén ảnh bài chấm từ ~1.5MB xuống ~75KB (giảm 95% dung lượng, giữ 100% độ sắc nét)
async function compressSheetForTelegram(dataUrl, maxWidth = 1080, quality = 0.72) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
        return dataUrl;
    }
    return new Promise((resolve) => {
        try {
            const img = new Image();
            img.onload = () => {
                try {
                    let w = img.naturalWidth || img.width;
                    let h = img.naturalHeight || img.height;
                    if (w > maxWidth) {
                        h = Math.round(h * (maxWidth / w));
                        w = maxWidth;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, w, h);
                    const compressed = canvas.toDataURL('image/jpeg', quality);
                    canvas.width = 1;
                    canvas.height = 1;
                    resolve(compressed);
                } catch (_) {
                    resolve(dataUrl);
                }
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        } catch (_) {
            resolve(dataUrl);
        }
    });
}

function updateTelegramUploadPill(isFinished = false) {
    let pill = document.getElementById('tgUploadPill');
    if (!pill) {
        pill = document.createElement('div');
        pill.id = 'tgUploadPill';
        pill.className = 'fixed bottom-5 right-5 z-40 bg-sky-600/95 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 backdrop-blur-md text-xs font-bold border border-sky-400/40 transition-all cursor-pointer select-none';
        pill.innerHTML = `
            <i id="tgUploadPillIcon" class="fa-brands fa-telegram text-base animate-bounce"></i>
            <span id="tgUploadPillText">Đang lưu Telegram: 0/0 bài...</span>
        `;
        document.body.appendChild(pill);
    }

    const iconEl = document.getElementById('tgUploadPillIcon');
    const textEl = document.getElementById('tgUploadPillText');
    if (tgPillHideTimeout) {
        clearTimeout(tgPillHideTimeout);
        tgPillHideTimeout = null;
    }

    if (isFinished) {
        pill.className = 'fixed bottom-5 right-5 z-40 bg-emerald-600/95 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 backdrop-blur-md text-xs font-bold border border-emerald-400/40 transition-all select-none';
        if (iconEl) iconEl.className = 'fa-solid fa-circle-check text-emerald-300 text-base';
        if (textEl) textEl.textContent = `Đã lưu xong toàn bộ ${tgUploadStats.done}/${tgUploadStats.total} bài lên Kênh Telegram!`;
        tgPillHideTimeout = setTimeout(() => {
            pill.classList.add('hidden');
            tgUploadStats.total = 0;
            tgUploadStats.done = 0;
            tgUploadStats.failed = 0;
        }, 3000);
        return;
    }

    pill.classList.remove('hidden');
    pill.className = 'fixed bottom-5 right-5 z-40 bg-sky-600/95 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 backdrop-blur-md text-xs font-bold border border-sky-400/40 transition-all select-none';
    if (iconEl) iconEl.className = 'fa-brands fa-telegram text-base animate-bounce';
    const activeBotCount = (state.telegramConfig?.botTokens || []).length || 1;
    if (textEl) {
        textEl.textContent = `Đang lưu Telegram: ${tgUploadStats.done}/${tgUploadStats.total} bài (${activeBotCount} bot song song)...`;
    }
}

async function sendSinglePhotoToTelegram(token, chatId, sub, compressedDataUrl) {
    const photoBlob = dataUrlToBlob(compressedDataUrl);
    const formData = new FormData();
    formData.append('chat_id', chatId);
    const sbdText = sub.student_no ? `SBD: ${sub.student_no}` : 'Chưa có SBD';
    const nameText = sub.student_name ? ` - ${sub.student_name}` : '';
    const codeText = sub.code ? ` | Mã đề: ${sub.code}` : '';
    const scoreText = (sub.score !== undefined) ? ` | Điểm: ${sub.score}đ` : '';
    const examName = state.exam?.name || 'Bài kiểm tra OMR';
    formData.append('caption', `📝 [${examName}]\n👤 ${sbdText}${nameText}${codeText}${scoreText}\n⏰ ${new Date().toLocaleString('vi-VN')}`);
    formData.append('photo', photoBlob, `omr_${sub.id || Date.now()}.jpg`);

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST',
        body: formData
    });
    const resData = await resp.json();
    if (!resData.ok) {
        throw new Error(resData.description || 'sendPhoto failed');
    }

    const photos = resData.result?.photo;
    const messageId = resData.result?.message_id;
    let directUrl = '';
    let fileId = '';
    if (photos && photos.length > 0) {
        const largestPhoto = photos[photos.length - 1];
        fileId = largestPhoto.file_id;
        try {
            const fileResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${largestPhoto.file_id}`);
            const fileData = await fileResp.json();
            if (fileData.ok && fileData.result?.file_path) {
                directUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
            }
        } catch (_) {}
    }
    return { messageId, fileId, directUrl, token };
}

async function sendMediaGroupToTelegram(token, chatId, items) {
    const formData = new FormData();
    formData.append('chat_id', chatId);
    const examName = state.exam?.name || 'Bài kiểm tra OMR';
    const mediaList = [];

    items.forEach((item, idx) => {
        const sub = item.sub;
        const attachName = `photo_${idx}`;
        const blob = dataUrlToBlob(item.compressedDataUrl);
        formData.append(attachName, blob, `omr_${sub.id || Date.now()}_${idx}.jpg`);

        const sbdText = sub.student_no ? `SBD: ${sub.student_no}` : 'Chưa có SBD';
        const nameText = sub.student_name ? ` - ${sub.student_name}` : '';
        const codeText = sub.code ? ` | Mã đề: ${sub.code}` : '';
        const scoreText = (sub.score !== undefined) ? ` | Điểm: ${sub.score}đ` : '';

        mediaList.push({
            type: 'photo',
            media: `attach://${attachName}`,
            caption: `📝 [${examName}]\n👤 ${sbdText}${nameText}${codeText}${scoreText}`
        });
    });

    formData.append('media', JSON.stringify(mediaList));

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
        method: 'POST',
        body: formData
    });
    const resData = await resp.json();
    if (!resData.ok) {
        throw new Error(resData.description || 'sendMediaGroup failed');
    }

    const results = [];
    const messages = Array.isArray(resData.result) ? resData.result : [];
    for (let i = 0; i < items.length; i++) {
        const msg = messages[i];
        const photos = msg?.photo || [];
        const largest = photos[photos.length - 1];
        const fileId = largest?.file_id || '';
        const messageId = msg?.message_id || 0;
        let directUrl = '';
        if (fileId) {
            try {
                const fileResp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
                const fileData = await fileResp.json();
                if (fileData.ok && fileData.result?.file_path) {
                    directUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
                }
            } catch (_) {}
        }
        results.push({ messageId, fileId, directUrl, token });
    }
    return results;
}

function applyTelegramUploadResult(sub, res, token) {
    if (!sub || !res) return;
    const directUrl = res.directUrl || '';
    const fileId = res.fileId || '';
    const messageId = res.messageId || 0;

    sub.telegram_photo_url = directUrl;
    sub.telegram_file_id = fileId;
    sub.telegram_msg_id = messageId;
    sub.telegram_bot_token = token;

    const idx = (state.submissions || []).findIndex(s => s.id === sub.id);
    if (idx !== -1) {
        state.submissions[idx].telegram_photo_url = directUrl;
        state.submissions[idx].telegram_file_id = fileId;
        state.submissions[idx].telegram_msg_id = messageId;
        state.submissions[idx].telegram_bot_token = token;
    }

    if (state.teacherUid && typeof db !== 'undefined') {
        const subIdSafe = (sub.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
        updateDoc(doc(db, "results", `omr_${sub.examId || state.exam?.id}_${subIdSafe}`), {
            telegramPhotoUrl: directUrl,
            telegramFileId: fileId,
            telegramMsgId: messageId
        }).catch(() => {});
    }
}

async function runTgUploadWorker() {
    const tokens = (state.telegramConfig?.botTokens || []).map(t => String(t || '').trim()).filter(Boolean);
    const chatId = state.telegramConfig?.chatId;
    const sendMode = state.telegramConfig?.sendMode || 'parallel_single';

    while (tgUploadQueue.length > 0 && state.telegramConfig?.enabled && tokens.length > 0 && chatId) {
        if (sendMode === 'media_group' && tgUploadQueue.length >= 2) {
            const batchSize = Math.min(tgUploadQueue.length, 5);
            const batchItems = tgUploadQueue.splice(0, batchSize);
            const token = getNextTelegramBotToken();
            try {
                const results = await sendMediaGroupToTelegram(token, chatId, batchItems);
                batchItems.forEach((item, i) => {
                    const res = results[i] || {};
                    applyTelegramUploadResult(item.sub, res, token);
                    tgUploadStats.done++;
                });
            } catch (err) {
                console.warn("sendMediaGroup thất bại, gửi lẻ từng bài:", err);
                for (const item of batchItems) {
                    try {
                        const tokenSingle = getNextTelegramBotToken();
                        const res = await sendSinglePhotoToTelegram(tokenSingle, chatId, item.sub, item.compressedDataUrl);
                        applyTelegramUploadResult(item.sub, res, tokenSingle);
                        tgUploadStats.done++;
                    } catch (_) {
                        tgUploadStats.failed++;
                    }
                }
            }
            updateTelegramUploadPill(tgUploadQueue.length === 0);
            continue;
        }

        const item = tgUploadQueue.shift();
        if (!item) break;
        const token = getNextTelegramBotToken();
        try {
            const res = await sendSinglePhotoToTelegram(token, chatId, item.sub, item.compressedDataUrl);
            applyTelegramUploadResult(item.sub, res, token);
            tgUploadStats.done++;
        } catch (err) {
            console.warn("Lỗi tải bài lên Telegram:", err);
            tgUploadStats.failed++;
        }
        updateTelegramUploadPill(tgUploadQueue.length === 0);
    }

    tgActiveWorkers--;
    if (tgActiveWorkers <= 0 && tgUploadQueue.length === 0) {
        updateTelegramUploadPill(true);
        if (state.exam?.id) {
            saveSubmissionsToLocalSafe(state.exam.id, state.submissions);
        }
    }
}

async function uploadGradedSheetToTelegram(sub, imgDataUrl) {
    if (!state.telegramConfig?.enabled) return null;
    const tokens = (state.telegramConfig?.botTokens || []).map(t => String(t || '').trim()).filter(Boolean);
    if (tokens.length === 0 || !state.telegramConfig?.chatId) return null;
    if (!imgDataUrl || !imgDataUrl.startsWith('data:image')) return null;

    // Nén ảnh sang ~75KB trước khi xếp hàng
    const compressed = await compressSheetForTelegram(imgDataUrl, 1080, 0.72);

    tgUploadQueue.push({ sub, compressedDataUrl: compressed });
    tgUploadStats.total++;
    updateTelegramUploadPill(false);

    // Kích hoạt worker pool đa luồng song song theo số lượng bot
    const maxWorkers = Math.max(2, Math.min(tokens.length * 2, 8));
    while (tgActiveWorkers < maxWorkers && tgUploadQueue.length > 0) {
        tgActiveWorkers++;
        runTgUploadWorker();
    }
    return true;
}

// ========================================================
// TRUY XUẤT ẢNH TỪ TELEGRAM CLOUD CDN VỀ WEB LMS
// ========================================================
async function resolveTelegramPhotoDirectUrl(sub, forceRefresh = false) {
    if (!sub) return null;
    if (!forceRefresh && sub.telegram_photo_url && !sub.telegram_photo_url.includes('undefined')) {
        return sub.telegram_photo_url;
    }

    if (sub.telegram_file_id) {
        const tokens = (state.telegramConfig?.botTokens || []).map(t => String(t || '').trim()).filter(Boolean);
        const token = sub.telegram_bot_token || tokens[0];
        if (token) {
            try {
                const resp = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${sub.telegram_file_id}`);
                const data = await resp.json();
                if (data.ok && data.result?.file_path) {
                    const freshUrl = `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
                    sub.telegram_photo_url = freshUrl;
                    saveSubmissionsToLocalSafe(sub.examId || state.exam?.id, state.submissions);
                    return freshUrl;
                }
            } catch (e) {
                console.warn("Không làm mới được link ảnh từ Telegram:", e);
            }
        }
    }
    return sub.telegram_photo_url || null;
}

window.viewTelegramPhoto = async (subId) => {
    const sub = (state.submissions || []).find(s => s.id === subId);
    if (!sub) return;
    Swal.fire({
        title: 'Đang mở ảnh từ Telegram...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });
    const url = await resolveTelegramPhotoDirectUrl(sub, true);
    Swal.close();
    if (url) {
        window.open(url, '_blank');
    } else {
        Swal.fire('Chưa có ảnh', 'Bài thi này chưa được lưu trên Telegram hoặc bot chưa cấp quyền truy cập.', 'warning');
    }
};

window.testTelegramConnection = async function() {
    const txtChat = document.getElementById('tgConfigChatId');
    const txtTokens = document.getElementById('tgConfigTokens');

    const chatId = (txtChat?.value || '').trim();
    const rawTokens = (txtTokens?.value || '').split('\n').map(t => t.trim()).filter(Boolean);

    if (!chatId || rawTokens.length === 0) {
        Swal.fire('Thiếu thông tin', 'Vui lòng nhập ID Kênh và ít nhất 1 mã Bot Token để kiểm tra kết nối!', 'warning');
        return;
    }

    Swal.fire({
        title: 'Đang kiểm tra kết nối Telegram...',
        html: `Đang gửi ảnh kiểm tra nén siêu nhẹ qua <b>${rawTokens.length} bot</b> song song... Vui lòng chờ vài giây!`,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const cvs = document.createElement('canvas');
        cvs.width = 600;
        cvs.height = 300;
        const ctx = cvs.getContext('2d');
        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(0, 0, 600, 300);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px sans-serif';
        ctx.fillText('🚀 QMATH LMS - OMR TEST PHOTO', 50, 100);
        ctx.font = '18px sans-serif';
        ctx.fillText(`Kiểm tra kết nối thành công: ${new Date().toLocaleString('vi-VN')}`, 50, 150);
        ctx.fillText(`Tổng số bot kiểm tra: ${rawTokens.length} bot`, 50, 190);
        const testDataUrl = cvs.toDataURL('image/jpeg', 0.85);
        const blob = dataUrlToBlob(testDataUrl);

        // Kiểm tra song song tất cả các bot để xác định rõ bot nào được cấp quyền Admin
        const checkResults = await Promise.allSettled(rawTokens.map(async (tok, idx) => {
            const fd = new FormData();
            fd.append('chat_id', chatId);
            fd.append('caption', `✅ Bot #${idx + 1} (${tok.slice(0, 8)}...) kiểm tra kết nối thành công lúc ${new Date().toLocaleTimeString('vi-VN')}!`);
            fd.append('photo', blob, `test_bot_${idx + 1}.jpg`);

            const resp = await fetch(`https://api.telegram.org/bot${tok}/sendPhoto`, {
                method: 'POST',
                body: fd
            });
            const resJson = await resp.json();
            if (!resJson.ok) {
                throw new Error(resJson.description || 'Lỗi gửi tin nhắn');
            }
            return { botIndex: idx + 1, tokenPrefix: tok.slice(0, 8), ok: true };
        }));

        const successList = checkResults.filter(r => r.status === 'fulfilled');
        const failList = checkResults.filter(r => r.status === 'rejected');

        if (failList.length === 0) {
            Swal.fire({
                icon: 'success',
                title: '🎉 Kết nối 100% thành công!',
                html: `Cả <b>${rawTokens.length} bot</b> đều gửi ảnh test thành công lên Kênh Telegram <b>${chatId}</b>!<br><br><span class="text-xs text-slate-500">Tất cả bot đều đã là Admin và sẵn sàng chia tải chấm bài siêu tốc!</span>`,
                confirmButtonText: 'Tuyệt vời',
                confirmButtonColor: '#0ea5e9'
            });
        } else if (successList.length > 0) {
            const failMsgs = failList.map((f, i) => `• Bot ${f.reason?.message?.includes('bot is not a member') ? 'chưa được thêm làm Admin' : f.reason?.message}`).join('<br>');
            Swal.fire({
                icon: 'warning',
                title: `Có ${successList.length}/${rawTokens.length} bot thành công!`,
                html: `Đã có <b>${successList.length} bot</b> kết nối tốt. Tuy nhiên có <b>${failList.length} bot</b> gặp lỗi:<br><br><div class="text-left text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl font-mono">${failMsgs}</div><br><span class="text-xs text-slate-500">Mẹo: Hãy đảm bảo bạn đã thêm <b>tất cả các Bot</b> làm Quản trị viên (Admin) của Kênh Telegram nhé!</span>`,
                confirmButtonColor: '#0ea5e9'
            });
        } else {
            const firstErr = failList[0]?.reason?.message || 'Không rõ lỗi';
            Swal.fire({
                icon: 'error',
                title: 'Tất cả các Bot đều không gửi được ảnh',
                html: `Telegram báo lỗi: <br><code class="text-rose-500 font-bold">${firstErr}</code><br><br><span class="text-xs text-slate-500">Gợi ý: Hãy đảm bảo Chat/Kênh ID <b>${chatId}</b> là chính xác và bạn đã thêm Bot vào Kênh với quyền <b>Quản trị viên (Admin - Đăng bài)</b>!</span>`
            });
        }
    } catch (err) {
        Swal.fire({
            icon: 'error',
            title: 'Lỗi mạng hoặc CORS',
            html: `Không thể kết nối đến Telegram API: <br><code>${err.message || err}</code>`
        });
    }
};

// ========================================================
// CHẾ ĐỘ XEM ẢNH PHIẾU SOI (FIT 100% SCREEN VIEW VS ZOOM FIT WIDTH)
// ========================================================
let currentSheetViewMode = localStorage.getItem('omr_sheet_view_mode') || 'fit';

window.setSheetViewMode = function(mode) {
    currentSheetViewMode = mode;
    try {
        localStorage.setItem('omr_sheet_view_mode', mode);
    } catch (_) {}

    const container = document.getElementById('visualSheetContainer');
    const btnFit = document.getElementById('btnSheetFitScreen');
    const btnWidth = document.getElementById('btnSheetFitWidth');
    const img = document.getElementById('resRectifiedImg');

    if (container) {
        if (mode === 'fit') {
            container.classList.remove('fit-width');
            container.classList.add('fit-screen');
        } else {
            container.classList.remove('fit-screen');
            container.classList.add('fit-width');
        }
    }

    if (btnFit && btnWidth) {
        if (mode === 'fit') {
            btnFit.className = 'px-2 py-0.5 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-2xs transition-all cursor-pointer flex items-center gap-1 font-bold';
            btnWidth.className = 'px-2 py-0.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all cursor-pointer flex items-center gap-1';
        } else {
            btnWidth.className = 'px-2 py-0.5 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-2xs transition-all cursor-pointer flex items-center gap-1 font-bold';
            btnFit.className = 'px-2 py-0.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all cursor-pointer flex items-center gap-1';
        }
    }

    if (img) {
        img.className = (mode === 'fit') ? 'max-w-full block cursor-zoom-in' : 'max-w-full block cursor-zoom-out';
    }
};

window.toggleSheetViewMode = function() {
    window.setSheetViewMode(currentSheetViewMode === 'fit' ? 'width' : 'fit');
};

async function loadExamSubmissions(examId) {
    let list = [];

    // 1. Nạp từ localStorage trước (0ms latency, bảo toàn 100% tất cả các bài chấm)
    try {
        const localList = JSON.parse(localStorage.getItem(`omr_submissions_${examId}`) || '[]');
        if (Array.isArray(localList)) {
            list = [...localList];
        }
    } catch(e) {}

    // Nếu trên máy đã có dữ liệu, cập nhật state và vẽ NGAY LẬP TỨC (zero latency)
    if (list.length > 0) {
        state.submissions = list;
        if (state.gradedCountsByExam) state.gradedCountsByExam[examId] = list.length;
        renderInlineSubmissionsList();
        if (state.activeTab === 'results' && window.renderResultsTable) window.renderResultsTable();
        updateOverviewStats();

        // Đồng bộ ngầm trong nền với đám mây để không làm nghẽn giao diện
        syncCloudSubmissionsInBackground(examId, list);
        return;
    }

    // Nếu máy chưa có dữ liệu (lần đầu mở trên thiết bị mới), nạp từ đám mây có hiệu ứng xoay nhẹ
    const inlineListEl = document.getElementById('scanInlineSubmissionsList');
    if (inlineListEl && (!state.submissions || state.submissions.length === 0)) {
        inlineListEl.innerHTML = `
            <div class="py-10 text-center text-xs text-slate-400 space-y-2">
                <i class="fa-solid fa-spinner fa-spin text-2xl text-emerald-500"></i>
                <p class="font-bold text-slate-600 dark:text-slate-300">Đang đồng bộ bài chấm từ đám mây...</p>
            </div>`;
    }

    await fetchSubmissionsFromCloud(examId, list);
    state.submissions = list;
    if (state.gradedCountsByExam) state.gradedCountsByExam[examId] = list.length;
    saveSubmissionsToLocalSafe(examId, list);
    renderInlineSubmissionsList();
    if (state.activeTab === 'results' && window.renderResultsTable) window.renderResultsTable();
    updateOverviewStats();
}

async function fetchSubmissionsFromCloud(examId, list) {
    if (!state.teacherUid || typeof db === 'undefined') return;

    // Đồng bộ và khôi phục bài chấm từ bảng results trên Supabase (Bảo toàn 100% tất cả các bài, kể cả trùng SBD)
    try {
        const resSnap = await getDocs(query(collection(db, "results"), where("examId", "==", examId)));
        resSnap.docs.forEach(docSnap => {
            const r = { id: docSnap.id, ...docSnap.data() };
            if (r.gradingSource !== 'omr' && !String(r.id || '').startsWith('omr_')) return;

            const rawSubId = String(r.id).replace(`omr_${examId}_`, '') || r.id;
            const existing = list.find(x => x.id === rawSubId || x.lmsResultId === r.id);

            if (!existing) {
                const cleanName = (r.studentName && !r.studentName.startsWith('Thí sinh OMR') && !r.studentName.startsWith('Học sinh SBD '))
                    ? r.studentName
                    : '';
                list.push({
                    id: rawSubId,
                    lmsResultId: r.id,
                    examId: examId,
                    teacherId: r.teacherId || state.teacherUid,
                    student_no: r.studentNo || '',
                    student_name: cleanName,
                    student_uid: (r.studentId && !String(r.studentId).startsWith('omr_')) ? r.studentId : '',
                    student_email: r.studentEmail || '',
                    class_id: r.classId || '',
                    class_name: r.className || '',
                    code: r.examCode || '101',
                    score: Number(r.score) || 0,
                    part1_score: Number(r.part1Score) || 0,
                    part2_score: Number(r.part2Score) || 0,
                    part3_score: Number(r.part3Score) || 0,
                    answers: r.omrPart1 || '',
                    part2: Array.isArray(r.omrPart2) ? r.omrPart2 : [],
                    part3: Array.isArray(r.omrPart3) ? r.omrPart3 : [],
                    image_data: r.stampedImage || '',
                    stamped_image: r.stampedImage || '',
                    name_image: r.nameImage || '',
                    telegram_photo_url: r.telegramPhotoUrl || '',
                    createdAt: r.submittedAt || r.gradedAt || r.updatedAt || new Date().toISOString()
                });
            } else {
                existing.lmsResultId = existing.lmsResultId || r.id;
                if (!existing.image_data && r.stampedImage) {
                    existing.image_data = r.stampedImage;
                    existing.stamped_image = r.stampedImage;
                }
                if (!existing.name_image && r.nameImage) {
                    existing.name_image = r.nameImage;
                }
                if (!existing.telegram_photo_url && r.telegramPhotoUrl) {
                    existing.telegram_photo_url = r.telegramPhotoUrl;
                }
            }
        });
    } catch(e) {
        console.warn("Khôi phục bài chấm từ bảng results:", e);
    }
}

function syncCloudSubmissionsInBackground(examId, currentList) {
    if (!state.teacherUid || typeof db === 'undefined') return;
    setTimeout(async () => {
        try {
            const listCopy = [...currentList];
            const prevLen = listCopy.length;
            await fetchSubmissionsFromCloud(examId, listCopy);
            if (listCopy.length !== prevLen) {
                state.submissions = listCopy;
                if (state.gradedCountsByExam) state.gradedCountsByExam[examId] = listCopy.length;
                saveSubmissionsToLocalSafe(examId, listCopy);
                renderInlineSubmissionsList();
                if (state.activeTab === 'results' && window.renderResultsTable) window.renderResultsTable();
                updateOverviewStats();
            }
        } catch(_) {}
    }, 100);
}

// ========================================================
// HỆ THỐNG ĐỐI CHIẾU TRÙNG SỐ BÁO DANH & MÃ ĐỀ (DUPLICATE DETECTION ENGINE - O(1) MAP)
// ========================================================
let cachedDupeMap = null;
let lastDupeSubmissionsRef = null;

function getSubmissionDuplicateStatus(sub, allSubmissions = state.submissions) {
    if (!sub) return null;
    const sbd = String(sub.student_no || '').trim();
    if (!sbd) return null; // Không tính trùng nếu thí sinh chưa tô SBD

    // Tận dụng Map tính trước O(1) thay vì lặp O(N^2)
    if (cachedDupeMap && lastDupeSubmissionsRef === allSubmissions) {
        return cachedDupeMap.get(sub.id) || null;
    }

    cachedDupeMap = new Map();
    lastDupeSubmissionsRef = allSubmissions;

    const sbdGroups = new Map();
    (allSubmissions || []).forEach(s => {
        const sClean = String(s.student_no || '').trim();
        if (sClean) {
            if (!sbdGroups.has(sClean)) sbdGroups.set(sClean, []);
            sbdGroups.get(sClean).push(s);
        }
    });

    sbdGroups.forEach((group) => {
        if (group.length > 1) {
            group.forEach(s => {
                const myCode = String(s.code || '').trim();
                const sameCodeCount = group.filter(other => other.id !== s.id && String(other.code || '').trim() === myCode).length;
                if (sameCodeCount > 0) {
                    cachedDupeMap.set(s.id, {
                        type: 'both',
                        label: 'Trùng cả SBD & Mã',
                        badgeBg: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200 border-rose-300 dark:border-rose-700',
                        rowBg: 'bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100/80 dark:hover:bg-rose-900/40 border-l-4 border-l-rose-500',
                        dupeCount: group.length
                    });
                } else {
                    cachedDupeMap.set(s.id, {
                        type: 'sbd_only',
                        label: 'Trùng SBD',
                        badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border-amber-300 dark:border-amber-700',
                        rowBg: 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/70 dark:hover:bg-amber-900/30 border-l-4 border-l-amber-500',
                        dupeCount: group.length
                    });
                }
            });
        }
    });

    return cachedDupeMap.get(sub.id) || null;
}

// ========================================================
// HỆ THỐNG TRA CỨU HỌC SINH ĐA TẦNG TOÀN DIỆN THEO SỐ BÁO DANH (UNIVERSAL SBD RESOLVER)
// ========================================================
function findStudentBySbd(sbdInput, examId = state.exam?.id, classId = state.exam?.classId) {
    if (!sbdInput && sbdInput !== 0) return null;
    const clean = String(sbdInput).trim().replace(/\D/g, '');
    const num = clean ? String(parseInt(clean, 10)) : '';
    if (!clean && !num) return null;

    const isMatch = (st) => {
        if (!st) return false;
        const stClean = String(st.student_no || st.sbd || st.id || '').trim().replace(/\D/g, '');
        const stNum = stClean ? String(parseInt(stClean, 10)) : '';
        return (clean && stClean && clean === stClean) || (num && stNum && num === stNum);
    };

    // 1. Kiểm tra state.students (danh sách học sinh gán cho đề thi hiện tại)
    if (Array.isArray(state.students) && state.students.length > 0) {
        const m = state.students.find(isMatch);
        if (m && (m.name || m.student_name)) {
            return {
                name: m.name || m.student_name,
                student_no: m.student_no || clean,
                class_name: m.class_name || state.exam?.className || '',
                class_id: m.class_id || state.exam?.classId || '',
                student_uid: m.student_uid || '',
                student_email: m.student_email || '',
                phone: m.phone || ''
            };
        }
    }

    // 2. Kiểm tra lớp OMR đang chọn (active OMR class)
    const activeCls = (typeof getActiveOmrClass === 'function') ? getActiveOmrClass() : null;
    if (activeCls && Array.isArray(activeCls.students)) {
        const m = activeCls.students.find(isMatch);
        if (m && (m.name || m.student_name)) {
            return {
                name: m.name || m.student_name,
                student_no: m.student_no || clean,
                class_name: m.class_name || activeCls.name || '',
                class_id: m.class_id || activeCls.id || '',
                student_uid: m.student_uid || '',
                student_email: m.student_email || '',
                phone: m.phone || ''
            };
        }
    }

    // 3. Kiểm tra lớp được gắn cho bài thi (state.exam?.classId)
    const targetClassId = classId || state.exam?.classId;
    const allClasses = [
        ...(Array.isArray(state.omrClasses) ? state.omrClasses : []),
        ...(Array.isArray(state.classes) ? state.classes : [])
    ];
    if (targetClassId) {
        const examCls = allClasses.find(c => c.id === targetClassId);
        if (examCls && Array.isArray(examCls.students)) {
            const m = examCls.students.find(isMatch);
            if (m && (m.name || m.student_name)) {
                return {
                    name: m.name || m.student_name,
                    student_no: m.student_no || clean,
                    class_name: m.class_name || examCls.name || '',
                    class_id: m.class_id || examCls.id || '',
                    student_uid: m.student_uid || '',
                    student_email: m.student_email || '',
                    phone: m.phone || ''
                };
            }
        }
    }

    // 4. Quét qua tất cả các lớp trong state.omrClasses / state.classes
    for (const cls of allClasses) {
        if (Array.isArray(cls.students)) {
            const m = cls.students.find(isMatch);
            if (m && (m.name || m.student_name)) {
                return {
                    name: m.name || m.student_name,
                    student_no: m.student_no || clean,
                    class_name: m.class_name || cls.name || '',
                    class_id: m.class_id || cls.id || '',
                    student_uid: m.student_uid || '',
                    student_email: m.student_email || '',
                    phone: m.phone || ''
                };
            }
        }
    }

    // 5. Kiểm tra localStorage `omr_local_classes` phòng trường hợp state.omrClasses chưa nạp kịp
    try {
        const rawLocalClasses = localStorage.getItem('omr_local_classes');
        if (rawLocalClasses) {
            const localClsList = JSON.parse(rawLocalClasses);
            if (Array.isArray(localClsList)) {
                for (const cls of localClsList) {
                    if (Array.isArray(cls.students)) {
                        const m = cls.students.find(isMatch);
                        if (m && (m.name || m.student_name)) {
                            return {
                                name: m.name || m.student_name,
                                student_no: m.student_no || clean,
                                class_name: m.class_name || cls.name || '',
                                class_id: m.class_id || cls.id || '',
                                student_uid: m.student_uid || '',
                                student_email: m.student_email || '',
                                phone: m.phone || ''
                            };
                        }
                    }
                }
            }
        }
    } catch (_) {}

    // 6. Kiểm tra localStorage `omr_students_${examId}`
    if (examId) {
        try {
            const rawExStudents = localStorage.getItem(`omr_students_${examId}`);
            if (rawExStudents) {
                const exStudents = JSON.parse(rawExStudents);
                if (Array.isArray(exStudents)) {
                    const m = exStudents.find(isMatch);
                    if (m && (m.name || m.student_name)) {
                        return {
                            name: m.name || m.student_name,
                            student_no: m.student_no || clean,
                            class_name: m.class_name || state.exam?.className || '',
                            class_id: m.class_id || state.exam?.classId || '',
                            student_uid: m.student_uid || '',
                            student_email: m.student_email || '',
                            phone: m.phone || ''
                        };
                    }
                }
            }
        } catch (_) {}
    }

    return null;
}

function getAllAvailableStudents() {
    const list = [];
    const seen = new Set();
    const addSt = (st, defaultClsName = '') => {
        if (!st) return;
        const key = `${st.student_no || ''}_${st.name || ''}`;
        if (!seen.has(key)) {
            seen.add(key);
            list.push({
                ...st,
                name: st.name || st.student_name || '',
                class_name: st.class_name || defaultClsName
            });
        }
    };
    if (Array.isArray(state.students)) {
        state.students.forEach(st => addSt(st));
    }
    const activeCls = (typeof getActiveOmrClass === 'function') ? getActiveOmrClass() : null;
    if (activeCls && Array.isArray(activeCls.students)) {
        activeCls.students.forEach(st => addSt(st, activeCls.name));
    }
    if (Array.isArray(state.omrClasses)) {
        state.omrClasses.forEach(cls => {
            if (Array.isArray(cls.students)) cls.students.forEach(st => addSt(st, cls.name));
        });
    }
    return list;
}

function enrichSubmissionsFromClassRoster() {
    if (!Array.isArray(state.submissions) || state.submissions.length === 0) return;
    const defaultClass = state.exam?.className || (Array.isArray(state.exam?.classes) && state.exam.classes[0]) || '';
    let hasChanges = false;

    state.submissions.forEach(s => {
        if (s.student_no) {
            const currentName = (s.student_name || '').trim();
            const isPlaceholder = !currentName || currentName.startsWith('Học sinh #') || currentName.startsWith('Phiếu ') || currentName.startsWith('Học sinh SBD');
            const matched = findStudentBySbd(s.student_no, s.examId || state.exam?.id, s.class_id || state.exam?.classId);
            if (matched && matched.name) {
                if (isPlaceholder || s.student_name !== matched.name) {
                    s.student_name = matched.name;
                    s._needsRestamp = true;
                    hasChanges = true;
                }
                if (!s.class_name && matched.class_name) {
                    s.class_name = matched.class_name;
                    s._needsRestamp = true;
                    hasChanges = true;
                }
                if (!s.class_id && matched.class_id) s.class_id = matched.class_id;
                if (!s.student_uid && matched.student_uid) s.student_uid = matched.student_uid;
                if (!s.student_email && matched.student_email) s.student_email = matched.student_email;
            }
        }
        if (!s.class_name && defaultClass) {
            s.class_name = defaultClass;
        }
    });

    if (hasChanges && state.exam?.id) {
        try {
            localStorage.setItem(`omr_submissions_${state.exam.id}`, JSON.stringify(state.submissions));
        } catch (_) {}
    }
}

function getVietnameseGivenNameSortKey(fullName) {
    const clean = String(fullName || '').trim();
    if (!clean) return 'zzzzzz';
    const parts = clean.split(/\s+/);
    const given = parts[parts.length - 1] || clean;
    return `${given.toLowerCase()} ${clean.toLowerCase()}`;
}

function compareSbdValues(aNo, bNo) {
    const aClean = String(aNo || '').trim();
    const bClean = String(bNo || '').trim();
    if (!aClean && !bClean) return 0;
    if (!aClean) return 1;
    if (!bClean) return -1;
    const aNum = parseInt(aClean, 10);
    const bNum = parseInt(bClean, 10);
    if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;
    return aClean.localeCompare(bClean, 'vi');
}

function syncSubmissionClassFilterOptions() {
    const classSet = new Set();
    if (state.exam?.className) classSet.add(state.exam.className);
    (state.students || []).forEach(st => { if (st.class_name) classSet.add(st.class_name); });
    (state.submissions || []).forEach(s => { if (s.class_name) classSet.add(s.class_name); });
    const classes = Array.from(classSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));

    ['inlineClassFilter', 'resultsClassFilter'].forEach(selId => {
        const el = document.getElementById(selId);
        if (!el) return;
        const prev = el.value || 'all';
        el.innerHTML = `<option value="all">🏫 Tất cả lớp (${state.submissions.length})</option>` +
            classes.map(c => `<option value="${c}">🏫 Lớp ${c}</option>`).join('');
        if (classes.includes(prev)) el.value = prev;
        else el.value = 'all';
    });
}

function getFilteredSortedSubmissions(mode = 'inline') {
    enrichSubmissionsFromClassRoster();
    const classVal = document.getElementById(mode === 'inline' ? 'inlineClassFilter' : 'resultsClassFilter')?.value || 'all';
    const sortVal = document.getElementById(mode === 'inline' ? 'inlineSortSelect' : 'resultsSortSelect')?.value || 'score_desc';
    const queryStr = (document.getElementById(mode === 'inline' ? 'inlineSearchInput' : 'resultSearchInput')?.value || '').toLowerCase().trim();

    let list = [...state.submissions];
    if (classVal !== 'all') {
        list = list.filter(s => (s.class_name || '') === classVal);
    }
    if (queryStr) {
        list = list.filter(s =>
            (s.student_no && String(s.student_no).toLowerCase().includes(queryStr)) ||
            (s.student_name && String(s.student_name).toLowerCase().includes(queryStr)) ||
            (s.code && String(s.code).toLowerCase().includes(queryStr)) ||
            (s.class_name && String(s.class_name).toLowerCase().includes(queryStr))
        );
    }

    list.sort((a, b) => {
        if (sortVal === 'score_desc') {
            const diff = Number(b.score || 0) - Number(a.score || 0);
            if (diff !== 0) return diff;
            return compareSbdValues(a.student_no, b.student_no);
        }
        if (sortVal === 'score_asc') {
            const diff = Number(a.score || 0) - Number(b.score || 0);
            if (diff !== 0) return diff;
            return compareSbdValues(a.student_no, b.student_no);
        }
        if (sortVal === 'sbd_asc') {
            return compareSbdValues(a.student_no, b.student_no);
        }
        if (sortVal === 'name_asc') {
            const keyA = getVietnameseGivenNameSortKey(a.student_name);
            const keyB = getVietnameseGivenNameSortKey(b.student_name);
            const cmp = keyA.localeCompare(keyB, 'vi');
            if (cmp !== 0) return cmp;
            return compareSbdValues(a.student_no, b.student_no);
        }
        // newest
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return list;
}

window.handleSubmissionsFilterSortChange = (source = 'inline') => {
    const srcClass = document.getElementById(source === 'inline' ? 'inlineClassFilter' : 'resultsClassFilter');
    const dstClass = document.getElementById(source === 'inline' ? 'resultsClassFilter' : 'inlineClassFilter');
    if (srcClass && dstClass) dstClass.value = srcClass.value;

    const srcSort = document.getElementById(source === 'inline' ? 'inlineSortSelect' : 'resultsSortSelect');
    const dstSort = document.getElementById(source === 'inline' ? 'resultsSortSelect' : 'inlineSortSelect');
    if (srcSort && dstSort) dstSort.value = srcSort.value;

    renderInlineSubmissionsList();
    if (window.renderResultsTable) window.renderResultsTable();
};

function renderInlineSubmissionsList() {
    const inlineCountEl = document.getElementById('scanInlineCount');
    const inlineStatsEl = document.getElementById('scanInlineStatsText');
    const inlineListEl = document.getElementById('scanInlineSubmissionsList');
    if (!inlineListEl) return;

    const filtered = getFilteredSortedSubmissions('inline');
    if (inlineCountEl) inlineCountEl.textContent = filtered.length;

    if (filtered.length > 0) {
        const scores = filtered.map(s => Number(s.score) || 0);
        const avg = (scores.reduce((a, b) => a + b, 0) / filtered.length).toFixed(2);
        const max = Math.max(...scores).toFixed(2);
        if (inlineStatsEl) inlineStatsEl.textContent = `Điểm TB: ${avg}đ · Cao nhất: ${max}đ`;
    } else {
        if (inlineStatsEl) inlineStatsEl.textContent = `Điểm TB: 0.00đ · Cao nhất: 0.00đ`;
    }

    if (filtered.length === 0) {
        inlineListEl.innerHTML = `<div class="py-8 text-center text-xs text-slate-400">Chưa có bài chấm nào phù hợp bộ lọc.</div>`;
        return;
    }

    inlineListEl.innerHTML = filtered.map((s, idx) => {
        const hasName = !!(s.student_name && String(s.student_name).trim() && !String(s.student_name).startsWith('Học sinh #') && !String(s.student_name).startsWith('Phiếu '));
        const scoreNum = Number(s.score ?? 0);
        const dupeStatus = getSubmissionDuplicateStatus(s, state.submissions);
        const rowClass = dupeStatus ? dupeStatus.rowBg : 'hover:bg-slate-50/90 dark:hover:bg-[#262335]/70';
        const dupeBadge = dupeStatus
            ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${dupeStatus.badgeBg}" title="Phát hiện ${dupeStatus.dupeCount} bài có cùng SBD ${s.student_no}">${dupeStatus.label}</span>`
            : '';

        // Tự động cắt chữ viết tay trong nền nếu chưa có hoặc là bản cắt cũ
        if (!hasName && (!s.name_image || !s._nameImageV3) && (s.stamped_image || s.image_data)) {
            const rawSrc = s.image_data || s.stamped_image;
            cropCandidateHandwrittenName(rawSrc, s.template_key).then(cropUrl => {
                if (cropUrl) {
                    s.name_image = cropUrl;
                    s._nameImageV3 = true;
                    const imgEl = document.getElementById(`subNameImg_${s.id}`);
                    if (imgEl) {
                        imgEl.src = cropUrl;
                        imgEl.classList.remove('hidden');
                        const placeholder = document.getElementById(`subNamePlaceholder_${s.id}`);
                        if (placeholder) placeholder.classList.add('hidden');
                    }
                }
            }).catch(()=>{});
        }

        const scoreColorClass = scoreNum >= 8 
            ? 'bg-emerald-600 dark:bg-emerald-500' 
            : (scoreNum >= 5 ? 'bg-sky-600 dark:bg-sky-500' : 'bg-rose-600 dark:bg-rose-500');

        return `
            <div class="swipe-item relative overflow-hidden select-none border-b border-gray-100 dark:border-[#38344D]/50 last:border-b-0" data-sub-id="${s.id}">
                <!-- Lớp nền Đỏ hiện ra khi vuốt trái để xóa -->
                <div class="swipe-bg absolute inset-0 bg-rose-600 flex items-center justify-end px-5 text-white font-bold gap-2 text-xs sm:text-sm tracking-wide z-0 opacity-0 transition-opacity pointer-events-none">
                    <i class="fa-solid fa-trash-can text-base sm:text-lg animate-pulse"></i>
                    <span class="swipe-action-text font-bold uppercase tracking-wider text-[11px] sm:text-xs">Vuốt để xóa</span>
                </div>

                <!-- Lớp Card nội dung phía trên: Vuốt mượt mà sang trái -->
                <div class="swipe-content relative z-10 bg-white dark:bg-[#1E1B29] px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer ${rowClass} active:bg-slate-50 dark:active:bg-[#262335] transition-colors" onclick="window.viewSubmissionDetail('${s.id}')">
                    <!-- Left: STT tròn gọn gàng -->
                    <span class="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gray-100 dark:bg-[#282438] text-slate-600 dark:text-slate-300 font-mono font-bold text-[11px] sm:text-xs flex items-center justify-center shrink-0 border border-gray-200/60 dark:border-[#38344D]">${idx + 1}</span>

                    <!-- Center: Dành trọn vẹn khoảng trống cho Tên học sinh hoặc Ảnh cắt chữ viết tay -->
                    <div class="flex-1 min-w-0 pr-1">
                        ${hasName ? `
                        <!-- Trường hợp 1: Có tên trong danh sách lớp -> Hiển thị tên to, đậm, rõ nét -->
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate">${s.student_name}</span>
                            ${s.class_name ? `<span class="px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200/70 dark:border-emerald-800/60 shrink-0">${s.class_name}</span>` : ''}
                        </div>
                        <div class="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex-wrap">
                            <span>SBD: <b class="text-slate-800 dark:text-slate-200 font-bold">${s.student_no || '--'}</b></span>
                            <span>·</span>
                            <span>Mã: <b class="text-slate-800 dark:text-slate-200 font-bold">${s.code || '--'}</b></span>
                            ${(s.telegram_photo_url || s.telegram_file_id) ? `<span class="text-emerald-500 text-[10px] inline-flex items-center gap-0.5" title="Đã sao lưu an toàn"><i class="fa-solid fa-circle-check"></i></span>` : ''}
                            ${dupeBadge}
                        </div>
                        ` : `
                        <!-- Trường hợp 2: Chưa ghép tên học sinh -> Hiển thị ảnh cắt chữ viết tay siêu gọn và thanh thoát -->
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="h-9 sm:h-10 w-24 sm:w-32 shrink-0 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white flex items-center justify-center shadow-2xs">
                                <img src="${s.name_image || ''}" id="subNameImg_${s.id}" class="w-full h-full object-contain p-0.5 ${s.name_image ? '' : 'hidden'}" alt="Tên viết tay" loading="lazy">
                                <div id="subNamePlaceholder_${s.id}" class="text-[9px] text-slate-400 font-bold italic text-center px-1 ${s.name_image ? 'hidden' : ''}">
                                    <i class="fa-solid fa-signature mr-1"></i>Viết tay
                                </div>
                            </div>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300 font-mono flex-wrap">
                                    <span>SBD: <b class="text-slate-900 dark:text-white font-extrabold">${s.student_no || '--'}</b></span>
                                    <span>·</span>
                                    <span>Mã: <b class="text-slate-900 dark:text-white font-extrabold">${s.code || '--'}</b></span>
                                    ${(s.telegram_photo_url || s.telegram_file_id) ? `<span class="text-emerald-500 text-[10px] inline-flex items-center gap-0.5" title="Đã sao lưu an toàn"><i class="fa-solid fa-circle-check"></i></span>` : ''}
                                    ${dupeBadge}
                                </div>
                                <div class="text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5 truncate">
                                    <i class="fa-solid fa-pencil text-[9px] shrink-0"></i>
                                    <span class="truncate">Chưa gán tên</span>
                                </div>
                            </div>
                        </div>
                        `}
                    </div>

                    <!-- Right: Điểm số nổi bật DUY NHẤT (Loại bỏ nút thùng rác, xóa bằng cử chỉ vuốt) -->
                    <div class="shrink-0 flex items-center">
                        <span class="px-2.5 py-1.5 rounded-xl ${scoreColorClass} text-white font-mono font-extrabold text-xs sm:text-sm tabular-nums shadow-2xs leading-none">
                            ${scoreNum.toFixed(2)}đ
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Khởi tạo cử chỉ vuốt sang trái để xóa (Swipe-to-Delete)
    initSwipeToDelete(inlineListEl);
}
window.renderInlineSubmissionsList = renderInlineSubmissionsList;

// ========================================================
// CỬ CHỈ VUỐT SANG TRÁI ĐỂ XÓA BÀI (SWIPE-TO-DELETE ENGINE)
// ========================================================
function initSwipeToDelete(container) {
    if (!container) return;
    const items = container.querySelectorAll('.swipe-item');
    items.forEach(item => {
        const subId = item.getAttribute('data-sub-id');
        const content = item.querySelector('.swipe-content');
        const bg = item.querySelector('.swipe-bg');
        if (!content || !bg || !subId) return;

        let startX = 0, startY = 0;
        let currentX = 0;
        let isSwiping = false;
        let isScrolling = false;
        let hasMovedFar = false;

        const onTouchStart = (e) => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            currentX = 0;
            isSwiping = false;
            isScrolling = false;
            hasMovedFar = false;
            content.style.transition = 'none';
        };

        const onTouchMove = (e) => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            const diffX = touch.clientX - startX;
            const diffY = touch.clientY - startY;

            if (!isSwiping && !isScrolling) {
                if (Math.abs(diffY) > 8 && Math.abs(diffY) > Math.abs(diffX)) {
                    isScrolling = true;
                    return;
                }
                if (diffX < -8 && Math.abs(diffX) > Math.abs(diffY)) {
                    isSwiping = true;
                }
            }

            if (!isSwiping) return;

            if (e.cancelable) e.preventDefault();

            currentX = Math.min(0, diffX);
            if (currentX < -200) {
                currentX = -200 + (currentX + 200) * 0.4;
            }

            if (Math.abs(currentX) > 10) hasMovedFar = true;

            content.style.transform = `translateX(${currentX}px)`;

            const width = item.offsetWidth || 320;
            const progress = Math.min(1, Math.abs(currentX) / (width * 0.4));
            bg.style.opacity = Math.max(0.3, progress).toString();

            const actionText = bg.querySelector('.swipe-action-text');
            const icon = bg.querySelector('i');
            if (actionText) {
                if (Math.abs(currentX) >= Math.min(150, width * 0.38)) {
                    actionText.textContent = 'Thả tay để xóa';
                    bg.classList.add('bg-rose-700');
                    bg.classList.remove('bg-rose-600');
                    if (icon) icon.className = 'fa-solid fa-trash-can text-lg sm:text-xl scale-125 transition-transform';
                } else {
                    actionText.textContent = 'Vuốt để xóa';
                    bg.classList.remove('bg-rose-700');
                    bg.classList.add('bg-rose-600');
                    if (icon) icon.className = 'fa-solid fa-trash-can text-base sm:text-lg animate-pulse';
                }
            }
        };

        const onTouchEnd = () => {
            if (!isSwiping) return;
            isSwiping = false;

            const width = item.offsetWidth || 320;
            const threshold = Math.min(145, width * 0.38);
            const isFullSwipe = Math.abs(currentX) >= threshold;

            if (isFullSwipe) {
                if (navigator.vibrate) try { navigator.vibrate(40); } catch(_) {}

                // Trượt hoàn toàn ra khỏi màn hình sang trái
                content.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
                content.style.transform = `translateX(-${width + 30}px)`;

                setTimeout(() => {
                    item.style.transition = 'max-height 0.25s ease-out, opacity 0.2s ease-out, margin 0.25s ease-out, padding 0.25s ease-out';
                    item.style.maxHeight = `${item.offsetHeight}px`;
                    item.offsetHeight; // force reflow
                    item.style.maxHeight = '0px';
                    item.style.opacity = '0';
                    item.style.paddingTop = '0px';
                    item.style.paddingBottom = '0px';
                    item.style.borderBottomWidth = '0px';

                    setTimeout(() => {
                        window.deleteSubmissionDirect(subId);
                    }, 250);
                }, 180);
            } else {
                content.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)';
                content.style.transform = 'translateX(0px)';
                bg.style.opacity = '0';
                setTimeout(() => {
                    content.style.transition = '';
                    content.style.transform = '';
                }, 260);
            }
        };

        content.addEventListener('touchstart', onTouchStart, { passive: true });
        content.addEventListener('touchmove', onTouchMove, { passive: false });
        content.addEventListener('touchend', onTouchEnd, { passive: true });
        content.addEventListener('touchcancel', onTouchEnd, { passive: true });

        // Chặn sự kiện click mở xem chi tiết nếu đang thực hiện vuốt
        content.addEventListener('click', (e) => {
            if (hasMovedFar || Math.abs(currentX) > 10) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);
    });
}

// Xóa bài trực tiếp từ cử chỉ vuốt và hiển thị nút Hoàn tác (Undo)
let undoToastTimeout = null;
function showUndoToast(message, onUndo) {
    const existing = document.getElementById('omrUndoToast');
    if (existing) existing.remove();
    if (undoToastTimeout) clearTimeout(undoToastTimeout);

    const toast = document.createElement('div');
    toast.id = 'omrUndoToast';
    toast.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-slate-900/95 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-slate-700/80 text-xs sm:text-sm backdrop-blur-md transition-all';
    toast.innerHTML = `
        <i class="fa-solid fa-circle-check text-emerald-400 text-base shrink-0"></i>
        <span class="font-medium truncate max-w-[190px] sm:max-w-[280px]">${message}</span>
        <button id="btnOmrUndoAction" class="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs rounded-xl transition cursor-pointer shrink-0 ml-1">
            Hoàn tác
        </button>
        <button id="btnOmrUndoClose" class="text-slate-400 hover:text-white p-1 text-xs">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    document.body.appendChild(toast);

    const btnUndo = toast.querySelector('#btnOmrUndoAction');
    const btnClose = toast.querySelector('#btnOmrUndoClose');

    btnUndo?.addEventListener('click', () => {
        toast.remove();
        if (typeof onUndo === 'function') onUndo();
    });

    btnClose?.addEventListener('click', () => {
        toast.remove();
    });

    undoToastTimeout = setTimeout(() => {
        if (toast.parentNode) {
            toast.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 15px)';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4500);
}

window.deleteSubmissionDirect = async (subId) => {
    deleteOmrImageFromDb(subId);
    const targetIdx = state.submissions.findIndex(s => s.id === subId);
    if (targetIdx === -1) return;
    const removedSub = state.submissions[targetIdx];
    state.submissions.splice(targetIdx, 1);

    if (state.gradedCountsByExam && state.exam?.id) {
        state.gradedCountsByExam[state.exam.id] = state.submissions.length;
    }

    if (state.teacherUid) {
        try { await deleteDoc(doc(db, "omr_submissions", subId)); } catch(e) {}
        if (removedSub) {
            const sbdSafe = (removedSub.student_no || removedSub.id || '000').replace(/[^a-zA-Z0-9_-]/g, '');
            const resId = removedSub.lmsResultId || `omr_${state.exam?.id}_${sbdSafe}`;
            try { await deleteDoc(doc(db, "results", resId)); } catch(e) {}
        }
    }

    saveSubmissionsToLocalSafe(state.exam?.id, state.submissions);
    window.renderResultsTable();
    updateOverviewStats();
    renderInlineSubmissionsList();

    // Thông báo Toast Hoàn tác nổi
    const stuTitle = removedSub.student_name && !removedSub.student_name.startsWith('Học sinh #') 
        ? removedSub.student_name 
        : `SBD ${removedSub.student_no || '---'}`;

    showUndoToast(`Đã xóa bài: ${stuTitle}`, async () => {
        state.submissions.splice(targetIdx, 0, removedSub);
        if (removedSub.image_data) {
            saveOmrImageToDb(removedSub.id, removedSub.image_data);
        }
        if (state.teacherUid) {
            try { await setDoc(doc(db, "omr_submissions", removedSub.id), removedSub); } catch(e) {}
        }
        saveSubmissionsToLocalSafe(state.exam?.id, state.submissions);
        window.renderResultsTable();
        updateOverviewStats();
        renderInlineSubmissionsList();
    });
};

window.quickAssignStudentToSubmission = async (subId) => {
    const sub = state.submissions.find(s => s.id === subId);
    if (!sub) return;
    const roster = Array.isArray(state.students) ? state.students : [];
    const optionsHtml = roster.length > 0
        ? `<div class="text-left mb-3">
               <label class="block text-xs font-bold text-slate-600 mb-1">Chọn nhanh từ danh sách lớp (${roster.length} HS):</label>
               <select id="swalPickRosterStudent" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold" onchange="var opt=this.options[this.selectedIndex]; if(opt.value){ document.getElementById('swalEditStuName').value=opt.getAttribute('data-name')||''; document.getElementById('swalEditStuSbd').value=opt.value; document.getElementById('swalEditStuClass').value=opt.getAttribute('data-class')||''; }">
                   <option value="">-- Chọn học sinh trong lớp --</option>
                   ${roster.map(st => `<option value="${st.student_no || ''}" data-name="${(st.name || '').replace(/"/g, '&quot;')}" data-class="${(st.class_name || '').replace(/"/g, '&quot;')}" ${st.student_no === sub.student_no ? 'selected' : ''}>SBD ${st.student_no || '---'} — ${st.name} ${st.class_name ? '(' + st.class_name + ')' : ''}</option>`).join('')}
               </select>
           </div>`
        : `<div class="text-left mb-3 p-2.5 rounded-xl bg-amber-50 text-amber-800 text-xs">
               Mẹo: Bấm nút <b>"Gán Lớp LMS"</b> để nạp danh sách học sinh tự động theo SBD.
           </div>`;

    const { value: formValues } = await Swal.fire({
        title: 'Cập nhật Tên & SBD Học sinh',
        html: `
            ${optionsHtml}
            <div class="text-left space-y-2.5">
                <div>
                    <label class="block text-xs font-bold text-slate-600 mb-1">Họ và tên học sinh:</label>
                    <input id="swalEditStuName" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold" value="${(sub.student_name || '').replace(/"/g, '&quot;')}" placeholder="Ví dụ: Nguyễn Văn An">
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Số báo danh (SBD):</label>
                        <input id="swalEditStuSbd" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono font-bold" value="${(sub.student_no || '').replace(/"/g, '&quot;')}" placeholder="001">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-600 mb-1">Lớp:</label>
                        <input id="swalEditStuClass" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold" value="${(sub.class_name || state.exam?.className || '').replace(/"/g, '&quot;')}" placeholder="12A1">
                    </div>
                </div>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Lưu & Cập nhật phiếu',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#10b981',
        preConfirm: () => {
            return {
                name: document.getElementById('swalEditStuName').value.trim(),
                sbd: document.getElementById('swalEditStuSbd').value.trim(),
                cls: document.getElementById('swalEditStuClass').value.trim()
            };
        }
    });

    if (!formValues) return;
    sub.student_name = formValues.name;
    sub.student_no = formValues.sbd;
    if (formValues.cls) sub.class_name = formValues.cls;
    sub._headerV25Upgraded = true;
    await reStampSubmission(sub);

    saveSubmissionsToLocalSafe(state.exam.id, state.submissions);
    if (state.teacherUid) {
        try {
            const { image_data, stamped_image, clean_image, raw_warped_image, ...cloudMeta } = sub;
            await setDoc(doc(db, "omr_submissions", sub.id), cloudMeta);
        } catch (_) {}
    }
    await syncSubmissionToLmsResultsCollection(sub);
    updateOverviewStats();
    if (window.renderResultsTable) window.renderResultsTable();
};

function updateOverviewStats() {
    enrichSubmissionsFromClassRoster();
    syncSubmissionClassFilterOptions();

    const totalSub = state.submissions.length;
    const badge = document.getElementById('resultsCountBadge');
    if (badge) badge.textContent = totalSub;

    const mobBadge = document.getElementById('mobileResultsCountBadge');
    if (mobBadge) mobBadge.textContent = totalSub;

    const stuBadge = document.getElementById('studentsCountBadge');
    if (stuBadge) stuBadge.textContent = state.students.length;

    const elSub = document.getElementById('statTotalSubmissions');
    const elAvg = document.getElementById('statAvgScore');
    const elMax = document.getElementById('statMaxScore');
    const elStu = document.getElementById('statTotalStudents');

    if (elSub) elSub.textContent = totalSub;
    if (elStu) elStu.textContent = state.students.length;

    let avg = '0.00';
    let max = '0.00';
    if (totalSub > 0) {
        const scores = state.submissions.map(s => Number(s.score) || 0);
        avg = (scores.reduce((a, b) => a + b, 0) / totalSub).toFixed(2);
        max = Math.max(...scores).toFixed(2);
        if (elAvg) elAvg.textContent = avg;
        if (elMax) elMax.textContent = max;
    } else {
        if (elAvg) elAvg.textContent = '0.0';
        if (elMax) elMax.textContent = '0.0';
    }

    renderInlineSubmissionsList();

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
                            <div class="font-bold text-slate-800 dark:text-slate-200">${s.student_name || 'Học sinh SBD ' + (s.student_no || '---')}</div>
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

window.downloadSubmissionById = async (subId) => {
    const sub = state.submissions.find(s => s.id === subId);
    if (!sub) return;
    if (!sub.image_data && !sub.stamped_image && (sub.telegram_photo_url || sub.telegram_file_id)) {
        const fresh = await resolveTelegramPhotoDirectUrl(sub);
        if (fresh) sub.stamped_image = fresh;
    }
    if (!sub.image_data && !sub.stamped_image) {
        Swal.fire('Thông báo', 'Chưa có ảnh bài thi để tải về.', 'info');
        return;
    }
    const imgUrl = (await ensureSubmissionStampedHeaderUpgraded(sub)) || sub.stamped_image || sub.image_data;
    const a = document.createElement('a');
    a.href = imgUrl;
    const sbd = sub.student_no || 'khong_sbd';
    const name = (sub.student_name || 'thi_sinh').replace(/\s+/g, '_');
    const score = (typeof sub.score === 'number' ? sub.score.toFixed(2) : sub.score);
    a.download = `PhieuCham_${sbd}_${name}_${score}d.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

// ========================================================
// 4. OMR SCANNING & RECOGNITION CORE ENGINE (CAMERA + MULTI-IMAGE + ZIP)
// ========================================================
window.setScanMode = (mode) => {
    const isUpload = mode === 'upload';
    const cameraArea = document.getElementById('scanCameraArea');

    if (isUpload) {
        window.closeCameraScanner();
    } else {
        if (!state.exam) {
            Swal.fire('Lưu ý', 'Vui lòng chọn hoặc tạo bài thi trước khi quét camera!', 'warning');
            return;
        }
        if (cameraArea) {
            cameraArea.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            if (typeof setupCameraControlsTouchListeners === 'function') {
                setupCameraControlsTouchListeners();
            }
        }
        window.startCameraStream();
    }
};

window.triggerImageFilePicker = (e) => {
    if (e) e.stopPropagation();
    const input = document.getElementById('filePickerInput');
    if (input) {
        input.value = '';
        input.click();
    }
};

window.triggerZipFilePicker = (e) => {
    if (e) e.stopPropagation();
    const input = document.getElementById('zipPickerInput') || document.getElementById('filePickerInput');
    if (input) {
        input.value = '';
        input.click();
    }
};

function initUploadDropZone() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone || dropZone._boundDrag) return;
    dropZone._boundDrag = true;

    ['dragenter', 'dragover'].forEach(evtName => {
        dropZone.addEventListener(evtName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'dragend'].forEach(evtName => {
        dropZone.addEventListener(evtName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        const dtFiles = e.dataTransfer?.files;
        if (dtFiles && dtFiles.length > 0) {
            window.handleFilesSelected(dtFiles);
        }
    });
}

// Khởi tạo vùng kéo thả ảnh / ZIP ngay khi DOM sẵn sàng
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUploadDropZone);
} else {
    initUploadDropZone();
}

async function extractImagesFromFilesOrZips(rawFiles, onStatus) {
    const imageItems = [];
    const imgExtRegex = /\.(jpe?g|png|webp|bmp)$/i;

    for (const file of rawFiles) {
        const nameLower = (file.name || '').toLowerCase();
        const isZip = nameLower.endsWith('.zip') || (file.type && file.type.includes('zip'));

        if (isZip) {
            if (!window.JSZip) {
                throw new Error('Thư viện giải nén JSZip chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng và tải lại trang!');
            }
            if (onStatus) onStatus(`Đang giải nén file: ${file.name}...`);
            const zip = await window.JSZip.loadAsync(file);
            const entries = [];
            zip.forEach((relPath, zipEntry) => {
                if (zipEntry.dir) return;
                if (relPath.includes('__MACOSX') || relPath.startsWith('.') || /\/\./.test(relPath)) return;
                if (imgExtRegex.test(relPath)) {
                    entries.push(zipEntry);
                }
            });

            entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            for (const entry of entries) {
                const blob = await entry.async('blob');
                const shortName = entry.name.split('/').pop() || entry.name;
                const ext = (shortName.split('.').pop() || 'jpg').toLowerCase();
                const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
                const imgFile = new File([blob], shortName, { type: mime });
                imageItems.push(imgFile);
            }
        } else if ((file.type && file.type.startsWith('image/')) || imgExtRegex.test(nameLower)) {
            imageItems.push(file);
        }
    }
    return imageItems;
}

window.handleFilesSelected = async (files) => {
    if (!files || files.length === 0) return;
    if (!state.exam) {
        Swal.fire('Lưu ý', 'Vui lòng chọn hoặc tạo bài thi trước khi chấm!', 'warning');
        return;
    }

    const rawList = Array.from(files);
    const progressCard = document.getElementById('batchProgressBar');
    const progressFill = document.getElementById('batchProgressFill');
    const progressLabel = document.getElementById('batchProgressLabel');
    const progressPercent = document.getElementById('batchProgressPercent');

    // Ẩn khung xem chi tiết đơn lẻ để màn hình gọn sạch khi nạp ảnh chấm
    document.getElementById('lastResultCard')?.classList.add('hidden');

    if (progressCard) progressCard.classList.remove('hidden');
    if (progressFill) progressFill.style.width = '5%';
    if (progressPercent) progressPercent.textContent = 'Chuẩn bị...';
    if (progressLabel) {
        progressLabel.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang chuẩn bị ảnh chấm...`;
    }

    let fileList = [];
    try {
        fileList = await extractImagesFromFilesOrZips(rawList, (msg) => {
            if (progressLabel) progressLabel.innerHTML = `<i class="fa-solid fa-file-zipper fa-bounce"></i> ${msg}`;
        });
    } catch (zipErr) {
        Swal.fire('Lỗi đọc file nén (.ZIP)', zipErr.message || 'Không thể giải nén file .zip này.', 'error');
        if (progressCard) progressCard.classList.add('hidden');
        return;
    }

    if (fileList.length === 0) {
        if (progressCard) progressCard.classList.add('hidden');
        Swal.fire('Không tìm thấy ảnh hợp lệ', 'Vui lòng chọn file ảnh (.JPG, .PNG, .WebP) hoặc file .ZIP có chứa ảnh phiếu trả lời trắc nghiệm.', 'warning');
        return;
    }

    // Reset hàng đợi ảnh lỗi trước đợt chấm mới
    state.failedBatchFiles = [];
    renderBatchFailedQueue();

    let successCount = 0;
    let failCount = 0;
    const batchScores = [];
    const batchSubmissions = [];

    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const pct = Math.round(((i + 1) / fileList.length) * 100);
        if (progressPercent) progressPercent.textContent = `${i + 1}/${fileList.length} (${pct}%)`;
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressLabel) {
            progressLabel.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang chấm phiếu ${i + 1}/${fileList.length}...`;
        }

        // Nhường 1 nhịp UI rất ngắn để thanh tiến trình mượt mà
        await new Promise(r => setTimeout(r, 6));

        try {
            const sub = await processSingleSheet(file, {
                isUploadedFile: true,
                silentInspector: true,
                silentBeep: true,
                deferSave: true
            });
            if (sub) {
                successCount++;
                batchScores.push(Number(sub.score) || 0);
                batchSubmissions.push(sub);
            }
        } catch(err) {
            console.error("Lỗi chấm bài:", file.name, err);
            failCount++;
            let previewUrl = '';
            try {
                if (file instanceof Blob || file instanceof File) {
                    previewUrl = URL.createObjectURL(file);
                }
            } catch (_) {}
            state.failedBatchFiles.push({
                file,
                name: file.name || `Ảnh #${i + 1}`,
                error: err.message || 'Không nhận diện được 4 góc đen định vị',
                previewUrl,
                timestamp: Date.now()
            });
        }
    }

    // Ẩn thanh tiến trình ngay khi chấm xong để giao diện gọn sạch
    if (progressCard) progressCard.classList.add('hidden');

    // Cập nhật hàng đợi ảnh lỗi nếu có
    renderBatchFailedQueue();

    // Hợp nhất kết quả hàng loạt vào state 1 lần duy nhất để tối ưu tốc độ tối đa
    if (batchSubmissions.length > 0) {
        for (const sub of batchSubmissions) {
            // Không bao giờ ghi đè khi trùng SBD! Bảo toàn 100% tất cả các phiếu đã chấm
            const existingIdx = state.submissions.findIndex(s => s.id === sub.id);
            if (existingIdx !== -1) {
                state.submissions[existingIdx] = sub;
            } else {
                state.submissions.push(sub);
            }
        }
        if (state.gradedCountsByExam && state.exam?.id) {
            state.gradedCountsByExam[state.exam.id] = state.submissions.length;
        }

        // Lưu localStorage 1 lần duy nhất (không lưu ảnh nặng nên cực nhẹ)
        saveSubmissionsToLocalSafe(state.exam?.id, state.submissions);

        // Hiển thị phiếu soi của bài chấm cuối cùng
        if (state.lastSubmission && typeof displayLastResultInspector === 'function') {
            displayLastResultInspector(state.lastSubmission, null).catch(() => {});
        }

        // Đồng bộ lên Cloud trong nền với hàng đợi kiểm soát tải (concurrency 3)
        const autoSave = document.getElementById('cameraAutoSave')?.checked ?? (document.getElementById('autoSaveToggle')?.checked ?? true);
        if (autoSave && state.teacherUid) {
            syncBatchSubmissionsToCloud(batchSubmissions);
        }
    }

    updateOverviewStats();
    window.renderResultsTable();

    if (successCount > 0) {
        playBatchSuccessChime();
        const avgBatch = (batchScores.reduce((a, b) => a + b, 0) / batchScores.length).toFixed(2);
        const maxBatch = Math.max(...batchScores).toFixed(2);
        Swal.fire({
            icon: 'success',
            title: `🎉 Đã chấm xong ${successCount} phiếu!`,
            html: `
                <div class="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2">
                    <div class="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold">
                        <span>Điểm TB: <b class="font-mono text-base">${avgBatch}đ</b></span>
                        <span>•</span>
                        <span>Cao nhất: <b class="font-mono text-base">${maxBatch}đ</b></span>
                    </div>
                    ${failCount > 0 ? `<p class="text-rose-500 font-semibold text-xs">⚠️ Có ${failCount}/${fileList.length} ảnh không nhận diện được (đã đưa vào Hàng đợi xử lý lại bên dưới).</p>` : ''}
                    <div class="pt-2">
                        <button type="button" onclick="window.copyClassSummaryToZalo(); Swal.close();" class="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95">
                            <i class="fa-solid fa-share-nodes"></i> Sao chép Bảng điểm gửi Zalo Lớp ngay
                        </button>
                    </div>
                </div>
            `,
            confirmButtonText: 'Xem danh sách điểm',
            confirmButtonColor: '#10b981'
        });
    } else {
        Swal.fire({
            icon: 'warning',
            title: 'Chưa nhận diện được phiếu',
            text: `Cả ${fileList.length} ảnh tải lên đều bị mờ hoặc thiếu 4 ô vuông đen ở 4 góc phiếu. Vui lòng kiểm tra lại ảnh chụp hoặc đổi đúng Loại phiếu chấm!`
        });
    }
};

function renderBatchFailedQueue() {
    const card = document.getElementById('batchFailedQueueCard');
    const countEl = document.getElementById('batchFailedCountText');
    const listEl = document.getElementById('batchFailedList');
    if (!card) return;

    const failed = Array.isArray(state.failedBatchFiles) ? state.failedBatchFiles : [];
    if (failed.length === 0) {
        card.classList.add('hidden');
        if (listEl) listEl.innerHTML = '';
        return;
    }

    card.classList.remove('hidden');
    if (countEl) {
        countEl.textContent = `Có ${failed.length} ảnh chưa nhận diện được góc phiếu / bị mờ`;
    }
    if (listEl) {
        listEl.innerHTML = failed.map((item, idx) => `
            <div class="flex items-center justify-between gap-3 p-2 rounded-xl bg-white/90 dark:bg-slate-900/80 border border-rose-200 dark:border-rose-900/50 shadow-2xs">
                <div class="flex items-center gap-2.5 min-w-0">
                    ${item.previewUrl ? `
                        <img src="${item.previewUrl}" onclick="window.previewFailedBatchImage(${idx})" class="w-12 h-16 object-cover rounded-lg border border-rose-300 dark:border-rose-700 shadow-2xs cursor-pointer hover:scale-105 transition-transform shrink-0" title="Bấm xem ảnh phóng to">
                    ` : `
                        <div class="w-12 h-16 rounded-lg bg-rose-100 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 flex items-center justify-center text-rose-500 shrink-0">
                            <i class="fa-solid fa-image text-lg"></i>
                        </div>
                    `}
                    <div class="min-w-0">
                        <div class="font-bold text-slate-800 dark:text-slate-200 text-xs truncate max-w-[180px] sm:max-w-[260px]" title="${item.name}">
                            #${idx + 1}. ${item.name}
                        </div>
                        <div class="text-rose-600 dark:text-rose-400 font-mono text-[11px] truncate mt-0.5" title="${item.error}">
                            <i class="fa-solid fa-triangle-exclamation mr-1"></i>${item.error}
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button type="button" onclick="window.previewFailedBatchImage(${idx})" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer" title="Xem ảnh">
                        <i class="fa-solid fa-eye mr-1"></i>Xem
                    </button>
                    <button type="button" onclick="window.openManualGradingForFailed(${idx})" class="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer" title="Nhập SBD, mã đề và câu trả lời thủ công">
                        <i class="fa-solid fa-pen-to-square"></i> Chấm thủ công
                    </button>
                    <button type="button" onclick="window.removeFailedBatchItem(${idx})" class="w-6 h-6 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors cursor-pointer" title="Bỏ qua ảnh này">
                        <i class="fa-solid fa-xmark text-xs"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
}

window.previewFailedBatchImage = (idx) => {
    const item = state.failedBatchFiles?.[idx];
    if (!item) return;
    Swal.fire({
        title: `<span class="text-xs font-bold text-slate-700 dark:text-slate-200">${item.name}</span>`,
        html: `
            <div class="space-y-2 text-center">
                <div class="text-[11px] text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/40 p-2 rounded-xl border border-rose-200">
                    <i class="fa-solid fa-triangle-exclamation mr-1"></i> ${item.error}
                </div>
                <div class="max-h-[65vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-black/5 flex items-center justify-center">
                    <img src="${item.previewUrl}" class="max-w-full max-h-[60vh] object-contain rounded shadow-sm" alt="Ảnh bài thi chưa nhận diện được">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-pen-to-square mr-1"></i> Chấm thủ công phiếu này',
        cancelButtonText: 'Đóng',
        confirmButtonColor: '#f59e0b',
        width: '640px'
    }).then(res => {
        if (res.isConfirmed) {
            window.openManualGradingForFailed(idx);
        }
    });
};

window.removeFailedBatchItem = (idx) => {
    if (state.failedBatchFiles?.[idx]) {
        state.failedBatchFiles.splice(idx, 1);
        renderBatchFailedQueue();
    }
};

window.openManualGradingForFailed = (idx) => {
    const item = state.failedBatchFiles?.[idx];
    if (!item) return;

    const draftSub = {
        id: 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        exam_id: state.exam?.id,
        student_no: '',
        code: (state.exam?.codes && state.exam.codes[0]) || '101',
        student_name: '',
        answers: '-'.repeat(state.exam?.question_count || 12),
        part2: Array(state.exam?.part2_count || 4).fill('----'),
        part3: Array(state.exam?.part3_count || 6).fill(''),
        score: 0,
        part1_score: 0,
        part2_score: 0,
        part3_score: 0,
        image_data: item.previewUrl || '',
        clean_image: item.previewUrl || '',
        createdAt: new Date().toISOString(),
        is_manual_entry: true,
        _failedItemIdx: idx,
        class_name: state.exam?.className || ''
    };

    state.lastSubmission = draftSub;
    window.openEditSubmissionAnswersModal();
};

window.retryFailedBatch = async () => {
    const failed = Array.isArray(state.failedBatchFiles) ? state.failedBatchFiles : [];
    if (failed.length === 0) return;
    const retryFiles = failed.map(item => item.file).filter(Boolean);
    state.failedBatchFiles = [];
    renderBatchFailedQueue();
    await window.handleFilesSelected(retryFiles);
};

window.copyClassSummaryToZalo = async () => {
    const subs = state.submissions || [];
    if (subs.length === 0) {
        Swal.fire('Chưa có dữ liệu bài chấm', 'Vui lòng chấm bài trước khi sao chép bảng điểm gửi Zalo!', 'warning');
        return;
    }

    // Lấy tên đề thi và danh sách
    const examName = state.exam?.name || 'Bài kiểm tra OMR';
    const nowStr = new Date().toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    // Sắp xếp theo điểm từ cao xuống thấp để lấy Top thủ khoa
    const sorted = [...subs].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    const scores = sorted.map(s => Number(s.score) || 0);
    const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
    const maxScore = Math.max(...scores).toFixed(2);
    const minScore = Math.min(...scores).toFixed(2);

    // Xếp top 3
    const topMedals = ['🥇', '🥈', '🥉'];
    const topCount = Math.min(3, sorted.length);
    let topText = '';
    for (let i = 0; i < topCount; i++) {
        const s = sorted[i];
        const name = s.student_name || (s.student_no ? `SBD ${s.student_no}` : `Học sinh #${i + 1}`);
        topText += `${topMedals[i]} Top ${i + 1}: ${name} — ${(Number(s.score) || 0).toFixed(2)}đ\n`;
    }

    // Danh sách chi tiết học sinh
    let detailLines = '';
    sorted.forEach((s, i) => {
        const stt = String(i + 1).padStart(2, '0');
        const sbd = s.student_no ? `SBD: ${s.student_no}` : 'SBD: --';
        const code = s.code ? `Mã: ${s.code}` : 'Mã: --';
        const sc = (Number(s.score) || 0).toFixed(2);
        detailLines += `${stt}. ${s.student_name || 'Học sinh'} | ${sbd} | ${code} 👉 ${sc}đ\n`;
    });

    const teacherTitle = (state.user?.displayName || state.user?.name) ? (state.user.displayName || state.user.name) : 'Giáo viên';
    const zaloMessage = 
`📊 BẢNG TỔNG KẾT ĐIỂM KIỂM TRA
📝 Đề thi: ${examName}
👨‍🏫 Giáo viên: ${teacherTitle} - Hệ thống Toán học QMath LMS
📅 Thời gian tổng kết: ${nowStr}
─────────────────────────────
👥 Tổng số bài đã chấm: ${sorted.length} học sinh
📈 Điểm trung bình: ${avgScore}đ
🏆 Điểm cao nhất: ${maxScore}đ | Thấp nhất: ${minScore}đ

🌟 VINH DANH THỦ KHOA:
${topText}
📋 DANH SÁCH CHI TIẾT:
${detailLines}
─────────────────────────────
💡 Quý phụ huynh & học sinh có thể tra cứu chi tiết từng câu làm đúng/sai trên Cổng học sinh QMath LMS!`;

    try {
        await navigator.clipboard.writeText(zaloMessage);
        Swal.fire({
            icon: 'success',
            title: '🎉 Đã sao chép Bảng điểm gửi Zalo!',
            html: `
                <div class="text-xs text-left space-y-2 mt-2">
                    <p class="text-slate-600 dark:text-slate-300">Nội dung bảng điểm tổng kết (${sorted.length} học sinh) đã được sao chép vào bộ nhớ tạm.</p>
                    <div class="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200 text-xs">
                        👉 <b>Thầy/Cô chỉ cần mở nhóm Zalo lớp và bấm Dán (Ctrl + V)</b> là gửi được ngay bản tin điểm đẹp mắt cho phụ huynh & học sinh!
                    </div>
                </div>
            `,
            confirmButtonText: 'Đã hiểu',
            confirmButtonColor: '#2563eb'
        });
    } catch(err) {
        console.error("Lỗi copy Zalo:", err);
        window.prompt("Sao chép nội dung gửi Zalo bên dưới:", zaloMessage);
    }
};

async function processSingleSheet(source, options = {}) {
    const rawResult = await recognizeSheetWithOMR(source, options);
    if (!rawResult) throw new Error("Không tìm đủ 4 mốc đen góc phiếu!");

    // Tự động kiểm tra nếu Mã đề 4 số học sinh tô trên phiếu (từ sách/kho đề) khớp với một đề khác trong Kho đề LMS
    const scannedCode = (rawResult.code || '').replace(/\D/g, '');
    if (scannedCode && scannedCode.length >= 3 && state.exam) {
        const currentCodes = (state.exam.codes || []).map(c => String(c).trim());
        if (!currentCodes.includes(scannedCode) && state.exam.omrCode !== scannedCode) {
            const matchedExamInBank = (state.exams || []).find(ex =>
                ex.id !== state.exam.id && (
                    ex.omrCode === scannedCode ||
                    (Array.isArray(ex.codes) && ex.codes.includes(scannedCode))
                )
            );
            if (matchedExamInBank) {
                const prevClassId = state.exam.classId;
                const prevClassName = state.exam.className;
                const prevStudents = state.students ? [...state.students] : [];
                try {
                    if (matchedExamInBank.isLmsExam && (!Array.isArray(matchedExamInBank.questions) || matchedExamInBank.questions.length === 0)) {
                        const fullDoc = await getDoc(doc(db, "exams", matchedExamInBank.id));
                        if (fullDoc.exists()) {
                            Object.assign(matchedExamInBank, normalizeLmsExam({ id: fullDoc.id, ...fullDoc.data() }));
                        }
                    }
                    await selectExam(matchedExamInBank.id);
                    if (state.exam) {
                        autoFillKeysFromLmsQuestions(state.exam, true);
                        if (prevClassId && !state.exam.classId) {
                            state.exam.classId = prevClassId;
                            state.exam.className = prevClassName;
                        }
                        if (prevStudents.length > 0 && (!state.students || state.students.length === 0)) {
                            state.students = prevStudents;
                        }
                    }
                } catch (switchErr) {
                    console.warn("Không tự chuyển đề theo mã đề:", switchErr);
                }
            }
        }
    }

    // Crop candidate handwriting name (synchronously from rectifiedCanvas if available)
    let nameImg = null;
    if (rawResult.rectifiedCanvas || rawResult.rectifiedImage) {
        nameImg = await cropCandidateHandwrittenName(rawResult.rectifiedCanvas || rawResult.rectifiedImage, rawResult.templateKey, false);
    }

    // Match student name from SBD using universal resolver
    const sbd = (rawResult.student_no || '').replace(/\D/g, '');
    let matchedStudent = findStudentBySbd(sbd, state.exam?.id, state.exam?.classId);
    const studentName = matchedStudent ? (matchedStudent.name || matchedStudent.student_name || '') : '';
    const className = matchedStudent ? (matchedStudent.class_name || state.exam?.className || '') : (state.exam?.className || '');
    const classId = matchedStudent?.class_id || state.exam?.classId || '';
    const studentUid = matchedStudent?.student_uid || '';
    const studentEmail = matchedStudent?.student_email || '';

    // Calculate score
    const scoreData = calculateExamScore(rawResult.code, rawResult.part1, rawResult.part2, rawResult.part3Text || rawResult.part3);

    const submission = {
        id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        examId: state.exam.id,
        teacherId: state.teacherUid,
        student_no: sbd,
        student_name: studentName,
        student_uid: studentUid,
        student_email: studentEmail,
        class_id: classId,
        class_name: className,
        code: rawResult.code || state.exam.codes[0] || '101',
        score: scoreData.totalScore,
        part1_score: scoreData.part1Score,
        part2_score: scoreData.part2Score,
        part3_score: scoreData.part3Score,
        answers: rawResult.part1,
        part2: rawResult.part2,
        part3: rawResult.part3Text || rawResult.part3,
        _original_answers: rawResult.part1,
        _original_part2: rawResult.part2,
        _original_part3: rawResult.part3Text || rawResult.part3,
        flags: rawResult.uncertain || [],
        template_key: rawResult.templateKey || state.exam?.sheet_template || 'qmcv1239',
        p3m: rawResult.p3m || null,
        clean_image: '', // Đã lưu vào IndexedDB với key submission.id + '_clean' để giải phóng RAM
        image_data: rawResult.rectifiedImage,
        name_image: nameImg,
        createdAt: new Date().toISOString()
    };

    // Lưu ảnh nắn phẳng sạch vào IndexedDB để tái đóng dấu chính xác khi cập nhật đáp án
    if (rawResult.rectifiedImage) {
        if (options.deferSave) {
            setTimeout(() => {
                saveOmrImageToDb(submission.id + '_clean', rawResult.rectifiedImage);
            }, 60);
        } else {
            saveOmrImageToDb(submission.id + '_clean', rawResult.rectifiedImage);
        }
    }

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

    // Tự động lưu ảnh bài chấm lên Kênh Telegram trong nền (8 Bot Round-Robin)
    if (state.telegramConfig?.enabled && (state.telegramConfig?.botTokens || []).length > 0 && state.telegramConfig?.chatId) {
        setTimeout(() => {
            uploadGradedSheetToTelegram(submission, submission.stamped_image || rawResult.rectifiedImage).catch(tgErr => {
                console.warn("Lỗi tải ảnh lên Telegram:", tgErr);
            });
        }, 120);
    }

    // Giải phóng ngay rectifiedCanvas sau khi đóng dấu xong để không giữ hàng gigabyte bộ nhớ GPU
    if (rawResult && rawResult.rectifiedCanvas) {
        try {
            rawResult.rectifiedCanvas.width = 1;
            rawResult.rectifiedCanvas.height = 1;
            rawResult.rectifiedCanvas = null;
        } catch (_) {}
    }

    state.lastSubmission = submission;
    state.lastRawResult = rawResult;

    // Play pleasant scan sound immediately upon grading (bỏ qua khi đang chấm hàng loạt)
    if (!options.silentInspector && !options.silentBeep) {
        playBeepSound();
    }

    // Chỉ mở bảng soi chi tiết phiếu (#lastResultCard) nếu không phải đang nạp ảnh hàng loạt
    if (!options.silentInspector) {
        displayLastResultInspector(submission, rawResult);
    }

    // Auto save if enabled (chỉ chạy ngay nếu không phải chế độ deferSave của hàng loạt)
    const autoSave = document.getElementById('cameraAutoSave')?.checked ?? (document.getElementById('autoSaveToggle')?.checked ?? true);
    if (autoSave && !options.deferSave) {
        saveSubmissionToStore(submission).catch(e => console.warn("Background save error:", e));
    }

    return submission;
}


// ========================================================
// BỘ ĐỘNG CƠ NHẬN DIỆN ĐA MẪU PHIẾU TỰ ĐỘNG (MULTI-TEMPLATE AUTO DETECTION)
// ========================================================
const TEMPLATE_SPECS = {
    qmcv1239: { maxP1: 40, maxP2: 8, maxP3: 6, name: 'QM 2025 - CV 1239' },
    bgd2025original: { maxP1: 40, maxP2: 8, maxP3: 6, name: 'BGD 2025 Gốc' },
    bgd2: { maxP1: 40, maxP2: 8, maxP3: 6, name: 'BGD 2025 (Mẫu 2)' },
    phutho: { maxP1: 50, maxP2: 10, maxP3: 12, name: 'HSG Phú Thọ' },
    tnmaker40: { maxP1: 40, maxP2: 0, maxP3: 0, name: 'TNMaker 40 câu ngang' },
    qm40: { maxP1: 40, maxP2: 0, maxP3: 0, name: 'QM 40 câu ngang' },
    nk1846: { maxP1: 18, maxP2: 4, maxP3: 6, name: 'Phiếu 18-4-6' }
};

function getCompatibleTemplatesForExam(exam) {
    const active = exam?.sheet_template || 'qmcv1239';
    const allKnown = ['qmcv1239', 'bgd2025original', 'tnmaker40', 'phutho', 'bgd2', 'qm40', 'nk1846'];
    const candidates = [active];
    for (const key of allKnown) {
        if (!candidates.includes(key) && window.MAU && window.MAU[key]) {
            candidates.push(key);
        }
    }
    return candidates;
}

function recognizeSheetFromGray(gray, options = {}) {
    const candidateKeys = getCompatibleTemplatesForExam(state.exam);
    const guideHints = options.guideHints || null;
    const activeTpl = state.exam?.sheet_template || 'qmcv1239';

    let bestResult = null;
    let matchedTplKey = null;
    let bestScore = -1e9;
    let lastErr = null;

    // Duyệt qua tất cả các mẫu phiếu tương thích và so sánh độ khớp (confidence score)
    for (const tplKey of candidateKeys) {
        const tpl = (window.MAU && window.MAU[tplKey]) || null;
        if (!tpl) continue;

        try {
            let result = null;
            if (options.preFound && options.preFound.origCorners && options.preFound.origCorners.length === 4) {
                // Tái tính toán Homography H chính xác theo toạ độ mốc góc (tpl.moc) của RIÊNG mẫu phiếu này!
                const origCorners = options.preFound.origCorners;
                const H = window.OMR.phepChieu(tpl.moc.slice(0, 4).map(m => [m.x, m.y]), origCorners);
                if (H) {
                    let finalH = H;
                    let finalDen = 40;
                    let finalSoMoc = 4;
                    const refined = window.OMR.tinhChinh ? window.OMR.tinhChinh(gray, H, tpl) : null;
                    if (refined && refined.H && refined.soMoc >= 4) {
                        finalH = refined.H;
                        finalDen = refined.den || 40;
                        finalSoMoc = refined.soMoc;
                    }
                    result = window.OMR.docPhieu(gray, finalH, tpl, finalDen);
                    if (result) {
                        result.H = finalH;
                        result.soMoc = finalSoMoc;
                        result.den = finalDen;
                    }
                }
            }
            if (!result && ['qm40', 'bgd2025original', 'phutho', 'tnmaker40', 'qmcv1239'].includes(tplKey) && window.readQMSheet) {
                result = window.readQMSheet(gray, tpl, guideHints);
            } else if (!result && window.OMR && window.OMR.docAnh) {
                result = window.OMR.docAnh(gray, tpl, window.OMR.thuNho(gray, 900));
            }

            if (result && (result.soMoc >= 4 || result.H)) {
                // Tính toán sai số tỉ lệ khung hình (Aspect Ratio Error) từ 4 góc phiếu
                let ratioErr = 1.0;
                if (result.H && tpl.moc && tpl.moc.length >= 4) {
                    const c = tpl.moc.slice(0, 4).map(pt => window.OMR.ap(result.H, pt.x, pt.y));
                    const w1 = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
                    const w2 = Math.hypot(c[2][0] - c[3][0], c[2][1] - c[3][1]);
                    const h1 = Math.hypot(c[3][0] - c[0][0], c[3][1] - c[0][1]);
                    const h2 = Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]);
                    const avgW = (w1 + w2) / 2;
                    const avgH = (h1 + h2) / 2;
                    const detR = avgH / Math.max(1, avgW);
                    const m = tpl.moc;
                    const tplW = Math.hypot(m[1].x - m[0].x, m[1].y - m[0].y);
                    const tplH = Math.hypot(m[3].x - m[0].x, m[3].y - m[0].y);
                    const expR = tplH / tplW;
                    ratioErr = Math.abs(detR - expR) / expR;
                }

                const totalMoc = (tpl.moc && tpl.moc.length) ? tpl.moc.length : 12;
                const soMoc = result.soMoc || 0;
                const mocRatio = soMoc / totalMoc;
                const sbdDigits = (result.sbd || '').replace(/\D/g, '').length;
                const codeDigits = (result.made || '').replace(/\D/g, '').length;
                const ansCount = (result.p1 || '').replace(/[\*\?]/g, '').length;

                // Tính điểm độ khớp chính xác
                let score = 55 + Math.min(soMoc, 12) * 8;
                if (mocRatio >= 0.60) score += 40;
                if (codeDigits >= 2) score += 30;
                if (sbdDigits >= 2) score += 25;
                if (ansCount >= 2) score += 25;
                if (tplKey === activeTpl) score += 20;

                // TRỪNG PHẠT NẶNG NẾU LỆCH TỈ LỆ KHUNG HÌNH (khắc phục hoàn toàn nhận nhầm khổ đứng/ngang)
                if (ratioErr > 0.14) {
                    score -= 220;
                } else if (ratioErr <= 0.06) {
                    score += 60; // Thưởng điểm cho mẫu có tỉ lệ khung hình khớp tuyệt đối
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestResult = result;
                    matchedTplKey = tplKey;
                }

                // DỪNG SỚM CHỈ KHI:
                // 1. Tỉ lệ khung hình khớp chuẩn (ratioErr <= 0.08)
                // 2. Mẫu active có nhiều mốc nội bộ (>= 14 mốc với qmcv1239, hoặc >= 7 với tpl ít mốc)
                // 3. mocRatio >= 0.50
                // 4. Đọc được mã đề hoặc SBD
                const isHighConfidenceActive = (tplKey === activeTpl) &&
                    (ratioErr <= 0.08) &&
                    ((soMoc >= 14) || (totalMoc <= 12 && soMoc >= 7)) &&
                    mocRatio >= 0.50 &&
                    (codeDigits >= 2 || sbdDigits >= 2) &&
                    score >= 180;

                if (isHighConfidenceActive) {
                    break;
                }

                // Nếu bất kỳ mẫu nào đạt điểm tuyệt đối xuất sắc (ratio chuẩn + soMoc cao + đọc đầy đủ)
                if (bestScore >= 240 && ratioErr <= 0.08 && soMoc >= 8 && (codeDigits >= 2 || sbdDigits >= 2 || ansCount >= 4)) {
                    break;
                }
            }
        } catch(err) {
            lastErr = err;
        }
    }

    if (!bestResult || bestScore < 30) {
        throw (lastErr || new Error("Không nhận diện được đủ 4 mốc đen góc phiếu trên các mẫu phiếu tương thích!"));
    }

    const tplKey = matchedTplKey || activeTpl;
    const tpl = (window.MAU && window.MAU[tplKey]) ? window.MAU[tplKey] : window.MAU.qmcv1239;

    // Fast perspective rectification với mẫu phiếu đã khớp
    const rectW = options.fastRectify !== false ? 960 : 1552;
    const outH = getSheetHeight(tplKey, tpl, rectW);
    const target = getSheetTransform(tplKey, tpl, outH, rectW);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = rectW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d');
    const outData = outCtx.createImageData(rectW, outH);
    const dst = outData.data;
    const gw = gray.w, gh = gray.h, gd = gray.d;

    // Nhân ma trận composite M = H * target một lần duy nhất ngoài vòng lặp
    // Triệt tiêu hoàn toàn 2.66 triệu lần gọi hàm ap() và phép cấp phát mảng [x, y]
    const H = bestResult.H;
    const m0 = H[0]*target[0] + H[1]*target[3] + H[2]*target[6];
    const m1 = H[0]*target[1] + H[1]*target[4] + H[2]*target[7];
    const m2 = H[0]*target[2] + H[1]*target[5] + H[2]*target[8];
    const m3 = H[3]*target[0] + H[4]*target[3] + H[5]*target[6];
    const m4 = H[3]*target[1] + H[4]*target[4] + H[5]*target[7];
    const m5 = H[3]*target[2] + H[4]*target[5] + H[5]*target[8];
    const m6 = H[6]*target[0] + H[7]*target[3] + H[8]*target[6];
    const m7 = H[6]*target[1] + H[7]*target[4] + H[8]*target[7];
    const m8 = H[6]*target[2] + H[7]*target[5] + H[8]*target[8];

    for (let y = 0; y < outH; y++) {
        const rowOff = y * rectW * 4;
        const x0 = m1 * y + m2;
        const y0 = m4 * y + m5;
        const w0 = m7 * y + m8;
        for (let x = 0; x < rectW; x++) {
            const invW = 1.0 / (m6 * x + w0);
            const xx = ((m0 * x + x0) * invW + 0.5) | 0;
            const yy = ((m3 * x + y0) * invW + 0.5) | 0;
            const val = (xx >= 0 && yy >= 0 && xx < gw && yy < gh) ? gd[yy * gw + xx] : 255;
            const idx = rowOff + (x << 2);
            dst[idx] = val;
            dst[idx + 1] = val;
            dst[idx + 2] = val;
            dst[idx + 3] = 255;
        }
    }
    outCtx.putImageData(outData, 0, 0);

    const p2Count = state.exam?.part2_count || 4;
    const formattedP2 = Array.from({ length: p2Count }, (_, i) => {
        const chunk = (bestResult.p2 || '').slice(i * 4, i * 4 + 4);
        return chunk.replace(/D/g, 'Đ').replace(/\*/g, '?');
    });

    return {
        student_no: (bestResult.sbd || '').replace(/\D/g, ''),
        code: (bestResult.made || '').replace(/\D/g, ''),
        part1: (bestResult.p1 || '').replace(/\*/g, '?'),
        part2: formattedP2,
        part3: [],
        part3Text: bestResult.p3 || [],
        calibrated: true,
        rectifiedCanvas: outCanvas,
        rectifiedImage: outCanvas.toDataURL('image/jpeg', 0.88),
        uncertain: bestResult.nghi || [],
        H: bestResult.H,
        template: tpl,
        templateKey: tplKey,
        p1m: bestResult.p1m,
        p2m: bestResult.p2m,
        p3m: bestResult.p3m,
        raw: bestResult
    };
}


function recognizeSheetWithOMR(source, options = {}) {
    // Fast synchronous path if source is already a pre-computed gray image or HTMLCanvasElement
    if (source && source.gray && source.gray.d) {
        return Promise.resolve().then(() => recognizeSheetFromGray(source.gray, {
            ...options,
            guideHints: source.guideHints || options.guideHints,
            preFound: source.found || options.preFound
        }));
    }
    if (source instanceof HTMLCanvasElement) {
        return Promise.resolve().then(() => {
            const ctx = source.getContext('2d', { willReadFrequently: true });
            const gray = window.OMR.xam(ctx.getImageData(0, 0, source.width, source.height));
            return recognizeSheetFromGray(gray, options);
        });
    }

    // File / Blob upload path (with multi-scale + center-crop fallback for phone photos)
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(source);
        img.onload = () => {
            try {
                const nw = img.naturalWidth || 1000;
                const nh = img.naturalHeight || 1400;
                const attempts = [
                    { sx: 0, sy: 0, sw: nw, sh: nh, maxDim: 980 },
                    { sx: nw * 0.06, sy: nh * 0.05, sw: nw * 0.88, sh: nh * 0.90, maxDim: 980 },
                    { sx: 0, sy: 0, sw: nw, sh: nh, maxDim: 1400 }
                ];

                let lastErr = null;
                for (const att of attempts) {
                    let canvas = null;
                    try {
                        const scale = Math.min(1, att.maxDim / Math.max(att.sw || 1, att.sh || 1));
                        canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.round(att.sw * scale));
                        canvas.height = Math.max(1, Math.round(att.sh * scale));
                        const ctx = canvas.getContext('2d', { willReadFrequently: true });
                        ctx.drawImage(img, att.sx, att.sy, att.sw, att.sh, 0, 0, canvas.width, canvas.height);

                        const gray = window.OMR.xam(ctx.getImageData(0, 0, canvas.width, canvas.height));
                        // Giải phóng tức thì GPU/RAM bitmap của canvas
                        canvas.width = 1;
                        canvas.height = 1;
                        canvas = null;

                        const res = recognizeSheetFromGray(gray, options);
                        if (res) {
                            resolve(res);
                            return;
                        }
                    } catch (err) {
                        if (canvas) {
                            canvas.width = 1;
                            canvas.height = 1;
                            canvas = null;
                        }
                        lastErr = err;
                    }
                }
                reject(lastErr || new Error("Không nhận diện được đủ 4 mốc đen góc phiếu!"));
            } catch(e) {
                reject(e);
            } finally {
                URL.revokeObjectURL(url);
                try { img.src = ''; } catch(_) {}
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            try { img.src = ''; } catch(_) {}
            reject(new Error("Không tải được ảnh phiếu thi"));
        };
        img.src = url;
    });
}

function getSheetHeight(tplKey, tpl, baseW = 1552) {
    if (tpl?.khung && tpl.khung[2] > 0) {
        const kw = tpl.khung[2] - (tpl.khung[0] || 0);
        const kh = tpl.khung[3] - (tpl.khung[1] || 0);
        return Math.round(baseW * kh / kw);
    }
    if (tplKey === 'tnmaker40') return Math.round(baseW * 1746 / 2479);
    if (tplKey === 'qm40') return Math.round(baseW * 919 / 1735);
    return Math.round(baseW * 2254 / 1552);
}

function getSheetTransform(tplKey, tpl, outH, outW = 1552) {
    if (tpl?.khung) {
        const k = tpl.khung;
        const kx0 = k[0] || 0, ky0 = k[1] || 0;
        const kx1 = k[2], ky1 = k[3];
        return window.OMR.phepChieu([[0, 0], [outW, 0], [outW, outH], [0, outH]], [[kx0, ky0], [kx1, ky0], [kx1, ky1], [kx0, ky1]]);
    }
    const pad = Math.round(50 * outW / 1552);
    return window.OMR.phepChieu([[pad, pad], [outW - pad, pad], [outW - pad, outH - pad], [pad, outH - pad]], tpl.moc.slice(0, 4).map(m => [m.x, m.y]));
}

// Phát hiện độ cao các header đã đóng dấu trên ảnh (0, 380, 760, v.v.)
function detectExistingHeadersOffset(canvasOrImg) {
    if (!canvasOrImg) return 0;
    const w = canvasOrImg.width || canvasOrImg.naturalWidth;
    const h = canvasOrImg.height || canvasOrImg.naturalHeight;
    if (!w || !h || h < 500) return 0;

    const c = document.createElement('canvas');
    c.width = Math.min(w, 800);
    c.height = Math.round(h * (c.width / w));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvasOrImg, 0, 0, c.width, c.height);

    const sampleW = c.width;
    const sampleH = c.height;
    const scaleBack = w / sampleW;

    let totalHeaderOffset = 0;
    let curY = 0;

    // Lấy toàn bộ mảng pixel 1 LẦN DUY NHẤT để tránh hàng nghìn lệnh getImageData(1,1) làm nghẽn GPU
    let imgData = null;
    try {
        imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;
    } catch (_) {
        c.width = 1; c.height = 1;
        return 0;
    }

    // Quét xuống tối đa 45% chiều cao ảnh để phát hiện toàn bộ các dải header xanh ngọc
    while (curY < sampleH * 0.45) {
        let foundGreenY = -1;
        const searchLimit = Math.min(sampleH, curY + Math.max(25, Math.round(sampleH * 0.035)));

        for (let y = Math.round(curY); y < searchLimit; y++) {
            let greenHits = 0;
            for (const xr of [0.25, 0.4, 0.5, 0.6, 0.75]) {
                const px = Math.round(sampleW * xr);
                const idx = (y * sampleW + px) * 4;
                const r = imgData[idx];
                const g = imgData[idx + 1];
                const b = imgData[idx + 2];
                // Dải xanh ngọc thương hiệu QMath: R < 55, G trong 115..175, B trong 85..155
                if (r < 55 && g > 115 && g < 175 && b > 85 && b < 155) {
                    greenHits++;
                }
            }
            if (greenHits >= 2) {
                foundGreenY = y;
                break;
            }
        }

        if (foundGreenY !== -1) {
            // Chuẩn header QMath 380px trên khổ rộng 1552px
            const headerH = sampleW * (380.0 / 1552.0);
            totalHeaderOffset = Math.round((foundGreenY + headerH) * scaleBack);
            curY = foundGreenY + headerH * 0.88;
        } else {
            curY += 5;
        }
    }

    c.width = 1;
    c.height = 1;
    return totalHeaderOffset;
}

function cropCandidateHandwrittenName(rectifiedSource, tplKey = null, isStamped = false) {
    if (!rectifiedSource) return Promise.resolve(null);
    const activeKey = tplKey || state.exam?.sheet_template || 'qmcv1239';
    // Toạ độ dòng 4. Họ và tên thí sinh chuẩn xác trên từng mẫu phiếu
    let rect = [400/1653, 485/2339, 645/1653, 75/2339]; // default qmcv1239 bao trọn cả nhãn và tên viết tay
    if (activeKey === 'bgd2025original' || activeKey === 'bgd2') rect = [370/1638, 485/2339, 700/1638, 75/2339];
    else if (activeKey === 'phutho') rect = [390/1654, 410/2339, 540/1654, 75/2339];
    else if (activeKey === 'tnmaker40') rect = [1020/2479, 440/1746, 580/2479, 140/1746];
    else if (activeKey === 'qm40') rect = [1050/1735, 10/919, 550/1735, 170/919];

    return new Promise(resolve => {
        const processSource = (source) => {
            const srcW = source.width || source.naturalWidth || 1552;
            const srcH = source.height || source.naturalHeight || 2200;
            // Tự động phát hiện dải header QMath nếu ảnh truyền vào là ảnh đã đóng dấu
            const headerOffset = detectExistingHeadersOffset(source);
            const sheetH = Math.max(1, srcH - headerOffset);

            const canvas = document.createElement('canvas');
            const sx = Math.round(srcW * rect[0]);
            const sy = Math.round(headerOffset + sheetH * rect[1]);
            const sw = Math.round(srcW * rect[2]);
            const sh = Math.round(sheetH * rect[3]);

            canvas.width = Math.max(1, sw);
            canvas.height = Math.max(1, sh);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL('image/jpeg', 0.88);
            canvas.width = 1;
            canvas.height = 1;
            resolve(data);
        };

        if (rectifiedSource instanceof HTMLCanvasElement || rectifiedSource instanceof HTMLImageElement) {
            processSource(rectifiedSource);
            return;
        }

        const img = new Image();
        img.onload = () => {
            processSource(img);
            try { img.src = ''; } catch(_) {}
        };
        img.onerror = () => {
            try { img.src = ''; } catch(_) {}
            resolve(null);
        };
        img.src = rectifiedSource;
    });
}

function resolveKeyForCode(code) {
    const c = String(code || '').trim();
    if (c && state.keys[c]) return state.keys[c];
    const stripped = c.replace(/^0+/, '');
    if (stripped && state.keys[stripped]) return state.keys[stripped];
    const padded4 = c.padStart(4, '0');
    if (state.keys[padded4]) return state.keys[padded4];
    for (const [k, v] of Object.entries(state.keys)) {
        if (k.replace(/^0+/, '') === stripped && stripped !== '') return v;
    }
    const firstKey = Object.keys(state.keys)[0];
    return firstKey ? state.keys[firstKey] : { answers: '', part2: [], part3: [] };
}

function normalizeP3Answer(val) {
    const s = String(val ?? '').trim().replace(/\s+/g, '').replace(/\./g, ',');
    if (!s) return '';
    const num = Number(s.replace(',', '.'));
    if (!Number.isNaN(num) && /^-?\d+([.,]\d+)?$/.test(s)) {
        return String(num).replace('.', ',');
    }
    return s.toUpperCase();
}

function isP3Match(studentVal, keyVal) {
    const ns = normalizeP3Answer(studentVal);
    const nk = normalizeP3Answer(keyVal);
    return Boolean(ns && nk && ns === nk);
}

function calculateExamScore(code, studentP1, studentP2, studentP3) {
    const key = resolveKeyForCode(code);
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
        const isBonus = key.bonus_p1 && (key.bonus_p1[i] === true || key.bonus_p1[String(i)] === true);
        if (isBonus || (s && k && s === k && s !== '-' && s !== '?')) {
            p1Correct++;
        }
    }
    const part1Score = p1Correct * p1Pt;

    // Part II: True/False with progressive barem
    let part2Score = 0;
    const qCount2 = state.exam?.part2_count || 4;
    for (let q = 0; q < qCount2; q++) {
        const isQBonus = key.bonus_p2 && (key.bonus_p2[q] === true || key.bonus_p2[String(q)] === true);
        if (isQBonus) {
            part2Score += p2Pts[3] || 1.0; // Luôn cho điểm trọn vẹn câu này
            continue;
        }
        const sChunk = (studentP2 && studentP2[q]) ? studentP2[q] : '----';
        const kChunk = (key.part2 && key.part2[q]) ? key.part2[q] : '----';
        let matchCount = 0;
        for (let r = 0; r < 4; r++) {
            const sc = (sChunk[r] || '-').toUpperCase().replace('D', 'Đ');
            const kc = (kChunk[r] || '-').toUpperCase().replace('D', 'Đ');
            if (sc && kc && sc === kc && sc !== '-' && sc !== '?') {
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
        const isBonus = key.bonus_p3 && (key.bonus_p3[q] === true || key.bonus_p3[String(q)] === true);
        if (isBonus) {
            p3Correct++;
            continue;
        }
        let sAns = '';
        if (Array.isArray(studentP3)) {
            const item = studentP3[q];
            if (typeof item === 'object' && item !== null) {
                sAns = (item.negative ? '-' : '') + (item.digits || '');
            } else {
                sAns = String(item || '').trim();
            }
        }
        const kAns = String((key.part3 && key.part3[q]) || '').trim();
        if (isP3Match(sAns, kAns)) {
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

async function displayLastResultInspector(sub, rawResult) {
    const card = document.getElementById('lastResultCard');
    if (!card) return;
    card.classList.remove('hidden');

    document.getElementById('resStudentTitle').textContent = sub.student_name ? `Thí sinh: ${sub.student_name}` : `Thí sinh: SBD ${sub.student_no || '---'}`;
    document.getElementById('resScoreBadge').textContent = `${(sub.score ?? 0).toFixed(2)} đ`;
    document.getElementById('resSbdVal').textContent = sub.student_no || '---';
    document.getElementById('resCodeVal').textContent = sub.code || '---';
    document.getElementById('resTimeVal').textContent = sub.createdAt ? new Date(sub.createdAt).toLocaleTimeString('vi-VN') : 'Vừa xong';

    document.getElementById('resP1Score').textContent = (sub.part1_score ?? 0).toFixed(2);
    document.getElementById('resP2Score').textContent = (sub.part2_score ?? 0).toFixed(2);
    document.getElementById('resP3Score').textContent = (sub.part3_score ?? 0).toFixed(2);
    document.getElementById('resTotalScore').textContent = (sub.score ?? 0).toFixed(2);

    // Hiển thị thông báo câu đính chính nếu có
    const overrideBox = document.getElementById('resOverrideAlertBox');
    const overrideText = document.getElementById('resOverrideAlertText');
    if (overrideBox) {
        if (sub.has_manual_override && sub.manual_overrides) {
            const list = [];
            if (sub.manual_overrides.p1) {
                Object.entries(sub.manual_overrides.p1).forEach(([q, v]) => {
                    list.push(`Câu ${parseInt(q) + 1} (${v.from || '-'} → ${v.to})`);
                });
            }
            if (sub.manual_overrides.p2) {
                Object.entries(sub.manual_overrides.p2).forEach(([k, v]) => {
                    const [q, r] = k.split('_');
                    list.push(`Câu ${parseInt(q) + 1}${['a','b','c','d'][r]} (${v.to})`);
                });
            }
            if (sub.manual_overrides.p3) {
                Object.entries(sub.manual_overrides.p3).forEach(([q, v]) => {
                    list.push(`Câu ${parseInt(q) + 1} (${v.to})`);
                });
            }
            if (overrideText) {
                overrideText.textContent = list.length > 0 ? list.join(' · ') : 'Bài thi đã được giáo viên đính chính đáp án thủ công.';
            }
            overrideBox.classList.remove('hidden');
        } else {
            overrideBox.classList.add('hidden');
        }
    }

    // Cảnh báo trùng SBD / Mã đề
    const dupeBox = document.getElementById('resDuplicateNoticeBox');
    if (dupeBox) {
        const dupeStatus = getSubmissionDuplicateStatus(sub, state.submissions);
        if (dupeStatus) {
            dupeBox.className = `p-3 rounded-2xl text-xs font-bold border transition-all ${dupeStatus.badgeBg}`;
            if (dupeStatus.type === 'both') {
                dupeBox.innerHTML = `
                    <div class="flex items-start gap-2.5">
                        <i class="fa-solid fa-triangle-exclamation text-rose-600 dark:text-rose-400 text-base mt-0.5 shrink-0"></i>
                        <div>
                            <span class="block font-black text-rose-700 dark:text-rose-200">⚠️ TRÙNG CẢ SỐ BÁO DANH & MÃ ĐỀ:</span>
                            <span class="text-[11px] font-normal opacity-95">Phát hiện ${dupeStatus.dupeCount} bài thi cùng SBD <b>${sub.student_no}</b> và Mã đề <b>${sub.code}</b>. Có thể học sinh quét lại hoặc 2 thí sinh trùng cả số báo danh lẫn đề. Hệ thống bảo toàn 100% tất cả các bài thi!</span>
                        </div>
                    </div>
                `;
            } else {
                dupeBox.innerHTML = `
                    <div class="flex items-start gap-2.5">
                        <i class="fa-solid fa-circle-exclamation text-amber-600 dark:text-amber-400 text-base mt-0.5 shrink-0"></i>
                        <div>
                            <span class="block font-black text-amber-800 dark:text-amber-200">⚠️ TRÙNG SỐ BÁO DANH (KHÁC MÃ ĐỀ):</span>
                            <span class="text-[11px] font-normal opacity-95">Có ${dupeStatus.dupeCount} bài thi cùng SBD <b>${sub.student_no}</b> nhưng khác mã đề. Có thể học sinh đã tô nhầm SBD. Bạn có thể sửa nhanh SBD bên dưới.</span>
                        </div>
                    </div>
                `;
            }
            dupeBox.classList.remove('hidden');
        } else {
            dupeBox.classList.add('hidden');
        }
    }

    // Nút xem ảnh Telegram nếu đã có URL hoặc ID tải lên
    const tgBtn = document.getElementById('btnViewTelegram');
    if (tgBtn) {
        if (sub.telegram_photo_url || sub.telegram_file_id) {
            tgBtn.onclick = (e) => {
                e.preventDefault();
                window.viewTelegramPhoto(sub.id);
            };
            tgBtn.classList.remove('hidden');
        } else {
            tgBtn.classList.add('hidden');
        }
    }

    // Đảm bảo áp dụng chế độ xem (100% Phiếu vs Phóng to)
    window.setSheetViewMode(currentSheetViewMode);

    // Edit fields
    document.getElementById('editSbdInput').value = sub.student_no || '';
    document.getElementById('editCodeInput').value = sub.code || '';
    document.getElementById('editStudentNameInput').value = sub.student_name || '';

    // Handwriting Image: Cập nhật lại ảnh chữ viết tay nếu chưa có hoặc bản cũ
    const hwImg = document.getElementById('resHandwrittenImg');
    const noHwText = document.getElementById('resNoHandwritingText');
    if ((!sub.name_image || !sub._nameImageV3) && (sub.stamped_image || sub.image_data)) {
        cropCandidateHandwrittenName(sub.image_data || sub.stamped_image, sub.template_key).then(cropUrl => {
            if (cropUrl) {
                sub.name_image = cropUrl;
                sub._nameImageV3 = true;
                if (hwImg && state.lastSubmission?.id === sub.id) {
                    hwImg.src = cropUrl;
                    hwImg.classList.remove('hidden');
                    if (noHwText) noHwText.classList.add('hidden');
                }
            }
        }).catch(()=>{});
    }
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
    const svgOverlay = document.getElementById('resSvgOverlay');
    const visualContainer = document.getElementById('visualSheetContainer');

    // Lấy ảnh: RAM -> IndexedDB -> Supabase/Firestore fallback -> Telegram Cloud CDN Fallback!
    let imgSrc = sub.stamped_image || sub.image_data;
    if (!imgSrc && sub.id) {
        imgSrc = await getOmrImageFromDb(sub.id);
        if (imgSrc) {
            sub.image_data = imgSrc;
            sub.stamped_image = imgSrc;
            if (state.memoryImages) state.memoryImages[sub.id] = imgSrc;
        }
    }
    if (!imgSrc && sub.lmsResultId) {
        try {
            const rSnap = await getDoc(doc(db, "results", sub.lmsResultId));
            if (rSnap.exists() && rSnap.data().stampedImage) {
                imgSrc = rSnap.data().stampedImage;
                sub.image_data = imgSrc;
                sub.stamped_image = imgSrc;
                saveOmrImageToDb(sub.id, imgSrc);
            }
        } catch (_) {}
    }

    // Tự động truy xuất ảnh từ Telegram Cloud CDN nếu máy này chưa có ảnh cục bộ
    if (!imgSrc && (sub.telegram_photo_url || sub.telegram_file_id)) {
        imgSrc = await resolveTelegramPhotoDirectUrl(sub);
        if (imgSrc) {
            sub.stamped_image = imgSrc;
            if (state.memoryImages) state.memoryImages[sub.id] = imgSrc;
            saveOmrImageToDb(sub.id, imgSrc);
        }
    }

    let errPlaceholder = document.getElementById('sheetImgPlaceholderBox');

    if (imgSrc) {
        sheetImg.onload = () => {
            sheetImg.classList.remove('hidden');
            if (errPlaceholder) errPlaceholder.classList.add('hidden');
        };
        sheetImg.onerror = async () => {
            // Tự động làm mới link Telegram tươi nếu link cũ tạm thời hết hạn
            if (sub.telegram_file_id) {
                const freshUrl = await resolveTelegramPhotoDirectUrl(sub, true);
                if (freshUrl && freshUrl !== sheetImg.src) {
                    sheetImg.src = freshUrl;
                    return;
                }
            }
            sheetImg.classList.add('hidden');
            if (!errPlaceholder && visualContainer) {
                errPlaceholder = document.createElement('div');
                errPlaceholder.id = 'sheetImgPlaceholderBox';
                errPlaceholder.className = 'py-12 px-6 text-center space-y-2';
                visualContainer.appendChild(errPlaceholder);
            }
            if (errPlaceholder) {
                errPlaceholder.innerHTML = `
                    <div class="w-12 h-12 mx-auto rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center text-xl">
                        <i class="fa-solid fa-file-invoice"></i>
                    </div>
                    <p class="text-xs font-bold text-slate-300">Bài thi đã lưu đầy đủ điểm số (${(sub.score ?? 0).toFixed(2)}đ)</p>
                    <p class="text-[11px] text-slate-500">Ảnh phiếu nắn phẳng không khả dụng trên thiết bị này.</p>
                `;
                errPlaceholder.classList.remove('hidden');
            }
        };
        sheetImg.src = imgSrc;
        sheetImg.classList.remove('hidden');
        if (errPlaceholder) errPlaceholder.classList.add('hidden');

        // Khi hiển thị ảnh đã đóng dấu hoàn chỉnh, xóa SVG overlay để không bị lệch/trùng
        if (svgOverlay) svgOverlay.innerHTML = '';
    } else {
        sheetImg.classList.add('hidden');
        if (!errPlaceholder && visualContainer) {
            errPlaceholder = document.createElement('div');
            errPlaceholder.id = 'sheetImgPlaceholderBox';
            errPlaceholder.className = 'py-12 px-6 text-center space-y-2';
            visualContainer.appendChild(errPlaceholder);
        }
        if (errPlaceholder) {
            errPlaceholder.innerHTML = `
                <div class="w-12 h-12 mx-auto rounded-2xl bg-slate-800 text-emerald-400 flex items-center justify-center text-xl">
                    <i class="fa-solid fa-file-invoice"></i>
                </div>
                <p class="text-xs font-bold text-slate-200">Bài thi đã lưu đầy đủ điểm số (${(sub.score ?? 0).toFixed(2)}đ)</p>
                <p class="text-[11px] text-slate-400">Ảnh phiếu gốc đã giải phóng để tiết kiệm bộ nhớ điện thoại.</p>
            `;
            errPlaceholder.classList.remove('hidden');
        }
        if (svgOverlay) svgOverlay.innerHTML = '';
    }

    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========================================================
// 4B. TẠO ẢNH PHIẾU NẮN PHẲNG & ĐÓNG DẤU ĐIỂM SỐ CHÍNH THỨC KÈM LOGO
// ========================================================
async function generateStampedGradedSheet(sub, rawResult) {
    if (!rawResult || (!rawResult.rectifiedCanvas && !rawResult.rectifiedImage)) return null;
    const tplKey = sub?.template_key || rawResult?.templateKey || state.exam?.sheet_template || 'qmcv1239';
    const tpl = rawResult?.template || (window.MAU && window.MAU[tplKey]) || window.MAU.qmcv1239;
    if (!tpl) return rawResult?.rectifiedImage || null;

    // Dùng trực tiếp rectifiedCanvas trong bộ nhớ để bỏ qua độ trễ giải mã ảnh base64
    const rectImg = rawResult.rectifiedCanvas || await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Lỗi nạp ảnh nắn phẳng"));
        img.src = rawResult.rectifiedImage;
    });

    const rawW = rectImg.width || rectImg.naturalWidth || 1552;
    const rawH = rectImg.height || rectImg.naturalHeight || 2200;
    const sheetW = 1552;
    const sheetH = Math.round(sheetW * rawH / rawW);
    const headerH = 380; // Khung thông tin & con dấu CỠ LỚN (siêu rõ nét khi xem trên điện thoại)

    const canvas = document.createElement('canvas');
    canvas.width = sheetW;
    canvas.height = headerH + sheetH;
    const ctx = canvas.getContext('2d');

    // 1. NỀN HEADER SANG TRỌNG (SLATE-50)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, sheetW, headerH);

    // Viền màu xanh ngọc thương hiệu QMath LMS ở đỉnh (dày 10px)
    const topBar = ctx.createLinearGradient(0, 0, sheetW, 0);
    topBar.addColorStop(0, '#059669');
    topBar.addColorStop(0.5, '#0d9488');
    topBar.addColorStop(1, '#059669');
    ctx.fillStyle = topBar;
    ctx.fillRect(0, 0, sheetW, 10);

    // Đường phân cách sắc nét phía dưới Header
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(sheetW, headerH);
    ctx.stroke();

    // 2. KHỐI LOGO THẦY CHOANG & THƯƠNG HIỆU WEB CỠ LỚN (GÓC TRÁI: X: 22 -> 425)
    const logoImg = await ensureBrandLogoReady();
    const brandCardX = 22, brandCardY = 24, brandCardW = 402, brandCardH = 334;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(brandCardX, brandCardY, brandCardW, brandCardH, 18);
    else ctx.rect(brandCardX, brandCardY, brandCardW, brandCardH);
    ctx.fill();
    ctx.stroke();

    // Vẽ Logo Thầy Choang cỡ lớn (156x156px) ở chính giữa phía trên khối thương hiệu
    const logoS = 156;
    const logoX = brandCardX + Math.round((brandCardW - logoS) / 2);
    const logoY = brandCardY + 16;
    const rad = 24;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(logoX + rad, logoY);
    ctx.arcTo(logoX + logoS, logoY, logoX + logoS, logoY + logoS, rad);
    ctx.arcTo(logoX + logoS, logoY + logoS, logoX, logoY + logoS, rad);
    ctx.arcTo(logoX, logoY + logoS, logoX, logoY, rad);
    ctx.arcTo(logoX, logoY, logoX + logoS, logoY, rad);
    ctx.closePath();

    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.clip();
        ctx.drawImage(logoImg, logoX + 2, logoY + 2, logoS - 4, logoS - 4);
    } else {
        const logoGrad = ctx.createLinearGradient(logoX, logoY, logoX + logoS, logoY + logoS);
        logoGrad.addColorStop(0, '#059669');
        logoGrad.addColorStop(1, '#047857');
        ctx.fillStyle = logoGrad;
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 54px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TC', logoX + logoS / 2, logoY + logoS / 2 + 2);
    }
    ctx.restore();

    // Xác định tên giáo viên đăng ký tài khoản
    let teacherRaw = (state.user?.displayName || state.user?.name || '').trim();
    if (!teacherRaw && state.user?.email) teacherRaw = state.user.email.split('@')[0];
    if (!teacherRaw) teacherRaw = 'Phạm Đình Quang';
    const teacherDisplay = teacherRaw.toLowerCase().startsWith('gv') ? teacherRaw : `GV ${teacherRaw}`;

    // Tên thương hiệu Giáo viên căn giữa dưới Logo
    const brandCenterX = brandCardX + brandCardW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 24px "Segoe UI", Arial, sans-serif';
    ctx.fillText(teacherDisplay.toUpperCase(), brandCenterX, brandCardY + 212);

    ctx.fillStyle = '#059669';
    ctx.font = 'bold 21px "Segoe UI", Arial, sans-serif';
    ctx.fillText('HỆ THỐNG CHẤM THI OMR', brandCenterX, brandCardY + 246);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Web: qmath.io.vn', brandCenterX, brandCardY + 278);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Chuẩn BGD 2025 (CV 1239)', brandCenterX, brandCardY + 310);
    ctx.textAlign = 'left';

    // Đối chiếu tên thí sinh từ danh sách lớp (theo số báo danh) qua hàm universal resolver
    let resolvedStudentName = (sub.student_name || '').trim();
    const hasExistingRealName = resolvedStudentName && !resolvedStudentName.startsWith('Học sinh #') && !resolvedStudentName.startsWith('Phiếu ') && !resolvedStudentName.startsWith('Học sinh SBD');
    let matchedStudentInfo = null;
    if (sub.student_no) {
        matchedStudentInfo = findStudentBySbd(sub.student_no, sub.examId || state.exam?.id, sub.class_id || state.exam?.classId);
    }
    if (matchedStudentInfo && (matchedStudentInfo.name || matchedStudentInfo.student_name)) {
        resolvedStudentName = matchedStudentInfo.name || matchedStudentInfo.student_name;
        sub.student_name = resolvedStudentName;
        if (!sub.class_name && matchedStudentInfo.class_name) sub.class_name = matchedStudentInfo.class_name;
        if (!sub.class_id && matchedStudentInfo.class_id) sub.class_id = matchedStudentInfo.class_id;
    }
    if (!resolvedStudentName) resolvedStudentName = sub.student_no ? `Học sinh #${sub.student_no}` : 'Theo SBD trên phiếu';
    sub._stampedStudentName = resolvedStudentName;

    // 3. KHUNG THÔNG TIN THÍ SINH & ĐỀ THI CỠ LỚN (GIỮA: X: 438 -> 948)
    const cardX = 438, cardY = 24, cardW = 510, cardH = 334;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 18);
    else ctx.rect(cardX, cardY, cardW, cardH);
    ctx.fill();
    ctx.stroke();

    // Tên kỳ thi / bài kiểm tra (chữ cực đậm 27px)
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 27px "Segoe UI", Arial, sans-serif';
    const rawExamName = (state.exam?.name || 'BÀI KIỂM TRA ĐỊNH KỲ').toUpperCase();
    const examName = rawExamName.length > 28 ? rawExamName.slice(0, 27) + '…' : rawExamName;
    ctx.fillText(examName, cardX + 22, cardY + 46);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cardX + 22, cardY + 64);
    ctx.lineTo(cardX + cardW - 22, cardY + 64);
    ctx.stroke();

    // Dòng 1: Thí sinh
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Thí sinh:', cardX + 22, cardY + 104);
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 26px "Segoe UI", Arial, sans-serif';
    ctx.fillText(resolvedStudentName.length > 22 ? resolvedStudentName.slice(0, 21) + '…' : resolvedStudentName, cardX + 120, cardY + 104);

    // Dòng 2: Người chấm (Tên giáo viên đăng ký tài khoản)
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Người chấm:', cardX + 22, cardY + 146);
    ctx.fillStyle = '#059669';
    ctx.font = 'bold 23px "Segoe UI", Arial, sans-serif';
    ctx.fillText(teacherDisplay.length > 22 ? teacherDisplay.slice(0, 21) + '…' : teacherDisplay, cardX + 155, cardY + 146);

    // Dòng 3: SBD & Mã đề nổi bật
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 21px "Segoe UI", Arial, sans-serif';
    ctx.fillText('SBD:', cardX + 22, cardY + 196);
    ctx.fillStyle = '#059669';
    ctx.font = '900 36px "Courier New", monospace';
    ctx.fillText(sub.student_no || '---', cardX + 85, cardY + 198);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 21px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Mã đề:', cardX + 270, cardY + 196);
    ctx.fillStyle = '#dc2626';
    ctx.font = '900 36px "Courier New", monospace';
    ctx.fillText(sub.code || '---', cardX + 355, cardY + 198);

    // Dòng 4: Lớp
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Lớp:', cardX + 22, cardY + 244);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    const activeCls = (typeof getActiveOmrClass === 'function') ? getActiveOmrClass() : null;
    const resolvedClassName = sub.class_name || matchedStudentInfo?.class_name || activeCls?.name || state.exam?.className || (state.exam?.classes?.[0] || '---');
    sub._stampedClassName = resolvedClassName;
    ctx.fillText(resolvedClassName, cardX + 85, cardY + 244);

    // Dòng 5: Giờ chấm & Ghi chú đính chính
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Chấm lúc: ' + new Date(sub.createdAt).toLocaleString('vi-VN'), cardX + 22, cardY + 286);
    if (sub.has_manual_override) {
        ctx.fillStyle = '#7e22ce';
        ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        ctx.fillText('★ Có câu được Giáo viên đính chính thủ công', cardX + 22, cardY + 314);
    }

    // 4. KHUNG ĐIỂM SỐ TỪNG PHẦN CỠ LỚN (BÊN PHẢI: X: 962 -> 1272)
    const sbX = 962, sbY = 24, sbW = 310, sbH = 334;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(sbX, sbY, sbW, sbH, 18);
    else ctx.rect(sbX, sbY, sbW, sbH);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '900 22px "Segoe UI", Arial, sans-serif';
    ctx.fillText('BẢNG ĐIỂM CHI TIẾT', sbX + 20, sbY + 46);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sbX + 20, sbY + 64);
    ctx.lineTo(sbX + sbW - 20, sbY + 64);
    ctx.stroke();

    const drawScoreLine = (label, scoreVal, yPos) => {
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
        ctx.fillText(label, sbX + 20, yPos);
        ctx.fillStyle = '#0f172a';
        ctx.font = '900 30px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText((scoreVal ?? 0).toFixed(2) + 'đ', sbX + sbW - 20, yPos);
        ctx.textAlign = 'left';
    };

    drawScoreLine('Phần I (TN):', sub.part1_score, sbY + 114);
    drawScoreLine('Phần II (Đ/S):', sub.part2_score, sbY + 170);
    drawScoreLine('Phần III (TLN):', sub.part3_score, sbY + 226);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sbX + 20, sbY + 252);
    ctx.lineTo(sbX + sbW - 20, sbY + 252);
    ctx.stroke();

    ctx.fillStyle = '#dc2626';
    ctx.font = '900 25px "Segoe UI", Arial, sans-serif';
    ctx.fillText('TỔNG:', sbX + 20, sbY + 306);
    ctx.fillStyle = '#dc2626';
    ctx.font = '900 42px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText((sub.score ?? 0).toFixed(2) + 'đ', sbX + sbW - 18, sbY + 308);
    ctx.textAlign = 'left';

    // 5. CON DẤU ĐỎ CHẤM BÀI CHÍNH THỨC CỠ LỚN (SEAL: TÂM X: 1412, Y: 190, R: 126)
    ctx.save();
    const sealX = 1412, sealY = 190;
    ctx.translate(sealX, sealY);
    ctx.rotate(-0.07); // Nghiêng nhẹ cho cảm giác đóng mộc dấu thật

    // Nền tròn trắng kem nhạt giúp con dấu nổi bật
    ctx.fillStyle = '#fff1f2';
    ctx.beginPath();
    ctx.arc(0, 0, 126, 0, Math.PI * 2);
    ctx.fill();

    // Vòng tròn ngoài đậm
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 126, 0, Math.PI * 2);
    ctx.stroke();

    // Vòng tròn nét đứt thứ 2
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 114, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Vòng tròn trong
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 82, 0, Math.PI * 2);
    ctx.stroke();

    // Chữ trong mộc dấu cỡ cực lớn
    ctx.fillStyle = '#dc2626';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '900 17px "Segoe UI", Arial, sans-serif';
    ctx.fillText(teacherDisplay.toUpperCase(), 0, -96);

    ctx.font = '900 66px "Segoe UI", Arial, sans-serif';
    ctx.fillText((sub.score ?? 0).toFixed(2), 0, -4);

    ctx.font = '900 19px "Segoe UI", Arial, sans-serif';
    ctx.fillText('ĐIỂM CHÍNH THỨC', 0, 42);

    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.fillText('★ QMATH.IO.VN ★', 0, 96);

    ctx.font = '900 66px "Segoe UI", Arial, sans-serif';
    ctx.fillText((sub.score ?? 0).toFixed(2), 0, -4);

    ctx.font = '900 19px "Segoe UI", Arial, sans-serif';
    ctx.fillText('ĐIỂM CHÍNH THỨC', 0, 42);

    ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
    ctx.fillText('★ QMATH.IO.VN ★', 0, 96);
    ctx.restore();

    // 6. VẼ PHIẾU NẮN PHẲNG BÊN DƯỚI HEADER (Y: headerH)
    ctx.drawImage(rectImg, 0, headerH, sheetW, sheetH);

    // Always proceed to Section 7 to draw colored rings on stamped sheet

    // 7. VẼ ĐÁNH DẤU CHI TIẾT TRỰC TIẾP CẢ 3 PHẦN LÊN ẢNH (Vòng tròn đậm rõ hơn)
    const key = resolveKeyForCode(sub.code);
    const kFrame = tpl.khung || [0, 0, 16.53, 23.39];
    const kx0 = kFrame[0] || 0;
    const ky0 = kFrame[1] || 0;
    const kw = (kFrame[2] || 16.53) - kx0;
    const kh = (kFrame[3] || 23.39) - ky0;
    const scaleX = sheetW / kw;
    const scaleY = sheetH / kh;

    const drawRingOnCanvas = (pt, color, lineW = 4.5, r = 15, dashed = false) => {
        if (!pt) return;
        const cx = (pt[0] - kx0) * scaleX;
        const cy = (pt[1] - ky0) * scaleY + headerH;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        if (dashed) ctx.setLineDash([5, 4]);
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
            const isOverride = sub.manual_overrides?.p1?.[q] || sub.manual_overrides?.p1?.[String(q)];
            const isBonus = key.bonus_p1 && (key.bonus_p1[q] === true || key.bonus_p1[String(q)] === true);

            ['A', 'B', 'C', 'D'].forEach((char, optIdx) => {
                const pt = tpl.p1[q][optIdx];
                if (!pt) return;
                const isStudentMark = studentAns === char;
                const isKeyMark = keyAns === char;

                if (isOverride && isStudentMark) {
                    // GIÁO VIÊN ĐÃ ĐÍNH CHÍNH CÂU NÀY: VÒNG TÍM NỔI BẬT
                    drawRingOnCanvas(pt, '#9333ea', 6, 17);
                    drawRingOnCanvas(pt, '#d8b4fe', 3, 11);
                } else if (isBonus) {
                    if (isStudentMark) {
                        drawRingOnCanvas(pt, '#10b981', 5, 16); // Xanh lá: Được tính điểm
                    } else if (isKeyMark) {
                        drawRingOnCanvas(pt, '#f59e0b', 3.5, 14.5, true);
                    }
                } else if (isStudentMark && isKeyMark) {
                    drawRingOnCanvas(pt, '#10b981', 4.5, 15.5); // Xanh lá: Đúng
                } else if (isStudentMark && !isKeyMark) {
                    drawRingOnCanvas(pt, '#ef4444', 4.5, 15.5); // Đỏ: Tô sai
                } else if (!isStudentMark && isKeyMark && studentAns && studentAns !== '-') {
                    drawRingOnCanvas(pt, '#f59e0b', 3.5, 14.5, true); // Vàng nét đứt: Vị trí đáp án đúng
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
            const isQBonus = key.bonus_p2 && (key.bonus_p2[q] === true || key.bonus_p2[String(q)] === true);

            for (let r = 0; r < 4; r++) {
                const idx = q * 4 + r;
                if (idx >= tpl.p2.length) continue;
                const ptD = tpl.p2[idx][0];
                const ptS = tpl.p2[idx][1];
                if (!ptD || !ptS) continue;

                const sChar = (sChunk[r] || '-').toUpperCase().replace('D', 'Đ');
                const kChar = (kChunk[r] || '-').toUpperCase().replace('D', 'Đ');
                const isItemOverride = sub.manual_overrides?.p2?.[`${q}_${r}`];

                if (isItemOverride) {
                    const targetPt = sChar === 'Đ' ? ptD : (sChar === 'S' ? ptS : null);
                    if (targetPt) {
                        drawRingOnCanvas(targetPt, '#9333ea', 6, 17);
                        drawRingOnCanvas(targetPt, '#d8b4fe', 3, 11);
                    }
                } else if (isQBonus) {
                    if (sChar === 'Đ') drawRingOnCanvas(ptD, '#10b981', 4.5, 15.5);
                    else if (sChar === 'S') drawRingOnCanvas(ptS, '#10b981', 4.5, 15.5);
                } else if (sChar === 'Đ') {
                    if (kChar === 'Đ') {
                        drawRingOnCanvas(ptD, '#10b981', 4.5, 15.5);
                    } else {
                        drawRingOnCanvas(ptD, '#ef4444', 4.5, 15.5);
                        if (kChar === 'S') drawRingOnCanvas(ptS, '#f59e0b', 3.5, 14.5, true);
                    }
                } else if (sChar === 'S') {
                    if (kChar === 'S') {
                        drawRingOnCanvas(ptS, '#10b981', 4.5, 15.5);
                    } else {
                        drawRingOnCanvas(ptS, '#ef4444', 4.5, 15.5);
                        if (kChar === 'Đ') drawRingOnCanvas(ptD, '#f59e0b', 3.5, 14.5, true);
                    }
                } else {
                    if (kChar === 'Đ') drawRingOnCanvas(ptD, '#f59e0b', 3.5, 14.5, true);
                    else if (kChar === 'S') drawRingOnCanvas(ptS, '#f59e0b', 3.5, 14.5, true);
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
            const isP3Override = sub.manual_overrides?.p3?.[q] || sub.manual_overrides?.p3?.[String(q)];
            const isP3Bonus = key.bonus_p3 && (key.bonus_p3[q] === true || key.bonus_p3[String(q)] === true);
            const isMatch = isP3Bonus || isP3Match(sAns, kAns);

            // Khoanh tròn các ô số học sinh đã tô ở 4 cột (Xanh lá nếu đúng, Đỏ nếu sai, Vàng nét đứt nếu là vị trí đáp án đúng)
            let p3mStudent = (rawResult.p3m && rawResult.p3m[q]) || sub.p3m?.[q] || null;
            if (!p3mStudent && sAns && tpl.p3hang) {
                p3mStudent = [];
                for (let col = 0; col < 4; col++) {
                    const ch = sAns[col] || '';
                    const rIdx = ch ? tpl.p3hang.indexOf(ch) : -1;
                    p3mStudent.push(rIdx);
                }
            }

            let p3mKey = null;
            if (kAns && tpl.p3hang) {
                p3mKey = [];
                for (let col = 0; col < 4; col++) {
                    const ch = kAns[col] || '';
                    const rIdx = ch ? tpl.p3hang.indexOf(ch) : -1;
                    p3mKey.push(rIdx);
                }
            }

            // 1. Khoanh tròn các ô số học sinh đã tô
            if (p3mStudent) {
                for (let col = 0; col < 4; col++) {
                    const v = p3mStudent[col];
                    if (v >= 0 && tpl.p3[q]?.[col]?.[v]) {
                        const pt = tpl.p3[q][col][v];
                        if (isP3Override) {
                            drawRingOnCanvas(pt, '#9333ea', 6, 16);
                            drawRingOnCanvas(pt, '#d8b4fe', 3, 11);
                        } else if (isP3Bonus || isMatch) {
                            drawRingOnCanvas(pt, '#10b981', 5, 15.5); // Xanh lá: Đúng
                        } else {
                            drawRingOnCanvas(pt, '#ef4444', 5, 15.5); // Đỏ: Tô sai
                        }
                    }
                }
            }

            // 2. Nếu học sinh làm sai, khoanh tròn VÀNG NÉT ĐỨT vị trí đáp án đúng
            if (!isMatch && !isP3Bonus && p3mKey) {
                for (let col = 0; col < 4; col++) {
                    const vk = p3mKey[col];
                    if (vk >= 0 && tpl.p3[q]?.[col]?.[vk]) {
                        const ptKey = tpl.p3[q][col][vk];
                        drawRingOnCanvas(ptKey, '#f59e0b', 4, 15, true); // Vàng nét đứt: Vị trí đáp án đúng
                    }
                }
            }

            // Vẽ bảng điểm / nhãn kết quả câu trả lời ngắn CỠ LỚN đặt dưới đáy mỗi câu (nằm hoàn toàn ngoài khung tô)
            let qMaxY = -Infinity;
            let qMinX = Infinity, qMaxX = -Infinity;
            if (tpl.p3[q]) {
                tpl.p3[q].forEach(colPts => {
                    if (Array.isArray(colPts)) {
                        colPts.forEach(pt => {
                            if (pt) {
                                if (pt[0] < qMinX) qMinX = pt[0];
                                if (pt[0] > qMaxX) qMaxX = pt[0];
                                if (pt[1] > qMaxY) qMaxY = pt[1];
                            }
                        });
                    }
                });
            }

            if (qMaxY > -Infinity) {
                const centerX = ((qMinX + qMaxX) / 2 - kx0) * scaleX;
                const bw = 210, bh = 46;
                let bx = Math.round(centerX - bw / 2);
                if (bx < 8) bx = 8;
                if (bx + bw > sheetW - 8) bx = sheetW - bw - 8;

                const bottomBubbleCanvasY = (qMaxY - ky0) * scaleY + headerH;
                const tableBottomCanvasY = (22.00 - ky0) * scaleY + headerH;
                let by = Math.round(Math.max(bottomBubbleCanvasY + 46, tableBottomCanvasY + 10));
                const maxBy = canvas.height - bh - 8;
                if (by > maxBy) by = maxBy;

                ctx.save();
                ctx.fillStyle = isP3Override ? '#faf5ff' : (isMatch ? '#ecfdf5' : '#fef2f2');
                ctx.strokeStyle = isP3Override ? '#9333ea' : (isMatch ? '#059669' : '#dc2626');
                ctx.lineWidth = 3;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 10);
                else ctx.rect(bx, by, bw, bh);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = isP3Override ? '#6b21a8' : (isMatch ? '#065f46' : '#991b1b');
                ctx.font = '900 19px "Segoe UI", Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (isP3Override) {
                    ctx.fillText(`★ Đã sửa: ${sAns || '---'} (+${isMatch ? (state.exam?.part3_point ?? 0.5) : 0}đ)`, bx + bw / 2, by + bh / 2);
                } else if (isP3Bonus) {
                    ctx.fillText(`★ Cho điểm: ${sAns || '---'} (+${state.exam?.part3_point ?? 0.5}đ)`, bx + bw / 2, by + bh / 2);
                } else if (isMatch) {
                    ctx.fillText(`✓ ${sAns || '---'} (+${state.exam?.part3_point ?? 0.5}đ)`, bx + bw / 2, by + bh / 2);
                } else {
                    ctx.fillText(`✗ ${sAns || 'Trống'} (Đ/A: ${kAns || '---'})`, bx + bw / 2, by + bh / 2);
                }
                ctx.restore();
            }
        }
    }

    const outUrl = canvas.toDataURL('image/jpeg', 0.90);
    canvas.width = 1;
    canvas.height = 1;
    return outUrl;
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
    const key = resolveKeyForCode(code);

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
            const isMatch = isP3Match(sAns, kAns);

            if (rawResult.p3m && rawResult.p3m[q]) {
                for (let col = 0; col < 4; col++) {
                    const v = rawResult.p3m[q][col];
                    if (v >= 0 && tpl.p3[q][col] && tpl.p3[q][col][v]) {
                        const pt = tpl.p3[q][col][v];
                        marks += ring(pt, isMatch ? '#10b981' : '#ef4444', 3.5, 13);
                    }
                }
            }

            // Vẽ nhãn kết quả câu trả lời ngắn dưới đáy mỗi câu trong SVG Overlay
            let qMaxY = -Infinity, qMinX = Infinity, qMaxX = -Infinity;
            if (tpl.p3[q]) {
                tpl.p3[q].forEach(colPts => {
                    if (Array.isArray(colPts)) {
                        colPts.forEach(pt => {
                            if (pt) {
                                if (pt[0] < qMinX) qMinX = pt[0];
                                if (pt[0] > qMaxX) qMaxX = pt[0];
                                if (pt[1] > qMaxY) qMaxY = pt[1];
                            }
                        });
                    }
                });
            }

            if (qMaxY > -Infinity) {
                const centerX = ((qMinX + qMaxX) / 2) * 100;
                const bx = Math.round(centerX - 75);
                const by = Math.max(Math.round(qMaxY * 100 + 35), 2205);
                const bg = isMatch ? '#ecfdf5' : '#fef2f2';
                const stroke = isMatch ? '#10b981' : '#ef4444';
                const textCol = isMatch ? '#065f46' : '#991b1b';
                const label = isMatch ? `✓ ${sAns || '---'} (+${state.exam?.part3_point ?? 0.5}đ)` : `✗ ${sAns || 'Trống'} (Đ/A: ${kAns || '---'})`;
                marks += `
                    <g>
                        <rect x="${bx}" y="${by}" width="150" height="34" rx="8" fill="${bg}" stroke="${stroke}" stroke-width="1.5" />
                        <text x="${centerX}" y="${by + 22}" text-anchor="middle" font-size="12" font-weight="bold" fill="${textCol}" font-family="system-ui, sans-serif">${label}</text>
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

async function ensureSubmissionStampedHeaderUpgraded(sub, forceRestamp = false) {
    if (!sub) return null;

    // Luôn đối chiếu lại tên và lớp từ danh bạ học sinh theo SBD
    if (sub.student_no) {
        const matched = findStudentBySbd(sub.student_no, sub.examId || state.exam?.id, sub.class_id || state.exam?.classId);
        if (matched && matched.name) {
            const curName = (sub.student_name || '').trim();
            const isPlaceholder = !curName || curName.startsWith('Học sinh #') || curName.startsWith('Phiếu ') || curName.startsWith('Học sinh SBD');
            if (isPlaceholder || curName !== matched.name) {
                sub.student_name = matched.name;
                forceRestamp = true;
            }
            if (!sub.class_name && matched.class_name) {
                sub.class_name = matched.class_name;
                forceRestamp = true;
            }
            if (!sub.class_id && matched.class_id) sub.class_id = matched.class_id;
        }
    }

    // Kiểm tra xem header hiện tại có khớp tên học sinh thực tế hay không
    if (sub.student_name && !sub.student_name.startsWith('Học sinh #')) {
        if (sub._stampedStudentName && sub._stampedStudentName !== sub.student_name) {
            forceRestamp = true;
        } else if (!sub._stampedStudentName) {
            // Phiếu cũ chưa được ghi nhận _stampedStudentName -> re-stamp 1 lần để cập nhật tên thật lên ảnh
            forceRestamp = true;
        }
    }

    if (!forceRestamp && !sub._needsRestamp && sub._headerV25Upgraded && (sub.stamped_image || sub.image_data)) {
        return sub.stamped_image || sub.image_data;
    }

    // Nếu cần restamp lại (do đổi tên học sinh, lớp, hoặc chưa có _headerV25Upgraded)
    if (forceRestamp || sub._needsRestamp || !sub._headerV25Upgraded) {
        sub._needsRestamp = false;
        sub._headerV25Upgraded = true;
        const restamped = await reStampSubmission(sub);
        if (restamped) {
            const imgEl = document.getElementById('resRectifiedImg');
            if (imgEl && state.lastSubmission?.id === sub.id) {
                imgEl.src = restamped;
            }
            if (state.exam?.id) {
                try {
                    localStorage.setItem(`omr_submissions_${state.exam.id}`, JSON.stringify(state.submissions));
                } catch (_) {}
            }
            return restamped;
        }
    }

    return sub.stamped_image || sub.image_data || null;
}

window.downloadGradedSheet = async () => {
    const sub = state.lastSubmission;
    if (!sub) return;
    if (!sub.image_data && !sub.stamped_image && (sub.telegram_photo_url || sub.telegram_file_id)) {
        const fresh = await resolveTelegramPhotoDirectUrl(sub);
        if (fresh) sub.stamped_image = fresh;
    }
    if (!sub.image_data && !sub.stamped_image) {
        Swal.fire('Thông báo', 'Chưa có ảnh bài thi để tải về.', 'info');
        return;
    }
    const imgUrl = (await ensureSubmissionStampedHeaderUpgraded(sub)) || sub.stamped_image || sub.image_data;
    const a = document.createElement('a');
    a.href = imgUrl;
    const sbd = sub.student_no || 'khong_sbd';
    const name = (sub.student_name || 'thi_sinh').replace(/\s+/g, '_');
    const score = (typeof sub.score === 'number' ? sub.score.toFixed(2) : sub.score);
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
    } else {
        await reStampSubmission(state.lastSubmission);
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

function saveSubmissionsToLocalSafe(examId, subs) {
    if (!examId) return;
    try {
        // Loại bỏ sạch toàn bộ các chuỗi ảnh base64 lớn (image_data, stamped_image, clean_image, raw_warped_image)
        // Các ảnh này đã được lưu bền vững trong IndexedDB và Cloud
        const liteSubs = (subs || []).map(s => {
            const { image_data, stamped_image, clean_image, raw_warped_image, ...rest } = s;
            return rest;
        });
        localStorage.setItem(`omr_submissions_${examId}`, JSON.stringify(liteSubs));
    } catch (quotaErr) {
        console.warn("localStorage quota exceeded for submissions metadata:", quotaErr);
    }
}

async function saveSubmissionToStore(sub) {
    const rawImg = sub.stamped_image || sub.image_data;
    if (rawImg) {
        if (state.memoryImages) {
            state.memoryImages[sub.id] = rawImg;
            const imgKeys = Object.keys(state.memoryImages);
            if (imgKeys.length > 25) {
                delete state.memoryImages[imgKeys[0]];
            }
        }
        saveOmrImageToDb(sub.id, rawImg);
    }

    // Không bao giờ ghi đè khi trùng SBD! Giữ nguyên 100% bài nộp, chỉ cập nhật khi trùng đúng sub.id
    const existingIdx = state.submissions.findIndex(s => s.id === sub.id);
    if (existingIdx !== -1) {
        state.submissions[existingIdx] = sub;
    } else {
        state.submissions.push(sub);
    }

    if (state.gradedCountsByExam && sub.examId) {
        state.gradedCountsByExam[sub.examId] = state.submissions.length;
    }

    // Save to localStorage safely & update UI stats immediately (zero latency)
    saveSubmissionsToLocalSafe(sub.examId, state.submissions);
    updateOverviewStats();

    // Save to Firestore omr_submissions (lightweight metadata) & LMS results (with compressed stampedImage)
    if (state.teacherUid) {
        try {
            const { image_data, stamped_image, clean_image, raw_warped_image, ...cloudMeta } = sub;
            await setDoc(doc(db, "omr_submissions", sub.id), cloudMeta);
        } catch(e) {
            console.warn("Lưu Firestore omr_submissions thất bại, đã lưu localStorage:", e);
        }

        // Tự động đồng bộ sang bảng "results" của Lớp học LMS để giáo viên & PHHS xem trực tuyến
        try {
            await syncSubmissionToLmsResultsCollection(sub);
        } catch(syncErr) {
            console.warn("Đồng bộ sang LMS results:", syncErr);
        }
    }
}

function buildLmsAnswersObjectFromOmr(sub) {
    const lmsAnswers = {};
    const qList = Array.isArray(state.exam?.questions) ? state.exam.questions : [];
    if (qList.length > 0) {
        let mcIdx = 0, tfIdx = 0, shortIdx = 0;
        qList.forEach((q, idx) => {
            if (!q) return;
            if (q.type === 'mc' || !q.type) {
                const ch = (sub.answers || '')[mcIdx] || '';
                const optIdx = ['A', 'B', 'C', 'D'].indexOf(ch);
                if (optIdx !== -1) lmsAnswers[idx] = optIdx;
                mcIdx++;
            } else if (q.type === 'tf') {
                const chunk = (Array.isArray(sub.part2) && sub.part2[tfIdx]) ? sub.part2[tfIdx] : '----';
                const tfObj = {};
                for (let r = 0; r < 4; r++) {
                    const c = (chunk[r] || '-').toUpperCase().replace('D', 'Đ');
                    if (c === 'Đ') tfObj[r] = true;
                    else if (c === 'S') tfObj[r] = false;
                }
                lmsAnswers[idx] = tfObj;
                tfIdx++;
            } else if (q.type === 'short') {
                const val = Array.isArray(sub.part3) ? (sub.part3[shortIdx] || '') : '';
                lmsAnswers[idx] = String(val).trim();
                shortIdx++;
            }
        });
    } else {
        // Fallback nếu đề không có danh sách câu hỏi chi tiết
        const p1 = sub.answers || '';
        for (let i = 0; i < p1.length; i++) {
            const optIdx = ['A', 'B', 'C', 'D'].indexOf(p1[i]);
            if (optIdx !== -1) lmsAnswers[i] = optIdx;
        }
    }
    return lmsAnswers;
}

async function compressStampedImageForCloud(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return '';
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const maxW = 900;
                const scale = Math.min(1, maxW / (img.naturalWidth || 900));
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round((img.naturalWidth || 900) * scale));
                c.height = Math.max(1, Math.round((img.naturalHeight || 1280) * scale));
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, c.width, c.height);
                const res = c.toDataURL('image/jpeg', 0.68);
                c.width = 1;
                c.height = 1;
                try { img.src = ''; } catch(_) {}
                resolve(res);
            } catch (e) {
                resolve('');
            }
        };
        img.onerror = () => {
            try { img.src = ''; } catch(_) {}
            resolve('');
        };
        img.src = dataUrl;
    });
}

async function syncSubmissionToLmsResultsCollection(sub) {
    if (!state.exam) return null;
    const sbdSafe = (sub.student_no || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const subIdSafe = (sub.id || '').replace(/[^a-zA-Z0-9_-]/g, '') || ('sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
    const resultDocId = `omr_${state.exam.id}_${subIdSafe}`;
    const classId = sub.class_id || state.exam.classId || '';
    const className = sub.class_name || state.exam.className || '';
    const studentId = sub.student_uid || (sbdSafe ? `omr_sbd_${sbdSafe}` : sub.id);
    const studentName = sub.student_name || (sub.student_no ? `Học sinh SBD ${sub.student_no}` : 'Thí sinh OMR');
    const totalQ = (state.exam.question_count || 12) + (state.exam.part2_count || 4) + (state.exam.part3_count || 6);

    const compressedStamped = await compressStampedImageForCloud(sub.stamped_image || sub.image_data || '');

    const resultPayload = {
        id: resultDocId,
        submissionId: sub.id,
        examId: state.exam.id,
        examTitle: state.exam.name || 'Bài thi OMR',
        teacherId: state.teacherUid,
        classId,
        className,
        studentId,
        studentName,
        studentEmail: sub.student_email || '',
        studentNo: sub.student_no || '',
        examCode: sub.code || state.exam.omrCode || '101',
        score: Number(sub.score) || 0,
        part1Score: Number(sub.part1_score) || 0,
        part2Score: Number(sub.part2_score) || 0,
        part3Score: Number(sub.part3_score) || 0,
        totalQuestions: totalQ,
        answers: buildLmsAnswersObjectFromOmr(sub),
        omrPart1: sub.answers || '',
        omrPart2: sub.part2 || [],
        omrPart3: sub.part3 || [],
        stampedImage: compressedStamped || '',
        nameImage: sub.name_image || '',
        telegramPhotoUrl: sub.telegram_photo_url || '',
        gradingSource: 'omr',
        submissionMode: 'offline_omr',
        gradedAt: new Date().toISOString(),
        submittedAt: sub.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, "results", resultDocId), resultPayload);

    // Nếu đề thi là đề LMS và được chấm cho một Lớp học cụ thể, đảm bảo lớp đó được gắn vào allowedClassIds của đề để Học sinh & Giáo viên thấy bài Offline trong Lớp!
    if (classId && state.exam.isLmsExam) {
        try {
            const currentAllowed = Array.isArray(state.exam.allowedClassIds) ? [...state.exam.allowedClassIds] : [];
            if (!currentAllowed.includes(classId)) {
                currentAllowed.push(classId);
                state.exam.allowedClassIds = currentAllowed;
                await updateDoc(doc(db, "exams", state.exam.id), {
                    allowedClassIds: currentAllowed,
                    hasOmrOfflineGrading: true,
                    omrCode: state.exam.omrCode || computeOmrExam4DigitCode(state.exam.id)
                });
            }
        } catch (linkErr) {
            console.warn("Cập nhật allowedClassIds cho đề OMR:", linkErr);
        }
    }

    sub.lmsResultId = resultDocId;
    return resultDocId;
}

// Đồng bộ hàng loạt bài chấm lên Cloud theo nhóm song song có giới hạn (concurrency 3)
async function syncBatchSubmissionsToCloud(submissions) {
    if (!state.teacherUid || !submissions || submissions.length === 0) return;
    const queue = [...submissions];
    const concurrency = 3;
    let completed = 0;

    async function worker() {
        while (queue.length > 0) {
            const sub = queue.shift();
            if (!sub) continue;
            try {
                const { image_data, stamped_image, clean_image, raw_warped_image, ...cloudMeta } = sub;
                await setDoc(doc(db, "omr_submissions", sub.id), cloudMeta);
                await syncSubmissionToLmsResultsCollection(sub);
            } catch (err) {
                console.warn("Lỗi sync cloud bài chấm hàng loạt:", sub.id, err);
            }
            completed++;
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
        workers.push(worker());
    }
    Promise.all(workers).then(() => {
        console.log(`Đã đồng bộ xong toàn bộ ${completed} bài chấm lên LMS cloud!`);
    }).catch(e => {
        console.warn("Batch sync error:", e);
    });
}

// ========================================================
// SINGLETON AUDIO CONTEXT & CHIME ENGINE (KHÔNG LẶP LẠI TẠO AUDIO CONTEXT)
// ========================================================
let sharedAudioCtx = null;
function getSharedAudioContext() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
            sharedAudioCtx = new AudioCtx();
        }
        if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume().catch(() => {});
        }
        return sharedAudioCtx;
    } catch (e) {
        return null;
    }
}

function playBeepSound() {
    try {
        if (navigator.vibrate) {
            try { navigator.vibrate([70, 45, 110]); } catch(e) {}
        }
        const ctx = getSharedAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        // Note 1: A5 (880 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(880, now);
        gain1.gain.setValueAtTime(0.22, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc1.start(now);
        osc1.stop(now + 0.12);
        osc1.onended = () => {
            try { osc1.disconnect(); gain1.disconnect(); } catch (_) {}
        };

        // Note 2: E6 (1318.5 Hz) — Cheerful "Ting-Tinh!" completion chime
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1318.5, now + 0.10);
        gain2.gain.setValueAtTime(0.25, now + 0.10);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc2.start(now + 0.10);
        osc2.stop(now + 0.35);
        osc2.onended = () => {
            try { osc2.disconnect(); gain2.disconnect(); } catch (_) {}
        };
    } catch(e) {}
}

function playBatchSuccessChime() {
    try {
        if (navigator.vibrate) {
            try { navigator.vibrate([80, 50, 80, 50, 160]); } catch(e) {}
        }
        const ctx = getSharedAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const notes = [
            { f: 587.33, t: 0, d: 0.10 },    // D5
            { f: 739.99, t: 0.08, d: 0.12 }, // F#5
            { f: 880.00, t: 0.16, d: 0.14 }, // A5
            { f: 1174.66, t: 0.26, d: 0.40 } // D6
        ];
        notes.forEach(({ f, t, d }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now + t);
            gain.gain.setValueAtTime(0.24, now + t);
            gain.gain.exponentialRampToValueAtTime(0.001, now + t + d);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + t);
            osc.stop(now + t + d);
            osc.onended = () => {
                try { osc.disconnect(); gain.disconnect(); } catch (_) {}
            };
        });
    } catch (_) {}
}

// ========================================================
// 5. LIVE FULLSCREEN CAMERA STREAM CONTROLLER & CONTINUOUS AUTO-SCANNER
// ========================================================
state.cameraZoom = 0.5;
state.userSelectedCamera = false;
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
        guide.classList.remove('aspect-[100/138]', 'landscape:aspect-[138/100]');
        guide.classList.add('aspect-[138/100]');
        if (lbl) lbl.textContent = 'Khung ngang';
        showCameraHUDMessage('📐 Khung ngang (Phiếu 40 câu / Quét ngang)');
    } else {
        guide.classList.remove('aspect-[138/100]');
        guide.classList.add('aspect-[100/138]', 'landscape:aspect-[138/100]');
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

// Tính toán chính xác vùng hiển thị thực tế (object-cover) trên màn hình và tọa độ 4 ô vuông định vị góc
function getVideoViewportInfo(video, guide) {
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 960;
    const vr = video.getBoundingClientRect();
    if (!vr.width || !vr.height) {
        return { sx: 0, sy: 0, sw: vw, sh: vh, guideHints: null, guideCrop: null };
    }
    const objFit = window.getComputedStyle(video).objectFit || 'cover';
    const scale = objFit === 'cover'
        ? Math.max(vr.width / vw, vr.height / vh)
        : Math.min(vr.width / vw, vr.height / vh);
    const drawW = vw * scale;
    const drawH = vh * scale;
    const offsetX = (vr.width - drawW) / 2;
    const offsetY = (vr.height - drawH) / 2;

    // Vùng khung hình hiển thị trên màn hình (loại bỏ phần rìa bàn/ghế bị khuất bởi object-cover)
    const vx = Math.max(0, -offsetX / scale);
    const vy = Math.max(0, -offsetY / scale);
    const vsw = Math.max(1, Math.min(vw - vx, vr.width / scale));
    const vsh = Math.max(1, Math.min(vh - vy, vr.height / scale));

    let guideHints = null;
    let guideCrop = null;
    if (guide) {
        const gr = guide.getBoundingClientRect();
        if (gr.width > 0 && gr.height > 0) {
            const gx0 = (gr.left - vr.left) / vr.width;
            const gy0 = (gr.top - vr.top) / vr.height;
            const gx1 = (gr.right - vr.left) / vr.width;
            const gy1 = (gr.bottom - vr.top) / vr.height;
            guideHints = [
                [gx0, gy0],
                [gx1, gy0],
                [gx1, gy1],
                [gx0, gy1]
            ];

            let gsx = (gr.left - vr.left - offsetX) / scale;
            let gsy = (gr.top - vr.top - offsetY) / scale;
            let gsw = gr.width / scale;
            let gsh = gr.height / scale;
            const padX = gsw * 0.14;
            const padY = gsh * 0.14;
            gsx = Math.max(0, gsx - padX);
            gsy = Math.max(0, gsy - padY);
            gsw = Math.max(1, Math.min(vw - gsx, gsw + padX * 2));
            gsh = Math.max(1, Math.min(vh - gsy, gsh + padY * 2));
            guideCrop = { sx: gsx, sy: gsy, sw: gsw, sh: gsh };
        }
    }
    return { sx: vx, sy: vy, sw: vsw, sh: vsh, guideHints, guideCrop };
}

function drawVideoRegionToCanvas(video, sx, sy, sw, sh, maxDim = 980) {
    const scale = Math.min(1, maxDim / Math.max(sw || 1, sh || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function startAutoScanLoop() {
    stopAutoScanLoop();
    if (!state.autoScanEnabled) return;

    const intervalMs = state.autoScanSpeed === 'fast' ? 320 : (state.autoScanSpeed === 'slow' ? 750 : 460);

    autoScanInterval = setInterval(async () => {
        const video = document.getElementById('cameraVideo');
        const guide = document.getElementById('cameraA4Guide');
        const sheetArea = document.getElementById('scanCameraArea');
        const resSheet = document.getElementById('cameraResultSheet');

        // Only scan if camera is open and video is actively streaming
        if (!video || !state.currentCameraStream || sheetArea?.classList.contains('hidden')) return;
        if (state.isAutoScanning || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return;

        // Nghỉ giữa các lần quét để giáo viên kịp lấy phiếu cũ ra và đưa phiếu mới vào
        if (Date.now() - lastAutoScanTime < state.autoScanCooldown) {
            return;
        }

        try {
            state.isAutoScanning = true;

            // Cắt đúng vùng khung ngắm đang hiển thị trên màn hình (maxDim 880px <= 1000px để không bị thuNho chia đôi)
            const info = getVideoViewportInfo(video, guide);
            const testCanvas = drawVideoRegionToCanvas(video, info.sx, info.sy, info.sw, info.sh, 880);
            const tCtx = testCanvas.getContext('2d', { willReadFrequently: true });
            const gray = window.OMR.xam(tCtx.getImageData(0, 0, testCanvas.width, testCanvas.height));

            const tplKey = state.exam?.sheet_template || 'qmcv1239';
            const tpl = (window.MAU && window.MAU[tplKey]) ? window.MAU[tplKey] : window.MAU.qmcv1239;

            // Tìm 4 mốc đen góc phiếu ưu tiên sát 4 ô vuông định vị
            let found = null;
            let matchedTpl = tpl;
            if (window.findQMCorners) {
                found = window.findQMCorners(gray, tpl, info.guideHints);
                // Nếu chưa tìm thấy theo mẫu đang chọn, tự động thử các mẫu phiếu phổ biến khác (qmcv1239, TNMaker, BGD...)
                if (!found && window.MAU) {
                    const fallbackKeys = ['qmcv1239', 'bgd2025original', 'tnmaker40', 'phutho'].filter(k => k !== tplKey);
                    for (const fbKey of fallbackKeys) {
                        if (window.MAU[fbKey]) {
                            found = window.findQMCorners(gray, window.MAU[fbKey], info.guideHints);
                            if (found) { matchedTpl = window.MAU[fbKey]; break; }
                        }
                    }
                }
            }

            // Kiểm định nghiêm ngặt tính hợp lệ của phiếu thi trước khi tự động quét:
            // 1. Phải có đủ 4 góc đúng trật tự hình học (TL, TR, BR, BL)
            // 2. Kích thước phiếu phải chiếm tối thiểu 40% khung hình ngắm (không bắt vật nhỏ lặt vặt)
            // 3. Tỉ lệ khung hình (Aspect Ratio) phải chuẩn xác theo mẫu đứng hoặc ngang
            let isValidSheet = false;
            if (found && found.corners && found.corners.length === 4) {
                const c = found.corners;
                const [tl, tr, br, bl] = c;
                if (tr.x > tl.x && br.x > bl.x && bl.y > tl.y && br.y > tr.y) {
                    const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
                    const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
                    const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
                    const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);
                    const avgW = (topW + botW) / 2;
                    const avgH = (leftH + rightH) / 2;
                    const minDim = Math.min(testCanvas.width, testCanvas.height);

                    const isBigEnough = avgW > minDim * 0.40 && avgH > minDim * 0.40;
                    const ratio = avgH / Math.max(1, avgW);
                    const isTplLandscape = (matchedTpl?.khung?.[2] || 0) > (matchedTpl?.khung?.[3] || 0);
                    const isRatioValid = isTplLandscape 
                        ? (ratio >= 0.50 && ratio <= 0.92) 
                        : (ratio >= 1.10 && ratio <= 1.75);

                    const soMoc = found.refined?.soMoc || 0;
                    if (isBigEnough && isRatioValid && (soMoc >= 5 || (soMoc >= 4 && isBigEnough))) {
                        isValidSheet = true;
                    }
                }
            }

            if (isValidSheet) {
                // Kiểm tra độ ổn định vị trí góc giữa các khung hình liên tiếp để tránh rung tay
                const currCorners = found.corners;
                const prev = state._lastDetectedCorners;
                let isStable = false;
                if (prev && prev.length === 4) {
                    let maxDrift = 0;
                    for (let i = 0; i < 4; i++) {
                        const d = Math.hypot(currCorners[i].x - prev[i].x, currCorners[i].y - prev[i].y);
                        if (d > maxDrift) maxDrift = d;
                    }
                    if (maxDrift < 40) isStable = true;
                }
                state._lastDetectedCorners = currCorners;

                if (isStable) {
                    state.consecutiveCornerDetections = (state.consecutiveCornerDetections || 0) + 1;
                } else {
                    state.consecutiveCornerDetections = 1;
                }

                // Làm sáng 4 ô vuông định vị màu xanh ngọc
                document.querySelectorAll('.camera-corner-bracket').forEach(b => {
                    b.classList.add('detected');
                });

                const statusText = document.getElementById('cameraStatusText');
                if (statusText) {
                    const soMoc = found.refined?.soMoc || 4;
                    statusText.innerHTML = `<span class="text-emerald-400 font-extrabold">✓ Đã khớp mẫu phiếu (${soMoc} mốc chuẩn)! Đang giữ yên để chụp...</span>`;
                }

                // Yêu cầu tối thiểu 2 khung hình ổn định liên tiếp (chế độ chậm: 3)
                const reqFrames = state.autoScanSpeed === 'slow' ? 3 : 2;
                if (state.consecutiveCornerDetections >= reqFrames) {
                    state.consecutiveCornerDetections = 0;
                    state._lastDetectedCorners = null;
                    lastAutoScanTime = Date.now();
                    await window.captureCameraFrame({
                        preCaptured: {
                            canvas: testCanvas,
                            gray,
                            found,
                            guideHints: info.guideHints
                        }
                    });
                }
            } else {
                state.consecutiveCornerDetections = 0;
                state._lastDetectedCorners = null;
                document.querySelectorAll('.camera-corner-bracket').forEach(b => {
                    b.classList.remove('detected');
                });
                const statusText = document.getElementById('cameraStatusText');
                if (statusText && !sheetArea?.classList.contains('hidden')) {
                    statusText.innerHTML = '<span>Hướng camera vuông góc vào phiếu thi để quét tự động</span>';
                }
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
        const facing = state.currentFacingMode || 'environment';
        const devConstraint = state.currentCameraDeviceId ? { deviceId: { ideal: state.currentCameraDeviceId } } : null;
        const attempts = [];
        if (devConstraint) {
            attempts.push(
                { ...devConstraint, width: { ideal: 2560 }, height: { ideal: 1920 }, aspectRatio: { ideal: 4/3 } },
                { ...devConstraint, width: { ideal: 1920 }, height: { ideal: 1440 }, aspectRatio: { ideal: 4/3 } },
                { ...devConstraint, width: { ideal: 1280 }, height: { ideal: 960 } },
                { ...devConstraint }
            );
        }
        attempts.push(
            { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 }, aspectRatio: { ideal: 4/3 } },
            { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 }, aspectRatio: { ideal: 4/3 } },
            { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
            { facingMode: { ideal: facing } },
            true
        );

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

        // Bind immediate touch & pointerdown response for mobile buttons
        setupCameraControlsTouchListeners();

        // Enumerate devices once permission is granted
        await getAvailableCameras();

        // Ưu tiên mặc định Camera 0.5x (Góc siêu rộng) khi mở camera
        if (!state.userSelectedCamera && state.ultraWideCamera && state.currentCameraDeviceId !== state.ultraWideCamera.deviceId) {
            state.currentCameraDeviceId = state.ultraWideCamera.deviceId;
            state.activeCameraIndex = state.backCameras.findIndex(c => c.deviceId === state.ultraWideCamera.deviceId);
            console.log("Tự động chuyển sang Camera 0.5x góc siêu rộng làm mặc định:", state.ultraWideCamera.label);
            return window.startCameraStream();
        }

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
    state.userSelectedCamera = false;
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

function setupCameraControlsTouchListeners() {
    const shutter = document.getElementById('btnShutter');
    const cycle = document.getElementById('btnCycleCamera');
    
    if (shutter && !shutter._touchBound) {
        shutter._touchBound = true;
        shutter.onclick = (e) => {
            if (e) e.stopPropagation();
            window.captureCameraFrame();
        };
    }

    if (cycle && !cycle._touchBound) {
        cycle._touchBound = true;
        cycle.onclick = (e) => {
            if (e) e.stopPropagation();
            window.cycleBackCamera();
        };
    }
}

window.cycleBackCamera = async () => {
    if (state.isCyclingCamera) return;
    state.isCyclingCamera = true;
    try {
        if (state.backCameras && state.backCameras.length > 1) {
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
            state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
            state.currentCameraDeviceId = null;
            const lbl = state.currentFacingMode === 'user' ? 'Camera trước' : 'Camera sau';
            showCameraHUDMessage(`<i class="fa-solid fa-camera-rotate text-emerald-400"></i> Đang đổi: ${lbl}`);
            await window.startCameraStream();
        }
    } catch(err) {
        console.warn("Cycle camera error:", err);
        showCameraHUDMessage(`<i class="fa-solid fa-triangle-exclamation text-amber-400"></i> Không thể chuyển camera`);
    } finally {
        state.isCyclingCamera = false;
    }
};

window.switchCameraLens = window.cycleBackCamera;

window.setCameraZoom = async (val) => {
    state.userSelectedCamera = true;
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

function triggerCameraGradedCelebration(sub) {
    const splash = document.getElementById('cameraSuccessSplash');
    const scoreEl = document.getElementById('cameraSuccessScore');
    const metaEl = document.getElementById('cameraSuccessMeta');
    const countBadge = document.getElementById('cameraSuccessCountBadge');

    const totalNum = state.submissions.length || 1;
    const scoreStr = (typeof sub.score === 'number' ? sub.score.toFixed(2) : sub.score) + ' đ';
    const studentLabel = sub.student_name || (sub.student_no ? `SBD ${sub.student_no}` : 'Thí sinh');

    if (countBadge) countBadge.textContent = `✓ ĐÃ CHẤM XONG BÀI #${totalNum}!`;
    if (scoreEl) scoreEl.textContent = scoreStr;
    if (metaEl) metaEl.textContent = `${studentLabel} · Mã đề: ${sub.code || '---'}`;

    if (splash) {
        clearTimeout(splash._hideTimer);
        splash.classList.remove('hidden');
        splash._hideTimer = setTimeout(() => {
            splash.classList.add('hidden');
        }, 1500);
    }
}

function showCameraResultSheet(sub) {
    const sheet = document.getElementById('cameraResultSheet');
    if (!sheet) return;

    const nameEl = document.getElementById('camResStudentName');
    const sbdEl = document.getElementById('camResSbd');
    const codeEl = document.getElementById('camResCode');
    const scoreEl = document.getElementById('camResScore');
    const breakdownEl = document.getElementById('camResPartBreakdown');
    const counterEl = document.getElementById('camSessionCounter');
    const promptEl = document.getElementById('camNextSheetPrompt');

    if (nameEl) nameEl.textContent = sub.student_name || 'Thí sinh (Tự động)';
    if (sbdEl) sbdEl.textContent = 'SBD: ' + (sub.student_no || '---');
    if (codeEl) codeEl.textContent = 'Mã: ' + (sub.code || '---');
    if (scoreEl) scoreEl.textContent = (typeof sub.score === 'number' ? sub.score.toFixed(2) : sub.score);
    if (breakdownEl) {
        breakdownEl.textContent = `P.I: ${sub.part1_score ?? 0}đ | P.II: ${sub.part2_score ?? 0}đ | P.III: ${sub.part3_score ?? 0}đ`;
    }
    if (counterEl) {
        counterEl.textContent = `Bài #${state.submissions.length || 1}`;
    }
    if (promptEl) {
        clearTimeout(promptEl._readyTimer);
        promptEl.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i> Đã lưu kết quả! Hãy rút phiếu ra và đưa phiếu mới vào...`;
        promptEl._readyTimer = setTimeout(() => {
            if (promptEl) {
                promptEl.innerHTML = `<i class="fa-solid fa-bolt text-amber-300 animate-pulse"></i> Sẵn sàng! Đưa 4 góc phiếu tiếp theo vào khung ngắm`;
            }
        }, Math.max(1200, (state.autoScanCooldown || 3500) - 400));
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
    lastAutoScanTime = 0; // Cho phép quét ngay bài mới khi bấm "Chấm tờ tiếp"
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

window.captureCameraFrame = async (opts = {}) => {
    if (state.isCapturingCamera) return;
    state.isCapturingCamera = true;
    try {
        const video = document.getElementById('cameraVideo');
        const guide = document.getElementById('cameraA4Guide');
        if (!video || !state.currentCameraStream) return;

        // 1. CHỤP ĐỒNG BỘ TỨC THỜI TẠI t = 0ms (trước khi người dùng hạ điện thoại xuống)
        const info = getVideoViewportInfo(video, guide);
        const candidates = [];

        if (opts && opts.preCaptured && opts.preCaptured.gray) {
            candidates.push({
                label: 'auto-locked',
                source: opts.preCaptured,
                options: { guideHints: opts.preCaptured.guideHints, preFound: opts.preCaptured.found }
            });
        }

        // Ưu tiên 1: Vùng khung ngắm hiển thị trên màn hình (960px <= 1000px để giữ nguyên độ nét 1:1)
        const viewportCanvas = drawVideoRegionToCanvas(video, info.sx, info.sy, info.sw, info.sh, 960);
        candidates.push({
            label: 'viewport',
            source: viewportCanvas,
            options: { guideHints: info.guideHints }
        });

        // Ưu tiên 2: Vùng cắt sát khung 4 ô định vị (#cameraA4Guide + 14% lề)
        if (info.guideCrop) {
            const gc = info.guideCrop;
            const guideCanvas = drawVideoRegionToCanvas(video, gc.sx, gc.sy, gc.sw, gc.sh, 960);
            candidates.push({
                label: 'guide-crop',
                source: guideCanvas,
                options: {}
            });
        }

        // Ưu tiên 3: Toàn khung cảm biến camera
        const fullCanvas = drawVideoRegionToCanvas(video, 0, 0, video.videoWidth || 1280, video.videoHeight || 960, 980);
        candidates.push({
            label: 'full-sensor',
            source: fullCanvas,
            options: {}
        });

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
            }, 110);
        }

        const statusBadge = document.getElementById('cameraScanStatus');
        const statusText = document.getElementById('cameraStatusText');
        if (statusBadge) {
            statusBadge.innerHTML = '<i class="fa-solid fa-bolt text-emerald-400"></i> Đang chấm tốc độ cao...';
            statusBadge.classList.remove('hidden', 'opacity-0');
        }
        if (statusText) {
            statusText.innerHTML = '<span class="text-emerald-300 font-bold"><i class="fa-solid fa-bolt"></i> Đang chấm phiếu...</span>';
        }

        let sub = null;
        let lastErr = null;
        for (const cand of candidates) {
            try {
                sub = await processSingleSheet(cand.source, cand.options);
                if (sub) break;
            } catch (err) {
                lastErr = err;
            }
        }
        if (!sub) {
            throw lastErr || new Error("Không tìm đủ 4 mốc đen góc phiếu!");
        }

        lastAutoScanTime = Date.now();
        document.querySelectorAll('.camera-corner-bracket').forEach(b => b.classList.add('detected'));

        if (statusBadge) {
            statusBadge.innerHTML = '<i class="fa-solid fa-check text-emerald-400"></i> Đã chấm xong!';
            setTimeout(() => statusBadge.classList.add('hidden'), 1800);
        }
        if (statusText) {
            statusText.innerHTML = `<span class="text-emerald-300 font-bold">✓ Đã chấm xong: ${(typeof sub.score === 'number' ? sub.score.toFixed(2) : sub.score)} điểm · Mời đưa phiếu tiếp theo vào!</span>`;
            setTimeout(() => {
                if (statusText) statusText.textContent = 'Canh 4 ô đen góc phiếu vào 4 góc khung ngắm để tự động chấm.';
            }, 3500);
        }
        triggerCameraGradedCelebration(sub);
        showCameraResultSheet(sub);
    } catch(err) {
        console.warn("Scan frame error:", err);
        document.querySelectorAll('.camera-corner-bracket').forEach(b => b.classList.remove('detected'));
        const statusBadge = document.getElementById('cameraScanStatus');
        const statusText = document.getElementById('cameraStatusText');
        if (statusBadge) {
            statusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i> Căn 4 góc đen chưa rõ, thử lại';
            statusBadge.classList.remove('hidden', 'opacity-0');
            setTimeout(() => statusBadge.classList.add('hidden'), 3000);
        }
        if (statusText) {
            statusText.innerHTML = '<span class="text-amber-300 font-bold">⚠️ Chưa nhận diện đủ 4 mốc đen. Hãy đưa 4 góc phiếu vào 4 ô vuông!</span>';
            setTimeout(() => {
                if (statusText) statusText.textContent = 'Canh 4 ô đen góc phiếu vào 4 góc khung ngắm để tự động chấm.';
            }, 3000);
        }
    } finally {
        state.isCapturingCamera = false;
    }
};

// ========================================================
// 6. RESULTS TABLE, MODAL & EXPORT
// ========================================================
window.renderResultsTable = () => {
    const tbody = document.getElementById('resultsTableBody');
    const label = document.getElementById('resultsCountLabel');
    if (!tbody) return;

    syncSubmissionClassFilterOptions();
    const sorted = getFilteredSortedSubmissions('table');

    if (label) label.textContent = `${sorted.length} / ${state.submissions.length} kết quả`;

    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-8 text-center text-slate-400 italic">Không tìm thấy kết quả nào phù hợp.</td></tr>`;
        return;
    }

    tbody.innerHTML = sorted.map((s, idx) => {
        let hasRealName = s.student_name && !s.student_name.startsWith('Học sinh #') && !s.student_name.startsWith('Phiếu ') && !s.student_name.startsWith('Học sinh SBD');
        if (!hasRealName && s.student_no) {
            const matched = findStudentBySbd(s.student_no, s.examId || state.exam?.id, s.class_id || state.exam?.classId);
            if (matched && matched.name) {
                s.student_name = matched.name;
                if (!s.class_name && matched.class_name) s.class_name = matched.class_name;
                hasRealName = true;
            }
        }
        const displayName = hasRealName ? s.student_name : (s.student_no ? `Học sinh #${s.student_no}` : `Phiếu chưa tên #${idx + 1}`);
        const dupeStatus = getSubmissionDuplicateStatus(s, sorted);
        const rowClass = dupeStatus
            ? dupeStatus.rowBg
            : 'hover:bg-slate-50/80 dark:hover:bg-slate-750 transition-colors';

        return `
        <tr class="${rowClass} transition-colors">
            <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
            <td class="p-3">
                <div class="flex flex-col items-start gap-1">
                    <span class="font-mono font-bold text-slate-800 dark:text-slate-100">${s.student_no || '---'}</span>
                    ${dupeStatus ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${dupeStatus.badgeBg}" title="Phát hiện ${dupeStatus.dupeCount} bài có cùng SBD ${s.student_no}">${dupeStatus.label}</span>` : ''}
                </div>
            </td>
            <td class="p-3">
                <div class="font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span>${displayName}</span>
                    ${s.class_name ? `<span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200/70 dark:border-emerald-800/60">${s.class_name}</span>` : ''}
                    ${s.name_image ? `<img src="${s.name_image}" class="h-5 max-w-[90px] object-contain border border-slate-200 dark:border-slate-700 rounded bg-white" title="Chữ viết tay gốc">` : ''}
                </div>
            </td>
            <td class="p-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">${s.code || '---'}</td>
            <td class="p-3 text-center font-mono text-slate-600 dark:text-slate-400 hidden md:table-cell">${(s.part1_score ?? 0).toFixed(2)}</td>
            <td class="p-3 text-center font-mono text-slate-600 dark:text-slate-400 hidden md:table-cell">${(s.part2_score ?? 0).toFixed(2)}</td>
            <td class="p-3 text-center font-mono text-slate-600 dark:text-slate-400 hidden md:table-cell">${(s.part3_score ?? 0).toFixed(2)}</td>
            <td class="p-3 text-center font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">${(s.score ?? 0).toFixed(2)}</td>
            <td class="p-3 text-center text-slate-400 text-[11px]">${new Date(s.createdAt).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit'})}</td>
            <td class="p-3 text-center">
                <div class="flex items-center justify-center gap-1.5">
                    ${(s.telegram_photo_url || s.telegram_file_id) ? `
                    <span class="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800/60" title="Đã lưu ảnh bài chấm an toàn">
                        <i class="fa-solid fa-circle-check text-sm"></i>
                    </span>` : ''}
                    <button type="button" onclick="window.quickAssignStudentToSubmission('${s.id}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer" title="Gán tên / SBD học sinh cho phiếu này">
                        <i class="fa-solid fa-user-pen text-xs text-emerald-600 dark:text-emerald-400"></i>
                    </button>
                    <button type="button" onclick="window.viewSubmissionDetail('${s.id}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer" title="Xem chi tiết phiếu chấm">
                        <i class="fa-solid fa-eye text-xs text-emerald-600 dark:text-emerald-400"></i>
                    </button>
                    <button type="button" onclick="window.downloadSubmissionById('${s.id}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer" title="Tải ảnh phiếu đã chấm">
                        <i class="fa-solid fa-download text-xs text-emerald-600 dark:text-emerald-400"></i>
                    </button>
                    <button type="button" onclick="window.openSendParentModal('${s.id}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer" title="Gửi kết quả & phiếu chấm cho Phụ huynh (PHHS)">
                        <i class="fa-solid fa-paper-plane text-xs text-emerald-600 dark:text-emerald-400"></i>
                    </button>
                    <button type="button" onclick="window.deleteSubmission('${s.id}')" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-rose-500 hover:text-rose-600 flex items-center justify-center transition-all active:scale-95 cursor-pointer" title="Xóa kết quả này">
                        <i class="fa-solid fa-trash text-xs"></i>
                    </button>
                </div>
            </td>
        </tr>
        `;
    }).join('');
};

window.viewSubmissionDetail = async (subId) => {
    const sub = state.submissions.find(s => s.id === subId);
    if (!sub) return;
    state.lastSubmission = sub;

    // Tự động đối chiếu lại tên học sinh & lớp từ danh sách lớp nếu SBD khớp
    if (sub.student_no) {
        const matched = findStudentBySbd(sub.student_no, sub.examId || state.exam?.id, sub.class_id || state.exam?.classId);
        if (matched && matched.name) {
            const curName = (sub.student_name || '').trim();
            const isPlaceholder = !curName || curName.startsWith('Học sinh #') || curName.startsWith('Phiếu ') || curName.startsWith('Học sinh SBD');
            if (isPlaceholder || curName !== matched.name) {
                sub.student_name = matched.name;
                sub._needsRestamp = true;
            }
            if (!sub.class_name && matched.class_name) {
                sub.class_name = matched.class_name;
                sub._needsRestamp = true;
            }
            if (!sub.class_id && matched.class_id) sub.class_id = matched.class_id;
            if (!sub.student_uid && matched.student_uid) sub.student_uid = matched.student_uid;
            if (!sub.student_email && matched.student_email) sub.student_email = matched.student_email;
        }
    }

    await ensureSubmissionStampedHeaderUpgraded(sub, sub._needsRestamp);
    window.switchTab('scan', false);

    // Ẩn upload area và danh sách các bài khác để giao diện cực kỳ gọn gàng
    const uploadArea = document.getElementById('scanUploadArea');
    const inlineCard = document.getElementById('scanInlineSubmissionsCard');
    if (uploadArea) uploadArea.classList.add('hidden');
    if (inlineCard) inlineCard.classList.add('hidden');

    // Đẩy lịch sử browser để vuốt cạnh viền / nút back trên điện thoại quay lại danh sách
    if (!window.history.state || window.history.state.view !== 'submission_detail') {
        window.history.pushState({ view: 'submission_detail', subId }, '');
    }

    // Hiển thị chi tiết bài chấm
    const tplKey = sub.template_key || state.exam?.sheet_template || 'qmcv1239';
    await displayLastResultInspector(sub, {
        template: (window.MAU && window.MAU[tplKey]) || window.MAU.qmcv1239,
        templateKey: tplKey,
        part1: sub.answers,
        code: sub.code
    });
};

window.closeSubmissionDetail = (fromHistory = false) => {
    const lastCard = document.getElementById('lastResultCard');
    const uploadArea = document.getElementById('scanUploadArea');
    const inlineCard = document.getElementById('scanInlineSubmissionsCard');

    if (lastCard) lastCard.classList.add('hidden');
    if (uploadArea) uploadArea.classList.remove('hidden');
    if (inlineCard) {
        inlineCard.classList.remove('hidden');
        inlineCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (!fromHistory && window.history.state && window.history.state.view === 'submission_detail') {
        window.history.back();
    }
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

    deleteOmrImageFromDb(subId);
    const targetSub = state.submissions.find(s => s.id === subId);
    state.submissions = state.submissions.filter(s => s.id !== subId);
    if (state.gradedCountsByExam && state.exam?.id) {
        state.gradedCountsByExam[state.exam.id] = state.submissions.length;
    }

    if (state.teacherUid) {
        try { await deleteDoc(doc(db, "omr_submissions", subId)); } catch(e) {}
        if (targetSub) {
            const sbdSafe = (targetSub.student_no || targetSub.id || '000').replace(/[^a-zA-Z0-9_-]/g, '');
            const resId = targetSub.lmsResultId || `omr_${state.exam?.id}_${sbdSafe}`;
            try { await deleteDoc(doc(db, "results", resId)); } catch(e) {}
        }
    }
    saveSubmissionsToLocalSafe(state.exam?.id, state.submissions);
    window.renderResultsTable();
    updateOverviewStats();
};

window.clearAllSubmissionsForCurrentExam = async () => {
    if (!state.submissions || state.submissions.length === 0) return;
    const count = state.submissions.length;
    const res = await Swal.fire({
        title: `Xóa toàn bộ ${count} kết quả chấm của bài thi này?`,
        text: 'Thao tác này sẽ làm trống danh sách điểm ngay lập tức và không thể hoàn tác!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa ngay tức thì',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#ef4444'
    });
    if (!res.isConfirmed) return;

    // 1. Sao chép danh sách bài cần xóa để xử lý ngầm
    const toDelete = [...state.submissions];
    const examId = state.exam?.id;

    // 2. Làm sạch UI & bộ nhớ NGAY LẬP TỨC (0ms latency)
    state.submissions = [];
    if (state.gradedCountsByExam && examId) {
        state.gradedCountsByExam[examId] = 0;
    }
    if (examId) {
        localStorage.removeItem(`omr_submissions_${examId}`);
    }
    if (state.memoryImages) state.memoryImages = {};
    document.getElementById('lastResultCard')?.classList.add('hidden');
    window.renderResultsTable();
    if (typeof renderInlineSubmissionsList === 'function') renderInlineSubmissionsList();
    updateOverviewStats();

    // 3. Thông báo thành công ngay tức thì
    Swal.fire({
        icon: 'success',
        title: 'Đã xóa toàn bộ bài chấm!',
        text: `Đã làm trống toàn bộ ${count} bài chấm thành công.`,
        timer: 1500,
        showConfirmButton: false
    });

    // 4. Thực hiện xóa trong cơ sở dữ liệu ngầm theo từng khối song song (chunked concurrency)
    (async () => {
        // Dọn dẹp IndexedDB
        toDelete.forEach(s => {
            deleteOmrImageFromDb(s.id).catch(() => {});
            deleteOmrImageFromDb(s.id + '_clean').catch(() => {});
        });

        // Xóa Firestore & Supabase theo batch 12 bài song song
        if (state.teacherUid && typeof db !== 'undefined' && examId) {
            const chunkSize = 12;
            for (let i = 0; i < toDelete.length; i += chunkSize) {
                const chunk = toDelete.slice(i, i + chunkSize);
                await Promise.allSettled(chunk.map(async (s) => {
                    try { await deleteDoc(doc(db, "omr_submissions", s.id)); } catch(_) {}
                    const subIdSafe = (s.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
                    const sbdSafe = (s.student_no || '').replace(/[^a-zA-Z0-9_-]/g, '');
                    const resId = s.lmsResultId || `omr_${examId}_${subIdSafe}`;
                    try { await deleteDoc(doc(db, "results", resId)); } catch(_) {}
                    if (sbdSafe) {
                        try { await deleteDoc(doc(db, "results", `omr_${examId}_${sbdSafe}`)); } catch(_) {}
                    }
                }));
            }
        }
    })().catch(err => console.warn("Lỗi xóa bài ngầm:", err));
};

window.exportResultsToExcel = () => {
    if (!Array.isArray(state.submissions) || state.submissions.length === 0) {
        Swal.fire('Thông báo', 'Chưa có kết quả nào để xuất file!', 'info');
        return;
    }

    const examName = state.exam?.name || 'Bài thi trắc nghiệm';
    const teacherName = state.user?.displayName || state.user?.name || 'Giáo viên';
    const examClass = state.exam?.className || 'Lớp OMR';

    // 1. Sắp xếp theo điểm giảm dần (nếu bằng điểm nhau thì xếp theo SBD)
    const sorted = [...state.submissions].sort((a, b) => {
        const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return String(a.student_no || '').localeCompare(String(b.student_no || ''), undefined, { numeric: true });
    });

    // 2. Tính thứ hạng thi cử chuẩn (Standard competition ranking: 1, 1, 3...)
    let currentRank = 1;
    const ranks = [];
    for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && (Number(sorted[i].score) || 0) < (Number(sorted[i - 1].score) || 0)) {
            currentRank = i + 1;
        }
        ranks.push(currentRank);
    }

    // 3. Thống kê điểm số
    const total = sorted.length;
    const avg = (sorted.reduce((acc, s) => acc + (Number(s.score) || 0), 0) / (total || 1)).toFixed(2);
    const max = total > 0 ? Math.max(...sorted.map(s => Number(s.score) || 0)).toFixed(2) : '0.00';
    const min = total > 0 ? Math.min(...sorted.map(s => Number(s.score) || 0)).toFixed(2) : '0.00';

    let dupSbdCount = 0;
    let dupSbdCodeCount = 0;
    sorted.forEach(s => {
        const d = getSubmissionDuplicateStatus(s, sorted);
        if (d.isSameSbdCode) dupSbdCodeCount++;
        else if (d.isSameSbd) dupSbdCount++;
    });

    // 4. Xây dựng nội dung file Excel (HTML Spreadsheet với đầy đủ styles, borders, màu nền và định dạng text)
    const rowsHtml = sorted.map((s, idx) => {
        const dupe = getSubmissionDuplicateStatus(s, sorted);
        let rowBg = '#FFFFFF';
        let textColor = '#0F172A';
        let note = '';

        if (dupe.isSameSbdCode) {
            rowBg = '#FFE4E6'; // Màu đỏ hồng nhạt cho trường hợp trùng cả SBD và Mã đề
            textColor = '#9F1239';
            note = 'Trùng cả SBD & Mã đề';
        } else if (dupe.isSameSbd) {
            rowBg = '#FEF3C7'; // Màu vàng cam nhạt cho trường hợp trùng SBD
            textColor = '#92400E';
            note = 'Trùng SBD';
        }

        const studentName = s.student_name || (s.student_no ? `Học sinh #${s.student_no}` : `Phiếu #${idx + 1}`);
        const className = s.class_name || examClass || '---';
        const scoreVal = (Number(s.score) || 0).toFixed(2);
        const rankVal = ranks[idx];

        return `
            <tr style="background-color: ${rowBg}; color: ${textColor}; height: 28px;">
                <td style="border: 1px solid #CBD5E1; text-align: center; font-weight: normal; vertical-align: middle;">${idx + 1}</td>
                <td style="border: 1px solid #CBD5E1; text-align: center; font-weight: bold; mso-number-format: '\\@'; vertical-align: middle;">${s.student_no || '---'}</td>
                <td style="border: 1px solid #CBD5E1; text-align: left; padding-left: 8px; font-weight: 500; vertical-align: middle;">${studentName}</td>
                <td style="border: 1px solid #CBD5E1; text-align: center; vertical-align: middle;">${className}</td>
                <td style="border: 1px solid #CBD5E1; text-align: center; font-weight: bold; vertical-align: middle;">${scoreVal}</td>
                <td style="border: 1px solid #CBD5E1; text-align: center; font-weight: bold; vertical-align: middle;">${rankVal}</td>
            </tr>
        `;
    }).join('');

    const excelHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <!--[if gte mso 9]>
            <xml>
                <x:ExcelWorkbook>
                    <x:ExcelWorksheets>
                        <x:ExcelWorksheet>
                            <x:Name>Bảng Điểm</x:Name>
                            <x:WorksheetOptions>
                                <x:DisplayGridlines/>
                            </x:WorksheetOptions>
                        </x:ExcelWorksheet>
                    </x:ExcelWorksheets>
                </x:ExcelWorkbook>
            </xml>
            <![endif]-->
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #0F172A; }
                table { border-collapse: collapse; width: 100%; }
                th, td { mso-style-parent: style0; }
            </style>
        </head>
        <body>
            <table>
                <!-- DÒNG TIÊU ĐỀ BÀI THI -->
                <tr>
                    <td colspan="6" style="text-align: center; font-size: 16pt; font-weight: bold; color: #0F172A; height: 40px; vertical-align: middle;">
                        BẢNG KẾT QUẢ CHẤM THI: ${(examName || 'OMR').toUpperCase()}
                    </td>
                </tr>
                <tr>
                    <td colspan="6" style="text-align: center; font-size: 10pt; color: #64748B; height: 24px; vertical-align: middle;">
                        Giáo viên: <b>${teacherName}</b> &nbsp;|&nbsp; Ngày xuất: <b>${new Date().toLocaleString('vi-VN')}</b>
                    </td>
                </tr>
                <tr><td colspan="6" style="height: 12px;"></td></tr>

                <!-- BẢNG THỐNG KÊ ĐIỂM -->
                <tr style="background-color: #F8FAFC; font-weight: bold; text-align: center;">
                    <th colspan="6" style="border: 1px solid #CBD5E1; background-color: #F1F5F9; font-size: 11pt; padding: 6px; text-align: left;">
                        📊 BẢNG THỐNG KÊ ĐIỂM SỐ
                    </th>
                </tr>
                <tr style="background-color: #F8FAFC; text-align: center; font-size: 10pt; height: 26px;">
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; width: 60px;">Tổng số bài</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; width: 100px;">Điểm trung bình</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; width: 220px;">Điểm cao nhất</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; width: 120px;">Điểm thấp nhất</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; width: 100px; background-color: #FEF3C7; color: #92400E;">Trùng SBD</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; width: 100px; background-color: #FFE4E6; color: #9F1239;">Trùng cả SBD &amp; Mã</td>
                </tr>
                <tr style="text-align: center; font-size: 11pt; height: 30px;">
                    <td style="border: 1px solid #CBD5E1; font-weight: bold;">${total}</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; color: #0284C7;">${avg}</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; color: #16A34A;">${max}</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; color: #DC2626;">${min}</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; background-color: ${dupSbdCount > 0 ? '#FEF3C7' : '#FFFFFF'}; color: ${dupSbdCount > 0 ? '#B45309' : '#64748B'};">${dupSbdCount}</td>
                    <td style="border: 1px solid #CBD5E1; font-weight: bold; background-color: ${dupSbdCodeCount > 0 ? '#FFE4E6' : '#FFFFFF'}; color: ${dupSbdCodeCount > 0 ? '#BE123C' : '#64748B'};">${dupSbdCodeCount}</td>
                </tr>
                <tr><td colspan="6" style="height: 16px;"></td></tr>

                <!-- DÒNG TIÊU ĐỀ CỦA BẢNG ĐIỂM (IN ĐẬM, ĐỔ NỀN XÁM NHẠT #E2E8F0, CÓ BO VIỀN) -->
                <tr style="background-color: #E2E8F0; font-weight: bold; text-align: center; height: 34px;">
                    <th style="border: 1px solid #94A3B8; padding: 8px 12px; width: 60px; vertical-align: middle;">STT</th>
                    <th style="border: 1px solid #94A3B8; padding: 8px 12px; width: 100px; vertical-align: middle;">SBD</th>
                    <th style="border: 1px solid #94A3B8; padding: 8px 12px; width: 220px; text-align: left; vertical-align: middle;">Họ và tên</th>
                    <th style="border: 1px solid #94A3B8; padding: 8px 12px; width: 120px; vertical-align: middle;">Lớp</th>
                    <th style="border: 1px solid #94A3B8; padding: 8px 12px; width: 100px; vertical-align: middle;">Điểm</th>
                    <th style="border: 1px solid #94A3B8; padding: 8px 12px; width: 100px; vertical-align: middle;">Thứ hạng</th>
                </tr>

                <!-- CÁC DÒNG DỮ LIỆU ĐÃ BO VIỀN VÀ BÔI MÀU CẢNH BÁO TRÙNG -->
                ${rowsHtml}
            </table>
        </body>
        </html>
    `;

    const blob = new Blob(['\uFEFF' + excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const cleanFileName = `Bang_diem_${(examName || 'Bai_thi').replace(/[\s/\\:*?"<>|]+/g, '_')}_${Date.now()}.xls`;
    link.download = cleanFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
};

// ========================================================
// 7. KEYS & BAREM TAB
// ========================================================
window.renderKeysTab = (preferredCode) => {
    if (!state.exam) return;
    const selector = document.getElementById('keyCodeSelector');
    
    // Hợp nhất toàn bộ mã đề từ cấu hình đề thi VÀ toàn bộ đáp án đã nạp vào state.keys
    const keyCodes = Object.keys(state.keys || {}).map(String);
    const examCodes = (Array.isArray(state.exam.codes) ? state.exam.codes : []).map(String);
    
    // Nếu đã nạp đáp án thực tế, ưu tiên bỏ các mã mặc định mẫu (101-104) nếu chúng không có đáp án thực
    const allCodesSet = new Set([...examCodes, ...keyCodes]);
    if (allCodesSet.size === 0) allCodesSet.add('101');
    const allCodes = Array.from(allCodesSet).filter(Boolean).sort();
    
    // Đồng bộ ngược lại vào state.exam.codes
    state.exam.codes = allCodes;

    if (selector) {
        selector.innerHTML = allCodes.map(c => `<option value="${c}">${c}</option>`).join('');
        if (preferredCode && allCodes.includes(String(preferredCode))) {
            selector.value = String(preferredCode);
        } else if (selector.value && allCodes.includes(selector.value)) {
            // Giữ nguyên mã đề đang chọn
        } else {
            selector.value = allCodes[0];
        }
    }
    const currentCode = selector?.value || allCodes[0] || '101';
    window.loadCodeKeyInputs(currentCode);
};

window.handleKeyExamCodeChange = (code) => {
    window.loadCodeKeyInputs(code);
};

window.loadCodeKeyInputs = (code) => {
    const key = state.keys[code] || { answers: '', part2: [], part3: [] };
    const bonusP1 = key.bonus_p1 || {};
    const bonusP2 = key.bonus_p2 || {};
    const bonusP3 = key.bonus_p3 || {};
    
    // Part 1 Grid
    const p1Cont = document.getElementById('part1KeyGrid');
    const qCount1 = state.exam?.question_count || 12;
    if (p1Cont) {
        p1Cont.innerHTML = Array.from({ length: qCount1 }, (_, i) => {
            const currentAns = (key.answers || '')[i] || '-';
            const isBonus = !!(bonusP1[i] || bonusP1[String(i)]);
            return `
                <div class="px-2 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-xl border ${isBonus ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-700'} flex items-center justify-between gap-1 transition-colors">
                    <span class="font-bold text-slate-600 dark:text-slate-300 text-xs shrink-0 whitespace-nowrap">Câu ${i + 1}</span>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <select data-p1="${i}" class="px-1.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold text-emerald-600 dark:text-emerald-400 outline-none text-xs w-11 text-center cursor-pointer">
                            <option value="-" ${currentAns==='-'?'selected':''}>-</option>
                            <option value="A" ${currentAns==='A'?'selected':''}>A</option>
                            <option value="B" ${currentAns==='B'?'selected':''}>B</option>
                            <option value="C" ${currentAns==='C'?'selected':''}>C</option>
                            <option value="D" ${currentAns==='D'?'selected':''}>D</option>
                        </select>
                        <input type="checkbox" data-bonus-p1="${i}" ${isBonus ? 'checked' : ''} onchange="this.closest('.rounded-xl').classList.toggle('border-amber-400', this.checked); this.closest('.rounded-xl').classList.toggle('bg-amber-50/50', this.checked)" title="Tích chọn để luôn cho điểm câu này (phòng khi đề sai/lỗi)" class="rounded text-amber-500 w-4 h-4 border-slate-300 dark:border-slate-600 focus:ring-0 cursor-pointer shrink-0">
                    </div>
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
            const isQBonus = !!(bonusP2[q] || bonusP2[String(q)]);
            return `
                <div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border ${isQBonus ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'} space-y-2">
                    <div class="flex items-center justify-between">
                        <b class="text-xs text-slate-700 dark:text-slate-200">Câu ${q + 1} (Đúng/Sai)</b>
                        <label class="inline-flex items-center gap-1 cursor-pointer select-none text-[11px] font-bold ${isQBonus ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 hover:text-amber-600'}" title="Tất cả học sinh đều được tính trọn điểm câu này">
                            <input type="checkbox" data-bonus-p2="${q}" ${isQBonus ? 'checked' : ''} onchange="this.closest('.p-3').classList.toggle('border-amber-400', this.checked)" class="rounded text-amber-500 w-3.5 h-3.5 border-slate-300 focus:ring-0">
                            <span>Cho điểm cả câu</span>
                        </label>
                    </div>
                    ${['a', 'b', 'c', 'd'].map((opt, r) => {
                        const val = currentChunk[r] || '-';
                        return `
                            <div class="flex items-center justify-between text-xs">
                                <span class="font-bold text-slate-500">Ý ${opt})</span>
                                <div class="inline-flex gap-1" data-p2-opt-row="${r}">
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
            const isBonus = !!(bonusP3[i] || bonusP3[String(i)]);
            return `
                <div class="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border ${isBonus ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'} space-y-1">
                    <div class="flex items-center justify-between">
                        <label class="block font-bold text-slate-500 text-xs">Câu ${i + 1}:</label>
                        <label class="inline-flex items-center gap-1 cursor-pointer select-none text-[10px] font-bold ${isBonus ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 hover:text-amber-600'}" title="Tất cả học sinh đều được tính trọn điểm câu này">
                            <input type="checkbox" data-bonus-p3="${i}" ${isBonus ? 'checked' : ''} onchange="this.closest('.p-2.5').classList.toggle('border-amber-400', this.checked)" class="rounded text-amber-500 w-3 h-3 border-slate-300 focus:ring-0">
                            <span>Cho điểm</span>
                        </label>
                    </div>
                    <input type="text" data-p3="${i}" value="${val}" placeholder="VD: -4,5" class="w-full px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold text-center outline-none text-xs">
                </div>
            `;
        }).join('');
    }
};



window.selectP2Btn = (btn, q, r, val) => {
    const parent = btn.parentElement;
    if (!parent) return;
    parent.querySelectorAll('.p2-btn').forEach(b => {
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
    const bonus_p1 = {};
    document.querySelectorAll('[data-p1]').forEach(sel => {
        p1Answers += sel.value || '-';
    });
    document.querySelectorAll('[data-bonus-p1]').forEach(cb => {
        const idx = parseInt(cb.dataset.bonusP1);
        if (cb.checked) bonus_p1[idx] = true;
    });

    // Read P2 (Chính xác từng ý a, b, c, d, không bị lệch do bắt nhầm label bonus)
    const p2Cards = document.getElementById('part2KeyGrid')?.children || [];
    let p2Chunks = [];
    const bonus_p2 = {};
    for (let q = 0; q < qCount2; q++) {
        const card = p2Cards[q];
        let chunk = '';
        if (card) {
            for (let r = 0; r < 4; r++) {
                const row = card.querySelector(`[data-p2-opt-row="${r}"]`);
                if (row) {
                    const active = row.querySelector('.bg-emerald-600, .bg-rose-600');
                    chunk += active ? active.textContent.trim() : '-';
                } else {
                    chunk += '-';
                }
            }
            const cb = card.querySelector('[data-bonus-p2]');
            if (cb && cb.checked) bonus_p2[q] = true;
        }
        p2Chunks.push(chunk || '----');
    }

    // Read P3
    let p3Answers = [];
    const bonus_p3 = {};
    document.querySelectorAll('[data-p3]').forEach(inp => {
        p3Answers.push(inp.value.trim());
    });
    document.querySelectorAll('[data-bonus-p3]').forEach(cb => {
        const idx = parseInt(cb.dataset.bonusP3);
        if (cb.checked) bonus_p3[idx] = true;
    });

    const keyObj = {
        id: `key_${state.exam.id}_${code}`,
        examId: state.exam.id,
        teacherId: state.teacherUid,
        code,
        answers: p1Answers,
        part2: p2Chunks,
        part3: p3Answers,
        bonus_p1,
        bonus_p2,
        bonus_p3,
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

    if (state.submissions && state.submissions.length > 0) {
        const reCalc = await Swal.fire({
            title: `Đã lưu đáp án mã đề ${code}!`,
            text: `Bài thi đang có ${state.submissions.length} bài chấm. Bạn có muốn tự động tính lại điểm và đóng dấu lại ảnh cho tất cả bài thi không?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Có, tính & đóng dấu lại',
            cancelButtonText: 'Không',
            confirmButtonColor: '#059669'
        });
        if (reCalc.isConfirmed) {
            await window.recalculateAllSubmissionsScore();
            return;
        }
    }

    Swal.fire('Thành công', `Đã lưu đáp án cho mã đề ${code}!`, 'success');
};

// ========================================================
// 8. QUẢN LÝ LỚP OMR ĐỘC LẬP & NHẬP HỌC SINH KÈM SBD (OFFLINE)
// ========================================================

function getDefaultOmrClasses() {
    return [
        {
            id: 'omr_cls_demo_12a1',
            name: '12A1',
            academicYear: '2024-2025',
            description: 'Lớp OMR độc lập mẫu',
            students: [
                { id: 'st_demo_001', student_no: '001', name: 'Nguyễn Văn An', phone: '0912345678', note: 'Tổ 1' },
                { id: 'st_demo_002', student_no: '002', name: 'Trần Thị Bình', phone: '0987654321', note: 'Tổ 1' },
                { id: 'st_demo_003', student_no: '003', name: 'Lê Hoàng Cường', phone: '0905123456', note: 'Tổ 2' },
                { id: 'st_demo_004', student_no: '004', name: 'Phạm Minh Đức', phone: '0934567890', note: 'Tổ 2' },
                { id: 'st_demo_005', student_no: '005', name: 'Hoàng Mai Hương', phone: '0978901234', note: 'Tổ 3' }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    ];
}

function loadLocalOmrClasses() {
    try {
        const raw = localStorage.getItem('omr_local_classes');
        let classes = [];
        if (raw) {
            classes = JSON.parse(raw);
        }
        if (!Array.isArray(classes) || classes.length === 0) {
            classes = getDefaultOmrClasses();
            localStorage.setItem('omr_local_classes', JSON.stringify(classes));
        }
        state.omrClasses = classes;
        const savedActiveId = localStorage.getItem('omr_active_class_id');
        const found = classes.find(c => c.id === savedActiveId);
        state.activeOmrClassId = found ? found.id : (classes[0]?.id || null);
    } catch(e) {
        console.warn("Lỗi tải danh sách lớp OMR local:", e);
        state.omrClasses = getDefaultOmrClasses();
        state.activeOmrClassId = state.omrClasses[0]?.id || null;
    }
    return state.omrClasses;
}

function saveLocalOmrClasses(classes) {
    state.omrClasses = classes || [];
    try {
        localStorage.setItem('omr_local_classes', JSON.stringify(state.omrClasses));
    } catch(e) {}
    try {
        enrichSubmissionsFromClassRoster();
    } catch (_) {}
    if (state.teacherUid) {
        for (const cls of state.omrClasses) {
            try {
                setDoc(doc(db, "omr_local_classes", cls.id), {
                    ...cls,
                    teacherId: state.teacherUid,
                    updatedAt: new Date().toISOString()
                });
            } catch(e) {}
        }
    }
}

function getActiveOmrClass() {
    if (!state.activeOmrClassId && Array.isArray(state.omrClasses) && state.omrClasses.length > 0) {
        state.activeOmrClassId = state.omrClasses[0].id;
    }
    return (state.omrClasses || []).find(c => c.id === state.activeOmrClassId) || null;
}

window.renderStudentsTab = () => {
    if (!state.omrClasses || state.omrClasses.length === 0) {
        loadLocalOmrClasses();
    }
    window.renderOmrClassesList();
    window.renderActiveOmrClassStudents();
};

window.renderOmrClassesList = () => {
    const container = document.getElementById('omrClassesChipsContainer');
    const examClassSelect = document.getElementById('newExamOmrClassId');
    if (!container) return;

    const classes = state.omrClasses || [];
    if (classes.length === 0) {
        container.innerHTML = `<div class="text-xs text-slate-400 py-2">Chưa có lớp OMR nào. Bấm "+ Tạo lớp mới" để bắt đầu!</div>`;
        return;
    }

    container.innerHTML = classes.map(cls => {
        const isActive = cls.id === state.activeOmrClassId;
        const studentCount = Array.isArray(cls.students) ? cls.students.length : 0;
        const activeClassStr = isActive
            ? 'btn-season-primary shadow-sm font-bold border-2 border-emerald-400/80 scale-[1.02]'
            : 'bg-gray-100 hover:bg-gray-200 dark:bg-[#1E1B29] dark:hover:bg-[#2D2A3D] text-slate-700 dark:text-slate-300 border border-gray-200 dark:border-[#38344D] font-semibold';

        return `
            <button type="button" onclick="window.selectOmrClass('${cls.id}')" class="px-3 py-2 rounded-xl text-xs flex items-center gap-2 shrink-0 transition-all cursor-pointer ${activeClassStr}">
                <i class="fa-solid fa-graduation-cap ${isActive ? 'text-white' : 'text-emerald-500'}"></i>
                <span class="truncate max-w-[140px]">${cls.name || 'Lớp OMR'}</span>
                <span class="px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-black/25 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'} font-bold tabular-nums">
                    ${studentCount} HS
                </span>
            </button>
        `;
    }).join('') + `
        <button type="button" onclick="window.openCreateOmrClassModal()" class="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer" title="Tạo thêm lớp OMR độc lập">
            <i class="fa-solid fa-plus"></i>
            <span>Thêm lớp</span>
        </button>
    `;

    // Populate #newExamOmrClassId in #createExamModal (Bao gồm cả Lớp OMR và Lớp LMS)
    if (examClassSelect) {
        const prevVal = examClassSelect.value;
        let optHtml = `<option value="">-- Không chọn (Bài thi tự do) --</option>`;
        if (classes.length > 0) {
            optHtml += `<optgroup label="Lớp OMR độc lập">` +
                classes.map(c => `<option value="${c.id}">${c.name} (${(c.students || []).length} học sinh)</option>`).join('') +
                `</optgroup>`;
        }
        const lmsList = Array.isArray(state.lmsClasses) ? state.lmsClasses : [];
        if (lmsList.length > 0) {
            optHtml += `<optgroup label="Lớp học LMS">` +
                lmsList.map(c => {
                    const cnt = c.studentCount || (Array.isArray(c.students) ? c.students.length : 0);
                    const yStr = c.academicYear ? ` [${c.academicYear}]` : '';
                    return `<option value="lms_${c.id}">🏫 ${c.name || 'Lớp LMS'} (${cnt} HS)${yStr}</option>`;
                }).join('') +
                `</optgroup>`;
        }
        examClassSelect.innerHTML = optHtml;
        if (prevVal) examClassSelect.value = prevVal;
    }
};

window.selectOmrClass = (classId) => {
    state.activeOmrClassId = classId;
    localStorage.setItem('omr_active_class_id', classId);
    window.renderOmrClassesList();
    window.renderActiveOmrClassStudents();
};

window.openCreateOmrClassModal = () => {
    const modal = document.getElementById('createOmrClassModal');
    if (!modal) return;
    const nameInput = document.getElementById('newOmrClassName');
    const descInput = document.getElementById('newOmrClassDesc');
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    modal.classList.remove('hidden');
    if (nameInput) setTimeout(() => nameInput.focus(), 100);
};

window.confirmCreateOmrClass = () => {
    const name = document.getElementById('newOmrClassName')?.value.trim();
    if (!name) {
        Swal.fire('Lưu ý', 'Vui lòng nhập tên lớp học!', 'warning');
        return;
    }
    const year = document.getElementById('newOmrClassYear')?.value.trim() || '2024-2025';
    const desc = document.getElementById('newOmrClassDesc')?.value.trim() || '';

    const newClass = {
        id: 'omr_cls_' + Date.now(),
        name,
        academicYear: year,
        description: desc,
        students: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    state.omrClasses.push(newClass);
    state.activeOmrClassId = newClass.id;
    saveLocalOmrClasses(state.omrClasses);

    document.getElementById('createOmrClassModal').classList.add('hidden');
    window.renderStudentsTab();
    Swal.fire({
        icon: 'success',
        title: 'Tạo lớp thành công!',
        text: `Đã tạo lớp "${name}". Bạn có thể nạp danh sách học sinh kèm SBD hoặc bấm "Tạo đề cho lớp này".`,
        timer: 2000
    });
};

window.renameActiveOmrClass = async () => {
    const cls = getActiveOmrClass();
    if (!cls) return;

    const { value: newName } = await Swal.fire({
        title: 'Đổi tên lớp OMR',
        input: 'text',
        inputValue: cls.name,
        inputPlaceholder: 'Nhập tên lớp mới...',
        showCancelButton: true,
        confirmButtonText: 'Lưu thay đổi',
        cancelButtonText: 'Hủy'
    });

    if (newName && newName.trim() && newName.trim() !== cls.name) {
        cls.name = newName.trim();
        cls.updatedAt = new Date().toISOString();
        saveLocalOmrClasses(state.omrClasses);
        window.renderStudentsTab();
        Swal.fire('Đã cập nhật', `Tên lớp đã đổi thành: ${cls.name}`, 'success');
    }
};

window.deleteActiveOmrClass = async () => {
    const cls = getActiveOmrClass();
    if (!cls) return;

    const res = await Swal.fire({
        title: `Xóa lớp "${cls.name}"?`,
        text: `Lớp này hiện có ${(cls.students || []).length} học sinh. Thao tác này không thể hoàn tác.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa lớp',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#ef4444'
    });

    if (res.isConfirmed) {
        state.omrClasses = state.omrClasses.filter(c => c.id !== cls.id);
        state.activeOmrClassId = state.omrClasses[0]?.id || null;
        saveLocalOmrClasses(state.omrClasses);
        window.renderStudentsTab();
        Swal.fire('Đã xóa', 'Lớp học đã được xóa thành công.', 'success');
    }
};

window.createExamForSelectedOmrClass = () => {
    const cls = getActiveOmrClass();
    if (!cls) {
        Swal.fire('Lưu ý', 'Vui lòng chọn hoặc tạo một lớp OMR trước!', 'warning');
        return;
    }
    window.openCreateExamModal();
    const nameInp = document.getElementById('newExamName');
    const classSel = document.getElementById('newExamOmrClassId');
    if (classSel) classSel.value = cls.id;
    if (nameInp) {
        const todayStr = new Date().toLocaleDateString('vi-VN');
        nameInp.value = `Đề kiểm tra ${cls.name} (${todayStr})`;
    }
};

window.renderActiveOmrClassStudents = () => {
    const tbody = document.getElementById('studentsTableBody');
    const countBadge = document.getElementById('activeClassStudentCountBadge');
    const sidebarCountBadge = document.getElementById('studentsCountBadge');
    if (!tbody) return;

    const cls = getActiveOmrClass();
    if (!cls) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400 italic">Chưa chọn lớp OMR nào.</td></tr>`;
        if (countBadge) countBadge.textContent = '0 học sinh';
        return;
    }

    const queryStr = (document.getElementById('classStudentSearchInput')?.value || '').trim().toLowerCase();
    let roster = Array.isArray(cls.students) ? cls.students : [];

    if (queryStr) {
        roster = roster.filter(s =>
            (s.name || '').toLowerCase().includes(queryStr) ||
            (s.student_no || '').toLowerCase().includes(queryStr) ||
            (s.phone || '').includes(queryStr) ||
            (s.note || '').toLowerCase().includes(queryStr)
        );
    }

    if (countBadge) countBadge.textContent = `${(cls.students || []).length} học sinh`;
    if (sidebarCountBadge) sidebarCountBadge.textContent = (cls.students || []).length;

    if (roster.length === 0) {
        const emptyMsg = queryStr
            ? 'Không tìm thấy học sinh nào khớp với từ khóa tìm kiếm.'
            : `Lớp "${cls.name}" hiện chưa có học sinh nào. Bấm <b>"Nạp Excel / Dán SBD"</b> hoặc <b>"+ Thêm học sinh"</b> để nạp ngay!`;
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400 italic">${emptyMsg}</td></tr>`;
        return;
    }

    tbody.innerHTML = roster.map((s, idx) => {
        // Match with current exam submissions
        const sub = (state.submissions || []).find(sub =>
            sub.student_no === s.student_no ||
            (s.student_no && String(Number(sub.student_no || 0)) === String(Number(s.student_no)))
        );

        const statusBadge = sub
            ? `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 inline-flex items-center gap-1"><i class="fa-solid fa-circle-check"></i> Đã chấm: ${sub.score.toFixed(2)}đ</span>`
            : `<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Chưa có bài</span>`;

        const phoneDisplay = s.phone
            ? `<a href="https://zalo.me/${s.phone.replace(/\D/g, '')}" target="_blank" class="text-blue-600 dark:text-blue-400 font-mono hover:underline inline-flex items-center gap-1" title="Mở chat Zalo"><i class="fa-solid fa-comment-dots text-[10px]"></i> ${s.phone}</a>`
            : `<span class="text-slate-400">---</span>`;

        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-[#1E1B29] transition-colors">
                <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
                <td class="p-3 font-mono font-bold text-slate-800 dark:text-slate-100">${s.student_no || '---'}</td>
                <td class="p-3 font-bold text-slate-900 dark:text-white">${s.name || 'Học sinh'}</td>
                <td class="p-3">${phoneDisplay}</td>
                <td class="p-3 text-slate-500 dark:text-slate-400">${s.note || '---'}</td>
                <td class="p-3 text-center">${statusBadge}</td>
                <td class="p-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <button type="button" onclick="window.openAddSingleStudentModal(${idx})" class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-[#1E1B29] dark:hover:bg-[#2D2A3D] text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs transition-colors cursor-pointer" title="Sửa học sinh">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" onclick="window.deleteSingleStudent(${idx})" class="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center text-xs transition-colors cursor-pointer" title="Xóa học sinh">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

window.filterActiveOmrClassStudents = () => {
    window.renderActiveOmrClassStudents();
};

window.openAddSingleStudentModal = (editIdx = -1) => {
    const cls = getActiveOmrClass();
    if (!cls) {
        Swal.fire('Lưu ý', 'Vui lòng chọn hoặc tạo lớp OMR trước!', 'warning');
        return;
    }
    const modal = document.getElementById('addSingleStudentModal');
    const titleEl = document.getElementById('singleStudentModalTitle');
    const idxInput = document.getElementById('singleStudentEditIndex');
    const sbdInput = document.getElementById('singleStudentSbd');
    const nameInput = document.getElementById('singleStudentName');
    const phoneInput = document.getElementById('singleStudentPhone');
    const noteInput = document.getElementById('singleStudentNote');

    idxInput.value = editIdx;
    if (editIdx >= 0 && cls.students && cls.students[editIdx]) {
        const st = cls.students[editIdx];
        if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Sửa Thông Tin Học Sinh`;
        if (sbdInput) sbdInput.value = st.student_no || '';
        if (nameInput) nameInput.value = st.name || '';
        if (phoneInput) phoneInput.value = st.phone || '';
        if (noteInput) noteInput.value = st.note || '';
    } else {
        if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-user-plus"></i> Thêm Học Sinh Vào Lớp "${cls.name}"`;
        const nextNum = (cls.students || []).length + 1;
        if (sbdInput) sbdInput.value = String(nextNum).padStart(3, '0');
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        if (noteInput) noteInput.value = '';
    }

    modal.classList.remove('hidden');
    if (sbdInput) setTimeout(() => sbdInput.focus(), 100);
};

window.confirmSaveSingleStudent = () => {
    const cls = getActiveOmrClass();
    if (!cls) return;

    const editIdx = parseInt(document.getElementById('singleStudentEditIndex')?.value || '-1');
    const sbd = document.getElementById('singleStudentSbd')?.value.trim();
    const name = document.getElementById('singleStudentName')?.value.trim();
    const phone = document.getElementById('singleStudentPhone')?.value.trim();
    const note = document.getElementById('singleStudentNote')?.value.trim();

    if (!sbd || !name) {
        Swal.fire('Thiếu thông tin', 'Vui lòng nhập cả Số báo danh (SBD) và Họ tên học sinh!', 'warning');
        return;
    }

    if (!Array.isArray(cls.students)) cls.students = [];

    const studentObj = {
        id: (editIdx >= 0 && cls.students[editIdx]?.id) || ('st_' + Date.now() + '_' + sbd),
        student_no: sbd,
        name,
        phone,
        note
    };

    if (editIdx >= 0 && editIdx < cls.students.length) {
        cls.students[editIdx] = studentObj;
    } else {
        cls.students.push(studentObj);
    }

    cls.updatedAt = new Date().toISOString();
    saveLocalOmrClasses(state.omrClasses);

    document.getElementById('addSingleStudentModal').classList.add('hidden');
    window.renderStudentsTab();
    Swal.fire({
        icon: 'success',
        title: editIdx >= 0 ? 'Đã sửa học sinh!' : 'Đã thêm học sinh!',
        timer: 1500
    });
};

window.deleteSingleStudent = async (idx) => {
    const cls = getActiveOmrClass();
    if (!cls || !cls.students || !cls.students[idx]) return;

    const st = cls.students[idx];
    const res = await Swal.fire({
        title: `Xóa học sinh "${st.name}"?`,
        text: `Số báo danh: ${st.student_no}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Xóa',
        confirmButtonColor: '#ef4444'
    });

    if (res.isConfirmed) {
        cls.students.splice(idx, 1);
        cls.updatedAt = new Date().toISOString();
        saveLocalOmrClasses(state.omrClasses);
        window.renderStudentsTab();
    }
};

window.clearActiveOmrClassStudents = async () => {
    const cls = getActiveOmrClass();
    if (!cls || !cls.students || cls.students.length === 0) return;

    const res = await Swal.fire({
        title: `Xóa tất cả học sinh của lớp "${cls.name}"?`,
        text: `Tổng cộng ${cls.students.length} học sinh sẽ bị xóa khỏi lớp này.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa toàn bộ',
        confirmButtonColor: '#ef4444'
    });

    if (res.isConfirmed) {
        cls.students = [];
        cls.updatedAt = new Date().toISOString();
        saveLocalOmrClasses(state.omrClasses);
        window.renderStudentsTab();
        Swal.fire('Đã xóa', 'Danh sách học sinh của lớp đã được làm trống.', 'success');
    }
};

window.assignSelectedClassToActiveExam = async () => {
    const cls = getActiveOmrClass();
    if (!cls) {
        Swal.fire('Lưu ý', 'Vui lòng chọn một lớp OMR trước!', 'warning');
        return;
    }
    if (!state.exam) {
        Swal.fire('Lưu ý', 'Chưa có bài thi nào đang mở để gán!', 'warning');
        return;
    }

    const students = Array.isArray(cls.students) ? cls.students : [];
    if (students.length === 0) {
        Swal.fire('Lớp trống', `Lớp "${cls.name}" chưa có học sinh nào. Hãy nhập học sinh vào lớp trước.`, 'info');
        return;
    }

    const examStudents = students.map(st => ({
        id: `st_${state.exam.id}_${st.student_no}`,
        examId: state.exam.id,
        teacherId: state.teacherUid,
        student_no: st.student_no,
        name: st.name,
        phone: st.phone,
        note: st.note,
        class_id: cls.id,
        class_name: cls.name
    }));

    state.students = examStudents;
    state.exam.classId = cls.id;
    state.exam.className = cls.name;

    localStorage.setItem(`omr_students_${state.exam.id}`, JSON.stringify(examStudents));
    localStorage.setItem(`omr_exam_class_${state.exam.id}`, JSON.stringify({ classId: cls.id, className: cls.name }));

    if (state.teacherUid) {
        for (const s of examStudents) {
            try { await setDoc(doc(db, "omr_students", s.id), s); } catch(e) {}
        }
    }

    updateActiveExamBanner();
    updateOverviewStats();
    enrichSubmissionsFromClassRoster();
    renderInlineSubmissionsList();
    if (state.activeTab === 'results') window.renderResultsTable();
    window.renderStudentsTab();

    Swal.fire({
        icon: 'success',
        title: 'Đã đưa vào đề đang chấm!',
        text: `Đã liên kết lớp "${cls.name}" và nạp ${examStudents.length} học sinh kèm SBD vào bài thi hiện tại.`,
        timer: 2500
    });
};

// ========================================================
// EXCEL IMPORT & EXCEL TEMPLATE FOR LOCAL OMR CLASSES
// ========================================================
window.openImportStudentsToClassModal = () => {
    const cls = getActiveOmrClass();
    if (!cls) {
        Swal.fire('Lưu ý', 'Vui lòng chọn hoặc tạo lớp OMR trước!', 'warning');
        return;
    }

    const targetLabel = document.getElementById('importTargetClassNameLabel');
    if (targetLabel) targetLabel.textContent = `Đang nạp vào lớp: ${cls.name}`;

    const fileInp = document.getElementById('studentExcelFileInput');
    const pasteArea = document.getElementById('pasteStudentTextarea');
    const previewCont = document.getElementById('importStudentsPreviewContainer');
    if (fileInp) fileInp.value = '';
    if (pasteArea) pasteArea.value = '';
    if (previewCont) previewCont.classList.add('hidden');

    window._parsedImportStudents = [];
    document.getElementById('importStudentsToClassModal').classList.remove('hidden');
};

window.handleStudentExcelFile = async (file) => {
    if (!file) return;
    if (!window.XLSX) {
        Swal.fire('Thiếu thư viện', 'Thư viện SheetJS chưa được tải. Vui lòng thử lại!', 'error');
        return;
    }

    try {
        Swal.showLoading();
        const buffer = await file.arrayBuffer();
        const wb = window.XLSX.read(buffer, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!rows || rows.length === 0) {
            Swal.fire('File trống', 'Không tìm thấy dữ liệu trong file Excel!', 'warning');
            return;
        }

        let headerIdx = -1;
        let sbdCol = -1, nameCol = -1, phoneCol = -1, noteCol = -1;

        for (let r = 0; r < Math.min(rows.length, 10); r++) {
            const rowStr = rows[r].map(c => String(c).toLowerCase());
            for (let c = 0; c < rowStr.length; c++) {
                const val = rowStr[c];
                if (val.includes('sbd') || val.includes('số báo danh') || val.includes('báo danh') || val.includes('mã hs')) sbdCol = c;
                if (val.includes('họ') || val.includes('tên') || val.includes('họ và tên') || val.includes('thí sinh')) nameCol = c;
                if (val.includes('sđt') || val.includes('điện thoại') || val.includes('phone') || val.includes('phụ huynh')) phoneCol = c;
                if (val.includes('ghi chú') || val.includes('tổ') || val.includes('nhóm') || val.includes('lớp')) noteCol = c;
            }
            if (sbdCol !== -1 || nameCol !== -1) {
                headerIdx = r;
                break;
            }
        }

        if (sbdCol === -1 && nameCol === -1) {
            headerIdx = 0;
            sbdCol = 0;
            nameCol = 1;
            phoneCol = 2;
            noteCol = 3;
        } else {
            if (sbdCol === -1) sbdCol = 0;
            if (nameCol === -1) nameCol = 1;
        }

        const parsed = [];
        for (let r = headerIdx + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!row || row.length === 0) continue;
            let sbd = String(row[sbdCol] || '').trim();
            let name = String(row[nameCol] || '').trim();
            let phone = phoneCol !== -1 ? String(row[phoneCol] || '').trim() : '';
            let note = noteCol !== -1 ? String(row[noteCol] || '').trim() : '';

            sbd = sbd.replace(/^['"]/, '');
            phone = phone.replace(/^['"]/, '');

            if (!sbd && !name) continue;
            if (!sbd) sbd = String(parsed.length + 1).padStart(3, '0');
            if (!name) name = `Học sinh ${sbd}`;

            parsed.push({ student_no: sbd, name, phone, note });
        }

        Swal.close();
        displayImportStudentsPreview(parsed);
    } catch(err) {
        Swal.fire('Lỗi đọc file Excel', err.message, 'error');
    }
};

window.previewPastedStudents = (text) => {
    if (!text || !text.trim()) {
        const previewCont = document.getElementById('importStudentsPreviewContainer');
        if (previewCont) previewCont.classList.add('hidden');
        window._parsedImportStudents = [];
        return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const parsed = [];

    lines.forEach((line, idx) => {
        const parts = line.split(/[,;\t]/).map(p => p.trim());
        let sbd = parts[0] || String(idx + 1).padStart(3, '0');
        let name = parts[1] || `Học sinh ${sbd}`;
        let phone = parts[2] || '';
        let note = parts[3] || '';

        if (/^\d{1,2}$/.test(parts[0]) && parts[1] && /^\d{3,8}$/.test(parts[1])) {
            sbd = parts[1];
            name = parts[2] || `Học sinh ${sbd}`;
            phone = parts[3] || '';
            note = parts[4] || '';
        }

        parsed.push({ student_no: sbd, name, phone, note });
    });

    displayImportStudentsPreview(parsed);
};

function displayImportStudentsPreview(students) {
    window._parsedImportStudents = students || [];
    const previewCont = document.getElementById('importStudentsPreviewContainer');
    const countLabel = document.getElementById('importStudentsPreviewCount');
    const tbody = document.getElementById('importStudentsPreviewTbody');

    if (!previewCont || !tbody) return;

    if (!students || students.length === 0) {
        previewCont.classList.add('hidden');
        return;
    }

    previewCont.classList.remove('hidden');
    if (countLabel) countLabel.textContent = `Đã nhận diện: ${students.length} học sinh`;

    tbody.innerHTML = students.slice(0, 50).map(s => `
        <tr class="hover:bg-gray-50 dark:hover:bg-[#1E1B29]">
            <td class="p-2 font-mono font-bold text-center text-slate-800 dark:text-slate-100">${s.student_no}</td>
            <td class="p-2 font-semibold text-slate-900 dark:text-white">${s.name}</td>
            <td class="p-2 text-slate-500 font-mono">${s.phone || '---'}</td>
            <td class="p-2 text-slate-400">${s.note || '---'}</td>
        </tr>
    `).join('') + (students.length > 50 ? `<tr><td colspan="4" class="p-2 text-center text-slate-400 italic">...và ${students.length - 50} học sinh khác</td></tr>` : '');
}

window.confirmApplyImportedStudents = () => {
    const cls = getActiveOmrClass();
    if (!cls) return;

    const list = window._parsedImportStudents || [];
    if (list.length === 0) {
        Swal.fire('Chưa có dữ liệu', 'Vui lòng chọn file Excel hoặc dán danh sách học sinh trước!', 'warning');
        return;
    }

    const mode = document.querySelector('input[name="importStudentMode"]:checked')?.value || 'replace';

    const formatted = list.map(s => ({
        id: 'st_' + Date.now() + '_' + s.student_no,
        student_no: s.student_no,
        name: s.name,
        phone: s.phone,
        note: s.note
    }));

    if (mode === 'replace') {
        cls.students = formatted;
    } else {
        if (!Array.isArray(cls.students)) cls.students = [];
        cls.students.push(...formatted);
    }

    cls.updatedAt = new Date().toISOString();
    saveLocalOmrClasses(state.omrClasses);

    document.getElementById('importStudentsToClassModal').classList.add('hidden');
    window.renderStudentsTab();

    Swal.fire({
        icon: 'success',
        title: 'Nạp danh sách thành công!',
        text: `Đã nạp ${formatted.length} học sinh vào lớp "${cls.name}". Tổng sĩ số: ${cls.students.length} học sinh.`,
        timer: 2500
    });
};

window.downloadStudentTemplateExcel = () => {
    if (!window.XLSX) {
        Swal.fire('Lỗi', 'Thư viện SheetJS chưa sẵn sàng!', 'error');
        return;
    }

    const headers = [
        ['DANH SÁCH HỌC SINH VÀ SỐ BÁO DANH (OMR GRADER)'],
        ['Ghi chú: Cột SBD điền 3 hoặc 6 chữ số theo định dạng phiếu in (VD: 001, 002...)'],
        [],
        ['STT', 'Số Báo Danh (SBD)', 'Họ và Tên Học Sinh', 'Số Điện Thoại PHHS', 'Ghi Chú / Tổ'],
        [1, '001', 'Nguyễn Văn An', '0912345678', 'Tổ 1'],
        [2, '002', 'Trần Thị Bình', '0987654321', 'Tổ 1'],
        [3, '003', 'Lê Hoàng Cường', '0905123456', 'Tổ 2'],
        [4, '004', 'Phạm Minh Đức', '0934567890', 'Tổ 2'],
        [5, '005', 'Hoàng Mai Hương', '0978901234', 'Tổ 3']
    ];

    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.aoa_to_sheet(headers);

    ws['!cols'] = [
        { wch: 6 },
        { wch: 18 },
        { wch: 28 },
        { wch: 20 },
        { wch: 20 }
    ];

    window.XLSX.utils.book_append_sheet(wb, ws, "DanhSachHocSinh");
    window.XLSX.writeFile(wb, "Mau_Danh_Sach_Hoc_Sinh_OMR.xlsx");
};

// ========================================================
// 8.1 NẠP ĐÁP ÁN BẰNG FILE EXCEL & QUÉT MÃ QR
// ========================================================

window.downloadKeyTemplateExcel = () => {
    if (!window.XLSX) {
        Swal.fire('Lỗi', 'Thư viện SheetJS chưa sẵn sàng!', 'error');
        return;
    }

    const qCount1 = state.exam?.question_count || 12;
    const qCount2 = state.exam?.part2_count || 4;
    const qCount3 = state.exam?.part3_count || 6;

    const matrixRows = [
        ['MA TRẬN ĐÁP ÁN ĐỀ THI OMR (NHIỀU MÃ ĐỀ)'],
        ['Hỗ trợ cả Phần I (A,B,C,D), Phần II (Đúng/Sai dạng Đ S Đ S), Phần III (Số -4.5, 12)'],
        [],
        ['Câu', 'Mã 101', 'Mã 102', 'Mã 103', 'Mã 104', 'Phần / Ghi chú']
    ];

    const sampleP1 = ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A', 'B', 'C', 'D'];
    for (let i = 1; i <= qCount1; i++) {
        const s1 = sampleP1[(i - 1) % 4];
        const s2 = sampleP1[(i) % 4];
        const s3 = sampleP1[(i + 1) % 4];
        const s4 = sampleP1[(i + 2) % 4];
        matrixRows.push([i, s1, s2, s3, s4, 'Phần I (Trắc nghiệm)']);
    }

    const sampleP2 = ['ĐSĐS', 'ĐĐSS', 'SĐSĐ', 'SSSS'];
    for (let i = 1; i <= qCount2; i++) {
        const s = sampleP2[(i - 1) % sampleP2.length];
        matrixRows.push([`P2_Câu ${i}`, s, s, s, s, 'Phần II (Đúng/Sai 4 ý: a,b,c,d)']);
    }

    const sampleP3 = ['12', '-4.5', '0.25', '100', '3.14', '-1'];
    for (let i = 1; i <= qCount3; i++) {
        const s = sampleP3[(i - 1) % sampleP3.length];
        matrixRows.push([`P3_Câu ${i}`, s, s, s, s, 'Phần III (Trả lời ngắn)']);
    }

    const instructionsRows = [
        ['HƯỚNG DẪN NẠP ĐÁP ÁN EXCEL CHO MÁY CHẤM OMR'],
        [],
        ['1. Hàng tiêu đề gồm cột "Câu" và các cột tiếp theo là từng Mã đề (VD: 101, 102, 103, 104...).'],
        ['2. Có thể tạo thêm bao nhiêu mã đề tùy ý bằng cách thêm cột mới (VD: cột 105, 106...).'],
        ['3. Phần I: Điền chữ cái A, B, C hoặc D.'],
        ['4. Phần II: Điền chuỗi 4 ký tự Đúng/Sai, ví dụ "ĐSĐS", "ĐĐSS" (tương ứng câu a, b, c, d).'],
        ['5. Phần III: Điền số nguyên hoặc số thập phân (dấu phẩy hoặc dấu chấm, VD: 12 hoặc -4,5).'],
        ['6. Sau khi điền xong, lưu file và nạp vào OMR Grader qua nút "Nạp từ Excel".']
    ];

    const wb = window.XLSX.utils.book_new();
    const wsMatrix = window.XLSX.utils.aoa_to_sheet(matrixRows);
    const wsGuide = window.XLSX.utils.aoa_to_sheet(instructionsRows);

    wsMatrix['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 26 }];
    wsGuide['!cols'] = [{ wch: 90 }];

    window.XLSX.utils.book_append_sheet(wb, wsMatrix, "MaTranDapAn");
    window.XLSX.utils.book_append_sheet(wb, wsGuide, "HuongDan");

    window.XLSX.writeFile(wb, "Mau_Dap_An_OMR.xlsx");
};

window.openImportKeysExcelModal = () => {
    const modal = document.getElementById('importKeysExcelModal');
    if (!modal) return;
    const fileInp = document.getElementById('keyExcelFileInput');
    const pasteArea = document.getElementById('pasteKeyTextarea');
    const previewCont = document.getElementById('importKeysPreviewContainer');
    if (fileInp) fileInp.value = '';
    if (pasteArea) pasteArea.value = '';
    if (previewCont) previewCont.classList.add('hidden');
    window._parsedImportKeys = {};
    modal.classList.remove('hidden');
};

function parseKeysMatrixFromRows(rows) {
    if (!rows || rows.length === 0) return {};

    // ── DETECT FORMAT ──
    const firstCell = String(rows[0]?.[0] || '').trim().toLowerCase().replace(/[\s="]/g, '');
    
    // YoungMix format: first cell contains "đề" + columns are question numbers (1,2,3...)
    // Each row is an exam code with answers across columns
    const isYoungMix = /^(đề|de)[\\/]?(câu|cau)?/.test(firstCell) || 
                       (/^(đề|de)/.test(firstCell) && rows[0]?.length > 10 && /^\d+$/.test(String(rows[0]?.[1] || '').trim()));

    if (isYoungMix) {
        return parseYoungMixFormat(rows);
    }
    
    // SmartTest format: first cell contains "câu" and columns are exam codes
    const isSmartTest = /^(câu|cau)[\\/]?(mã|ma)?/.test(firstCell);

    if (isSmartTest) {
        return parseSmartTestFormat(rows);
    }

    // ── GENERIC FORMAT (original logic) ──
    let headerIdx = -1;
    let codeCols = [];

    for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const row = rows[r];
        const codesInRow = [];
        for (let c = 0; c < row.length; c++) {
            const cellVal = String(row[c] || '').trim();
            const m = cellVal.match(/(?:mã|md|mã đề)?\s*(\d{3,4})/i);
            if (m) {
                codesInRow.push({ colIdx: c, code: m[1] });
            }
        }
        if (codesInRow.length > 0) {
            headerIdx = r;
            codeCols = codesInRow;
            break;
        }
    }

    if (codeCols.length === 0) {
        throw new Error("Không tìm thấy dòng tiêu đề chứa Mã đề (VD: 101, 102, 103...).");
    }

    const qCount1 = state.exam?.question_count || 12;
    const resultKeys = {};
    codeCols.forEach(cc => {
        resultKeys[cc.code] = {
            code: cc.code,
            answers: '',
            part2: [],
            part3: []
        };
    });

    let currentP1Idx = 0;
    let currentP2Idx = 0;
    let currentP3Idx = 0;

    for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const firstCell = String(row[0] || '').trim().toLowerCase();
        const isPart2 = firstCell.includes('p2') || firstCell.includes('phần ii') || firstCell.includes('đúng sai') || firstCell.includes('đ/s');
        const isPart3 = firstCell.includes('p3') || firstCell.includes('phần iii') || firstCell.includes('ngắn') || firstCell.includes('tln');

        codeCols.forEach(cc => {
            const rawVal = String(row[cc.colIdx] || '').trim();
            if (!rawVal) return;

            if (isPart2 || (/^[đsds]{4}$/i.test(rawVal.replace(/[^đsds]/gi, '')))) {
                const chunk = rawVal.toUpperCase().replace(/D/g, 'Đ').replace(/[^ĐS]/g, '').padEnd(4, '-').slice(0, 4);
                resultKeys[cc.code].part2.push(chunk);
            } else if (isPart3 || (/^[-+]?\d+([.,]\d+)?$/.test(rawVal) && currentP1Idx >= qCount1)) {
                resultKeys[cc.code].part3.push(rawVal);
            } else {
                const cleanChar = rawVal.toUpperCase().replace(/[^ABCD]/g, '');
                if (cleanChar) {
                    resultKeys[cc.code].answers += cleanChar[0];
                }
            }
        });

        if (isPart2) currentP2Idx++;
        else if (isPart3) currentP3Idx++;
        else currentP1Idx++;
    }

    return resultKeys;
}

/**
 * YoungMix format parser
 * Row 0: "Đề\câu", 1, 2, 3, ... 40, 1a, 1b, 1c, 1d, ..., 1, 2, 3, ...
 * Row 1+: ="1618", A, D, D, ... (each row = 1 exam code, answers across columns)
 * Columns: P1 answers (1-40), then P2 sub-items (1a,1b,...,8d), then P3 values (1-8)
 */
function parseYoungMixFormat(rows) {
    const header = rows[0] || [];
    const resultKeys = {};

    // Parse column structure from header row
    // Find P1 columns (pure numbers: 1,2,...,26,27,...,40)
    // Find P2 columns (letters: 1a,1b,1c,1d,...,8a,8b,8c,8d)
    // Find P3 columns (numbers after P2 section)
    const p1Cols = [];
    const p2Cols = [];
    const p3Cols = [];

    let foundP2 = false;
    let foundP3 = false;
    const seenP1Numbers = new Set();
    
    for (let c = 1; c < header.length; c++) {
        const h = String(header[c] || '').trim().toLowerCase();
        if (!h) continue;
        
        if (/^\d+[abcd]$/.test(h)) {
            // P2 sub-item: 1a, 1b, 1c, 1d, 2a, ...
            foundP2 = true;
            p2Cols.push(c);
        } else if (/^\d+$/.test(h)) {
            const num = parseInt(h);
            if (foundP2) {
                // After P2 section: this is P3
                foundP3 = true;
                p3Cols.push(c);
            } else {
                // Before P2 section: this is P1
                p1Cols.push(c);
                seenP1Numbers.add(num);
            }
        }
    }

    // Parse data rows
    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length < 2) continue;
        
        // Extract exam code (remove ="..." wrapping)
        const rawCode = String(row[0] || '').trim().replace(/^="?|"$/g, '').replace(/^=/, '').trim();
        const codeMatch = rawCode.match(/(\d{3,4})/);
        if (!codeMatch) continue;
        const code = codeMatch[1];

        // P1 answers
        let answers = '';
        for (const ci of p1Cols) {
            const v = String(row[ci] || '').trim().toUpperCase();
            if (/^[ABCD]$/.test(v)) answers += v;
            else answers += '-';
        }
        // Trim trailing dashes
        answers = answers.replace(/-+$/, '');

        // P2 answers (group by 4: a,b,c,d)
        const p2 = [];
        for (let j = 0; j < p2Cols.length; j += 4) {
            let chunk = '';
            for (let k = 0; k < 4 && (j + k) < p2Cols.length; k++) {
                const v = String(row[p2Cols[j + k]] || '').trim().toUpperCase();
                if (v === 'Đ' || v === 'D' || v === 'ĐÚNG' || v === 'TRUE') chunk += 'Đ';
                else if (v === 'S' || v === 'SAI' || v === 'FALSE') chunk += 'S';
                else chunk += '-';
            }
            if (chunk.replace(/-/g, '')) p2.push(chunk);
        }

        // P3 answers
        const p3 = [];
        for (const ci of p3Cols) {
            const v = String(row[ci] || '').trim();
            if (v) p3.push(v);
        }

        resultKeys[code] = { code, answers, part2: p2, part3: p3 };
    }

    if (Object.keys(resultKeys).length === 0) {
        throw new Error("Không tìm thấy dữ liệu đáp án hợp lệ trong file YoungMix.");
    }

    return resultKeys;
}

/**
 * SmartTest format parser
 * Row 0: "Câu\Mã đề", ="1618", ="1901", ...  (column headers are exam codes)
 * Rows 1-26: question number, A, D, A, ...     (P1 answers by row)
 * Rows 27-40: empty (or unused P1 slots)
 * Then: row number restarts at 1,2,... with ĐSĐS values (P2)
 * Then: empty rows
 * Then: row number restarts at 1,2,... with numeric values (P3)
 */
function parseSmartTestFormat(rows) {
    const header = rows[0] || [];
    const resultKeys = {};

    // Extract exam codes from header (skip first column)
    const codeCols = [];
    for (let c = 1; c < header.length; c++) {
        const rawCode = String(header[c] || '').trim().replace(/^="?|"$/g, '').replace(/^=/, '').trim();
        const m = rawCode.match(/(\d{3,4})/);
        if (m) {
            codeCols.push({ colIdx: c, code: m[1] });
            resultKeys[m[1]] = { code: m[1], answers: '', part2: [], part3: [] };
        }
    }

    if (codeCols.length === 0) {
        throw new Error("Không tìm thấy mã đề trong tiêu đề file SmartTest.");
    }

    // Parse data rows - detect sections by content patterns
    // Section 1 (P1): cells are A/B/C/D
    // Section 2 (P2): cells are ĐSĐS/ĐĐSS etc (4 chars of Đ/S)
    // Section 3 (P3): cells are numeric values (14,4 or 3768 etc)
    let currentSection = 'p1'; // p1, p2, p3
    let consecutiveEmpty = 0;

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length < 2) {
            consecutiveEmpty++;
            continue;
        }

        // Check what kind of data is in the first data column
        const sampleVal = String(row[codeCols[0]?.colIdx] || '').trim();
        
        if (!sampleVal && consecutiveEmpty > 0) {
            continue;
        }
        consecutiveEmpty = 0;

        // Detect section transition
        if (/^[ĐSDS]{3,8}$/i.test(sampleVal.replace(/[^ĐSDS]/gi, ''))) {
            currentSection = 'p2';
        } else if (/^[-+]?\d+([.,]\d+)?$/.test(sampleVal) && currentSection !== 'p1') {
            currentSection = 'p3';
        } else if (/^[ABCD]$/i.test(sampleVal.toUpperCase())) {
            if (currentSection !== 'p1') currentSection = 'p1'; // stay in p1
        }

        codeCols.forEach(cc => {
            const rawVal = String(row[cc.colIdx] || '').trim();
            if (!rawVal) return;

            if (currentSection === 'p1') {
                const ch = rawVal.toUpperCase().replace(/[^ABCD]/g, '');
                if (ch) resultKeys[cc.code].answers += ch[0];
            } else if (currentSection === 'p2') {
                const chunk = rawVal.toUpperCase().replace(/D(?=[SĐ])/g, 'Đ');
                const cleaned = chunk.replace(/[^ĐS]/g, '').padEnd(4, '-').slice(0, 4);
                resultKeys[cc.code].part2.push(cleaned);
            } else if (currentSection === 'p3') {
                resultKeys[cc.code].part3.push(rawVal);
            }
        });
    }

    return resultKeys;
}

window.handleKeysExcelFile = async (file) => {
    if (!file) return;
    if (!window.XLSX) {
        Swal.fire('Lỗi', 'Thư viện SheetJS chưa sẵn sàng!', 'error');
        return;
    }

    try {
        Swal.showLoading();
        const buffer = await file.arrayBuffer();
        const wb = window.XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const parsedKeys = parseKeysMatrixFromRows(rows);
        Swal.close();
        displayImportKeysPreview(parsedKeys);
    } catch(err) {
        Swal.fire('Lỗi phân tích file Excel', err.message, 'error');
    }
};

window.previewPastedKeys = (text) => {
    if (!text || !text.trim()) {
        const previewCont = document.getElementById('importKeysPreviewContainer');
        if (previewCont) previewCont.classList.add('hidden');
        window._parsedImportKeys = {};
        return;
    }

    try {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const rows = lines.map(line => line.split(/[\t;,]/).map(c => c.trim()));
        const parsedKeys = parseKeysMatrixFromRows(rows);
        displayImportKeysPreview(parsedKeys);
    } catch(err) {}
};

function displayImportKeysPreview(keysMap) {
    window._parsedImportKeys = keysMap || {};
    const previewCont = document.getElementById('importKeysPreviewContainer');
    const summaryLabel = document.getElementById('importKeysPreviewSummary');
    const previewList = document.getElementById('importKeysPreviewList');

    if (!previewCont || !previewList) return;

    const codes = Object.keys(keysMap);
    if (codes.length === 0) {
        previewCont.classList.add('hidden');
        return;
    }

    previewCont.classList.remove('hidden');
    if (summaryLabel) summaryLabel.textContent = `Tìm thấy: ${codes.length} mã đề (${codes.join(', ')})`;

    previewList.innerHTML = codes.map(code => {
        const k = keysMap[code];
        const p1Len = (k.answers || '').length;
        const p2Len = (k.part2 || []).length;
        const p3Len = (k.part3 || []).length;

        return `
            <div class="p-2.5 rounded-xl bg-gray-50 dark:bg-[#1E1B29] border border-gray-200 dark:border-[#38344D] text-xs space-y-1">
                <div class="flex items-center justify-between font-bold">
                    <span class="font-mono text-emerald-600 dark:text-emerald-400">Mã: ${code}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">Hợp lệ</span>
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">
                    <div>P1: <b>${p1Len}</b> câu (${(k.answers || '').slice(0, 8)}...)</div>
                    <div>P2: <b>${p2Len}</b> câu · P3: <b>${p3Len}</b> câu</div>
                </div>
            </div>
        `;
    }).join('');
}

window.confirmApplyImportedKeys = async () => {
    const keysMap = window._parsedImportKeys || {};
    const codes = Object.keys(keysMap);

    if (codes.length === 0) {
        Swal.fire('Chưa có đáp án', 'Vui lòng chọn file Excel hoặc dán ma trận đáp án!', 'warning');
        return;
    }

    if (!state.exam) {
        Swal.fire('Lưu ý', 'Chưa chọn bài thi để áp dụng đáp án!', 'warning');
        return;
    }

    for (const code of codes) {
        const k = keysMap[code];
        const keyObj = {
            id: `key_${state.exam.id}_${code}`,
            examId: state.exam.id,
            teacherId: state.teacherUid,
            code: String(code),
            answers: k.answers || '',
            part2: k.part2 || [],
            part3: k.part3 || [],
            updatedAt: new Date().toISOString()
        };

        state.keys[code] = keyObj;

        if (state.teacherUid) {
            try { await setDoc(doc(db, "omr_keys", keyObj.id), keyObj); } catch(e) {}
        }
    }

    localStorage.setItem(`omr_keys_${state.exam.id}`, JSON.stringify(Object.values(state.keys)));

    // Cập nhật và lưu toàn bộ mã đề mới vào cấu hình bài thi
    const combinedCodes = Array.from(new Set([...(state.exam.codes || []).map(String), ...codes.map(String)])).sort();
    state.exam.codes = combinedCodes;
    const exIdx = (state.exams || []).findIndex(e => e.id === state.exam.id);
    if (exIdx !== -1) {
        state.exams[exIdx].codes = combinedCodes;
    }
    saveLocalExams(state.exams);
    if (state.teacherUid) {
        try { await setDoc(doc(db, "omr_exams", state.exam.id), { codes: combinedCodes }, { merge: true }); } catch(e) {}
    }

    document.getElementById('importKeysExcelModal').classList.add('hidden');
    window.renderKeysTab(codes[0]);

    Swal.fire({
        icon: 'success',
        title: 'Nạp đáp án thành công!',
        text: `Đã lưu đáp án cho ${codes.length} mã đề (${codes.join(', ')}) vào bài thi hiện tại.`,
        timer: 2500
    });
};

// ========================================================
// 8.2 QR CODE SCANNER FOR ANSWER KEYS (CAMERA & IMAGE UPLOAD)
// ========================================================
let qrScanStream = null;
let qrScanAnimId = null;

window.openScanKeyQrModal = async () => {
    const modal = document.getElementById('scanKeyQrModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    document.getElementById('qrDecodedResultBox')?.classList.add('hidden');
    window._lastDecodedQrPayload = null;

    startKeyQrCamera();
};

async function startKeyQrCamera() {
    const video = document.getElementById('qrScannerVideo');
    const overlay = document.getElementById('qrScannerStatusOverlay');
    if (!video) return;

    try {
        if (overlay) overlay.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> Đang mở camera...`;
        qrScanStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        video.srcObject = qrScanStream;
        await video.play();
        if (overlay) overlay.innerHTML = `<i class="fa-solid fa-camera mr-1"></i> Đưa mã QR đáp án vào giữa khung quét`;
        scanQrLoop();
    } catch(err) {
        console.warn("Không mở được camera quét QR:", err);
        if (overlay) overlay.innerHTML = `<span class="text-amber-400">Không mở được camera. Hãy bấm "Tải ảnh chụp mã QR từ máy"!</span>`;
    }
}

function scanQrLoop() {
    const video = document.getElementById('qrScannerVideo');
    const canvas = document.getElementById('qrScannerCanvas');
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        qrScanAnimId = requestAnimationFrame(scanQrLoop);
        return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (window.jsQR) {
        const qr = window.jsQR(imgData.data, canvas.width, canvas.height, {
            inversionAttempts: "dontInvert"
        });
        if (qr && qr.data) {
            window.handleDecodedQrText(qr.data);
            return;
        }
    }

    qrScanAnimId = requestAnimationFrame(scanQrLoop);
}

window.closeScanKeyQrModal = () => {
    if (qrScanAnimId) {
        cancelAnimationFrame(qrScanAnimId);
        qrScanAnimId = null;
    }
    if (qrScanStream) {
        qrScanStream.getTracks().forEach(t => t.stop());
        qrScanStream = null;
    }
    document.getElementById('scanKeyQrModal')?.classList.add('hidden');
};

window.handleQrImageUpload = (file) => {
    if (!file) return;
    if (!window.jsQR) {
        Swal.fire('Lỗi', 'Thư viện giải mã QR chưa sẵn sàng!', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qr = window.jsQR(imgData.data, canvas.width, canvas.height);
            if (qr && qr.data) {
                window.handleDecodedQrText(qr.data);
            } else {
                Swal.fire('Không tìm thấy QR', 'Không nhận diện được mã QR trong bức ảnh này. Vui lòng thử ảnh chụp rõ nét hơn!', 'warning');
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

window.handleDecodedQrText = (rawText) => {
    if (!rawText) return;

    const allParsedKeys = []; // For multi-code QR (QM / TNmaker)
    let examCode = '101';
    let p1Answers = '';
    let p2Chunks = [];
    let p3Answers = [];

    const trimmed = rawText.trim();

    // === TNmaker format: {"code":"ANSWERS#DS_DS#TLN_TLN",...,"success":true,"type":6} ===
    if (trimmed.startsWith('{') && trimmed.includes('"success"')) {
        try {
            const data = JSON.parse(trimmed);
            const codeKeys = Object.keys(data).filter(k => k !== 'success' && k !== 'type');
            for (const code of codeKeys) {
                const val = String(data[code] || '');
                const parts = val.split('#');
                const tnP1 = (parts[0] || '').toUpperCase().replace(/[^ABCD]/g, '');
                let tnP2 = [];
                if (parts[1]) {
                    // "ĐSĐS_SĐĐĐ" → ["ĐSĐS","SĐĐĐ"]
                    tnP2 = parts[1].split('_').filter(Boolean).map(s => s.replace(/D/g, 'Đ').replace(/S/g, 'S'));
                }
                let tnP3 = [];
                if (parts[2]) {
                    // "14,4_4_3768_600_0,75_108" → ["14,4","4","3768","600","0,75","108"]
                    tnP3 = parts[2].split('_').filter(Boolean);
                }
                allParsedKeys.push({ code: String(code), answers: tnP1, part2: tnP2, part3: tnP3 });
            }
            if (allParsedKeys.length > 0) {
                examCode = allParsedKeys[0].code;
                p1Answers = allParsedKeys[0].answers;
                p2Chunks = allParsedKeys[0].part2;
                p3Answers = allParsedKeys[0].part3;
            }
        } catch(e) {
            console.warn('[QR TNmaker parse error]', e);
        }
    }
    // === QM format: [["3277","B","A",...,"S","D",...,0.75,4,...], [...]] ===
    else if (trimmed.startsWith('[') && trimmed.startsWith('[[')) {
        try {
            const arr = JSON.parse(trimmed);
            if (Array.isArray(arr) && arr.length > 0 && Array.isArray(arr[0])) {
                for (const row of arr) {
                    const code = String(row[0] || '');
                    let qmP1 = '';
                    let qmP2Flat = '';
                    let qmP3 = [];
                    // Elements 1..N: A/B/C/D = TN answers, then Đ/S or D/S = DS answers, then numbers = TLN
                    for (let i = 1; i < row.length; i++) {
                        const v = String(row[i] || '').trim();
                        const vUp = v.toUpperCase();
                        if (/^[ABCD]$/.test(vUp)) {
                            qmP1 += vUp;
                        } else if (/^[ĐSDS]$/.test(v.replace(/Đ/g, 'Đ'))) {
                            // D here means Đúng in QM context for DS section
                            qmP2Flat += v.toUpperCase() === 'D' ? 'Đ' : v.toUpperCase();
                        } else if (v !== '') {
                            // Numeric / TLN answer
                            qmP3.push(v.replace('.', ','));
                        }
                    }
                    // Group P2 flat into chunks of 4 (a,b,c,d per question)
                    const qmP2 = [];
                    for (let j = 0; j < qmP2Flat.length; j += 4) {
                        qmP2.push(qmP2Flat.slice(j, j + 4));
                    }
                    allParsedKeys.push({ code, answers: qmP1, part2: qmP2, part3: qmP3 });
                }
                if (allParsedKeys.length > 0) {
                    examCode = allParsedKeys[0].code;
                    p1Answers = allParsedKeys[0].answers;
                    p2Chunks = allParsedKeys[0].part2;
                    p3Answers = allParsedKeys[0].part3;
                }
            }
        } catch(e) {
            console.warn('[QR QM parse error]', e);
        }
    }
    // === Standard JSON: {code, answers, part2, part3} ===
    else if (trimmed.startsWith('{')) {
        try {
            const data = JSON.parse(trimmed);
            examCode = String(data.code || data.examCode || '101');
            p1Answers = String(data.answers || data.p1 || '');
            p2Chunks = Array.isArray(data.part2 || data.p2) ? (data.part2 || data.p2) : [];
            p3Answers = Array.isArray(data.part3 || data.p3) ? (data.part3 || data.p3) : [];
        } catch(e) {}
    } else if (trimmed.includes('OMRKEY:')) {
        const parts = trimmed.replace('OMRKEY:', '').split(';');
        parts.forEach(p => {
            const [k, v] = p.split('=').map(s => (s || '').trim());
            if (k === 'code') examCode = v;
            if (k === 'p1') p1Answers = v;
            if (k === 'p2') p2Chunks = v ? v.split(',') : [];
            if (k === 'p3') p3Answers = v ? v.split(',') : [];
        });
    } else if (trimmed.includes(':')) {
        const [c, ans] = trimmed.split(':');
        examCode = c.trim();
        p1Answers = (ans || '').trim().toUpperCase();
    } else {
        p1Answers = trimmed.toUpperCase().replace(/[^ABCD]/g, '');
    }

    // Store multi-code results if available
    window._lastDecodedQrPayload = {
        code: examCode,
        answers: p1Answers,
        part2: p2Chunks,
        part3: p3Answers,
        allKeys: allParsedKeys.length > 1 ? allParsedKeys : null
    };

    const resultBox = document.getElementById('qrDecodedResultBox');
    const codeBadge = document.getElementById('qrDecodedExamCode');
    const summaryText = document.getElementById('qrDecodedSummaryText');

    if (resultBox) resultBox.classList.remove('hidden');

    if (allParsedKeys.length > 1) {
        if (codeBadge) codeBadge.textContent = `${allParsedKeys.length} mã đề: ${allParsedKeys.map(k => k.code).join(', ')}`;
        if (summaryText) {
            const first = allParsedKeys[0];
            summaryText.textContent = `Phần I: ${first.answers.length} câu · Phần II: ${first.part2.length} câu · Phần III: ${first.part3.length} câu (mỗi đề)`;
        }
    } else {
        if (codeBadge) codeBadge.textContent = `Mã đề: ${examCode}`;
        if (summaryText) {
            summaryText.textContent = `Phần I: ${p1Answers.length} câu (${p1Answers.slice(0, 12)}...) · Phần II: ${p2Chunks.length} câu · Phần III: ${p3Answers.length} câu`;
        }
    }

    playBeepSound();
};

window.confirmApplyQrKey = async () => {
    const payload = window._lastDecodedQrPayload;
    if (!payload) return;

    if (!state.exam) {
        Swal.fire('Lưu ý', 'Chưa chọn bài thi để áp dụng đáp án!', 'warning');
        return;
    }

    // Handle multi-code QR (QM / TNmaker with multiple exam codes)
    const keysToApply = payload.allKeys || [payload];
    const appliedCodes = [];

    for (const k of keysToApply) {
        const code = String(k.code);
        const keyObj = {
            id: `key_${state.exam.id}_${code}`,
            examId: state.exam.id,
            teacherId: state.teacherUid,
            code: code,
            answers: k.answers || '',
            part2: k.part2 || [],
            part3: k.part3 || [],
            updatedAt: new Date().toISOString()
        };

        state.keys[code] = keyObj;

        if (state.teacherUid) {
            try { await setDoc(doc(db, "omr_keys", keyObj.id), keyObj); } catch(e) {}
        }
        appliedCodes.push(code);
    }

    localStorage.setItem(`omr_keys_${state.exam.id}`, JSON.stringify(Object.values(state.keys)));

    // Cập nhật và lưu toàn bộ mã đề mới vào cấu hình bài thi
    const combinedCodes = Array.from(new Set([...(state.exam.codes || []).map(String), ...appliedCodes.map(String)])).sort();
    state.exam.codes = combinedCodes;
    const exIdx = (state.exams || []).findIndex(e => e.id === state.exam.id);
    if (exIdx !== -1) {
        state.exams[exIdx].codes = combinedCodes;
    }
    saveLocalExams(state.exams);
    if (state.teacherUid) {
        try { await setDoc(doc(db, "omr_exams", state.exam.id), { codes: combinedCodes }, { merge: true }); } catch(e) {}
    }

    window.closeScanKeyQrModal();
    window.renderKeysTab(appliedCodes[0]);

    Swal.fire({
        icon: 'success',
        title: 'Đã nạp đáp án QR!',
        text: `Đã nạp thành công đáp án cho ${appliedCodes.length} mã đề (${appliedCodes.join(', ')}).`,
        timer: 2500
    });
};

// ========================================================
// 8.3 TIỆN ÍCH ĐỒNG BỘ TỪ LỚP HỌC LMS (NẾU CÓ DÙNG LMS)
// ========================================================
async function fetchTeacherLmsClasses(forceRefresh = false) {
    if (!forceRefresh && Array.isArray(state.lmsClasses) && state.lmsClasses.length > 0) return state.lmsClasses;
    let classes = [];

    // 1. Kiểm tra cache từ dashboard để lấy ngay tức thì (0ms)
    try {
        const cacheKeys = ['cached_classes_me', `cached_classes_${state.teacherUid}`, 'cached_classes_all', 'allClassesData'];
        for (const k of cacheKeys) {
            const raw = localStorage.getItem(k);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    classes = parsed;
                    break;
                }
            }
        }
    } catch (_) {}

    // 2. Tải trực tiếp từ cơ sở dữ liệu Firebase / Supabase
    if (classes.length === 0 || forceRefresh) {
        try {
            if (typeof db !== 'undefined') {
                if (state.teacherUid) {
                    const qClasses = query(collection(db, "classes"), where("teacherId", "==", state.teacherUid));
                    const snap = await getDocs(qClasses);
                    const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.isDeleted);
                    if (fetched.length > 0) classes = fetched;
                }
                if (classes.length === 0) {
                    const snapAll = await getDocs(query(collection(db, "classes"), limit(100)));
                    classes = snapAll.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.isDeleted);
                }
            }
        } catch(e) {
            console.warn("Lỗi tải danh sách lớp LMS từ DB:", e);
        }
    }

    state.lmsClasses = classes;
    return classes;
}

async function syncStudentsFromClassIdToExam(classId, examObj, silent = false) {
    if (!classId || !examObj) return [];
    let classData = (state.lmsClasses || []).find(c => c.id === classId);
    if (!classData && typeof db !== 'undefined') {
        const classDoc = await getDoc(doc(db, "classes", classId));
        if (classDoc.exists()) classData = classDoc.data();
    }
    if (!classData) {
        if (!silent) throw new Error("Lớp học không tồn tại!");
        return [];
    }
    const className = classData.name || 'Lớp LMS';

    examObj.classId = classId;
    examObj.className = className;
    examObj.isTempClass = false;
    localStorage.setItem(`omr_exam_class_${examObj.id}`, JSON.stringify({ classId, className, isTemp: false }));
    updateActiveExamBanner();

    let rawStudents = Array.isArray(classData.students) ? classData.students : [];
    if (rawStudents.length === 0 && typeof db !== 'undefined') {
        try {
            const qSt = await getDocs(collection(db, `classes/${classId}/students`));
            rawStudents = qSt.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch(e) {}
    }

    if (rawStudents.length === 0) {
        if (!silent) Swal.fire('Thông báo', `Đã gán lớp "${className}" (lớp hiện chưa có học sinh trong danh sách).`, 'info');
        return [];
    }

    const newStudents = rawStudents.map((st, idx) => {
        const sbd = st.sbd || st.student_no || String(idx + 1).padStart(3, '0');
        const stName = (typeof st === 'string') ? st : (st.name || st.studentName || st.fullName || st.displayName || `Học sinh ${sbd}`);
        const stUid = (typeof st === 'object' && st) ? (st.uid || st.id || st.studentId || '') : '';
        const stEmail = (typeof st === 'object' && st) ? (st.email || '') : '';
        return {
            id: `st_${examObj.id}_${sbd}`,
            examId: examObj.id,
            teacherId: state.teacherUid,
            student_no: String(sbd).padStart(3, '0'),
            name: stName,
            student_uid: stUid,
            student_email: stEmail,
            class_id: classId,
            class_name: className
        };
    });

    state.students = newStudents;
    if (state.teacherUid && typeof db !== 'undefined') {
        for (const s of newStudents) {
            try { await setDoc(doc(db, "omr_students", s.id), s); } catch(e) {}
        }
    }
    localStorage.setItem(`omr_students_${examObj.id}`, JSON.stringify(newStudents));
    window.renderStudentsTab();
    updateOverviewStats();
    return newStudents;
}

window.openSyncLmsClassModal = async () => {
    const modal = document.getElementById('syncLmsClassModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    window.switchSyncClassTab('lms');

    const select = document.getElementById('lmsClassSelector');
    if (select) select.innerHTML = `<option value="">Đang tải danh sách lớp học của bạn...</option>`;

    try {
        const classes = await fetchTeacherLmsClasses();
        const yearFilter = document.getElementById('lmsAcademicYearFilter');
        if (yearFilter) {
            const yearsSet = new Set(['2025-2026', '2024-2025', '2023-2024']);
            classes.forEach(c => {
                if (c.academicYear) yearsSet.add(c.academicYear);
            });
            const sortedYears = Array.from(yearsSet).sort().reverse();
            const curVal = yearFilter.value || '2025-2026';
            yearFilter.innerHTML = sortedYears.map(y => `
                <option value="${y}" ${curVal === y ? 'selected' : ''}>Năm học ${y}</option>
            `).join('') + `<option value="all" ${curVal === 'all' ? 'selected' : ''}>🌟 Xem tất cả các năm học</option>`;
        }
        window.filterLmsClassesByYear();
    } catch(err) {
        console.error("Lỗi tải lớp LMS:", err);
        if (select) select.innerHTML = `<option value="">Lỗi tải dữ liệu lớp học</option>`;
    }
};

window.switchSyncClassTab = (tab) => {
    const isLms = tab === 'lms';
    const btnLms = document.getElementById('tabBtnSyncClassLms');
    const btnTemp = document.getElementById('tabBtnSyncClassTemp');
    const panelLms = document.getElementById('panelSyncClassLms');
    const panelTemp = document.getElementById('panelSyncClassTemp');
    const btnActionText = document.getElementById('syncClassActionBtnText');

    if (btnLms) {
        btnLms.className = isLms
            ? 'px-3.5 py-2 font-bold text-xs border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400 cursor-pointer flex items-center gap-1.5'
            : 'px-3.5 py-2 font-bold text-xs border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer flex items-center gap-1.5';
    }
    if (btnTemp) {
        btnTemp.className = !isLms
            ? 'px-3.5 py-2 font-bold text-xs border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400 cursor-pointer flex items-center gap-1.5'
            : 'px-3.5 py-2 font-bold text-xs border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer flex items-center gap-1.5';
    }
    if (panelLms) panelLms.classList.toggle('hidden', !isLms);
    if (panelTemp) panelTemp.classList.toggle('hidden', isLms);
    if (btnActionText) {
        btnActionText.textContent = isLms ? 'Nạp học sinh từ LMS' : 'Tạo & Áp dụng Lớp tạm';
    }
};

window.filterLmsClassesByYear = () => {
    const year = document.getElementById('lmsAcademicYearFilter')?.value || '2025-2026';
    const select = document.getElementById('lmsClassSelector');
    const countBadge = document.getElementById('lmsClassesFilteredCount');
    if (!select) return;

    const all = Array.isArray(state.lmsClasses) ? state.lmsClasses : [];
    const filtered = year === 'all'
        ? all
        : all.filter(c => (c.academicYear || '2025-2026') === year);

    if (countBadge) countBadge.textContent = `${filtered.length} lớp`;

    if (filtered.length === 0) {
        select.innerHTML = `<option value="">Không có lớp nào trong năm học ${year}</option>`;
        const badge = document.getElementById('lmsClassStuCountBadge');
        if (badge) badge.textContent = '0 HS';
        return;
    }

    select.innerHTML = filtered.map(c => {
        const count = c.studentCount || (Array.isArray(c.students) ? c.students.length : 0);
        const yStr = c.academicYear ? ` [${c.academicYear}]` : '';
        const isSelected = state.exam?.classId === c.id;
        return `<option value="${c.id}" ${isSelected ? 'selected' : ''}>${c.name || 'Lớp học'} (${count} HS)${yStr}</option>`;
    }).join('');

    window.updateLmsClassPreview();
};

window.updateLmsClassPreview = () => {
    const classId = document.getElementById('lmsClassSelector')?.value;
    const badge = document.getElementById('lmsClassStuCountBadge');
    if (!badge) return;

    const cls = (state.lmsClasses || []).find(c => c.id === classId);
    if (cls) {
        const count = cls.studentCount || (Array.isArray(cls.students) ? cls.students.length : 0);
        badge.textContent = `${count} học sinh`;
    } else {
        badge.textContent = '---';
    }
};

window.confirmSyncClassAction = async () => {
    const isTempTab = document.getElementById('panelSyncClassTemp') && !document.getElementById('panelSyncClassTemp').classList.contains('hidden');

    if (isTempTab) {
        const tempName = document.getElementById('tempClassNameInput')?.value.trim();
        if (!tempName) {
            Swal.fire('Thiếu thông tin', 'Vui lòng nhập tên cho lớp tạm!', 'warning');
            return;
        }
        if (!state.exam) {
            Swal.fire('Lỗi', 'Vui lòng mở một đề thi trước khi gán lớp!', 'warning');
            return;
        }

        const tempClassId = 'temp_' + Date.now();
        state.exam.classId = tempClassId;
        state.exam.className = tempName;
        state.exam.isTempClass = true;

        localStorage.setItem(`omr_exam_class_${state.exam.id}`, JSON.stringify({
            classId: tempClassId,
            className: tempName,
            isTemp: true
        }));

        updateActiveExamBanner();
        document.getElementById('syncLmsClassModal').classList.add('hidden');

        // Cập nhật text trong editExamSettingsModal nếu đang mở
        const classTextEl = document.getElementById('editExamCurrentClassText');
        if (classTextEl) {
            classTextEl.textContent = `${tempName} (Lớp tạm) · ${(state.students || []).length} học sinh`;
        }

        Swal.fire({
            icon: 'success',
            title: 'Đã tạo lớp tạm!',
            text: `Bài thi đã được gán lớp tạm: "${tempName}". Bạn có thể nạp danh sách học sinh vào đề trong tab Lớp & SBD.`,
            timer: 2500
        });
    } else {
        const classId = document.getElementById('lmsClassSelector')?.value;
        if (!classId || !state.exam) {
            Swal.fire('Lưu ý', 'Vui lòng chọn một lớp học từ danh sách!', 'warning');
            return;
        }
        try {
            Swal.showLoading();
            const newStudents = await syncStudentsFromClassIdToExam(classId, state.exam, false);
            document.getElementById('syncLmsClassModal').classList.add('hidden');

            const classTextEl = document.getElementById('editExamCurrentClassText');
            if (classTextEl) {
                classTextEl.textContent = `${state.exam.className} · ${newStudents.length} học sinh`;
            }

            if (newStudents.length > 0) {
                Swal.fire('Thành công', `Đã gán lớp "${state.exam.className}" và đồng bộ ${newStudents.length} học sinh kèm SBD!`, 'success');
            } else {
                Swal.fire('Đã gán lớp', `Đã gán lớp "${state.exam.className}". Lớp này hiện chưa có danh sách học sinh nào trong LMS.`, 'info');
            }
        } catch(err) {
            Swal.fire('Lỗi đồng bộ', err.message, 'error');
        }
    }
};

window.confirmSyncFromLmsClass = async () => {
    return window.confirmSyncClassAction();
};

window.openImportStudentsCsvModal = () => {
    window.openImportStudentsToClassModal();
};

window.confirmImportStudentsCsv = async () => {
    window.confirmApplyImportedStudents();
};

window.clearCurrentExamStudents = async () => {
    window.clearActiveOmrClassStudents();
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

    cont.innerHTML = state.exams.map(e => {
        const isCurrent = state.exam?.id === e.id;
        const omrCode = e.omrCode || (e.codes && e.codes[0]) || '101';
        return `
        <div onclick="window.selectExamAndSwitch('${e.id}')" class="bg-white dark:bg-[#262335] p-4 sm:p-5 rounded-2xl border ${isCurrent ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-200 dark:border-[#38344D] hover:border-emerald-400'} shadow-2xs flex flex-col justify-between gap-3 cursor-pointer transition-all group">
            <div class="space-y-1.5">
                <h4 class="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-emerald-600 transition-colors" title="${(e.name || '').replace(/"/g, '&quot;')}">${e.name}</h4>
                <div class="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span><b>${e.question_count || 12}</b> TN · <b>${e.part2_count || 4}</b> Đ/S · <b>${e.part3_count || 6}</b> TLN</span>
                    <span>•</span>
                    <span>Mã OMR: <b class="font-mono text-emerald-700 dark:text-emerald-400">${omrCode}</b></span>
                    ${e.className ? `<span>• Lớp: <b>${e.className}</b></span>` : ''}
                </div>
            </div>

            <div class="flex items-center justify-between gap-2 pt-2.5 border-t border-gray-100 dark:border-[#38344D]">
                <div class="flex items-center gap-1.5">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${isCurrent ? 'bg-emerald-600 text-white' : 'badge-season'}">
                        ${isCurrent ? '✓ Đang chấm đề này' : (e.isLmsExam ? 'Kho đề LMS' : 'Đề rời')}
                    </span>
                    <span class="text-[10px] text-slate-400 font-mono">${new Date(e.createdAt || Date.now()).toLocaleDateString('vi-VN')}</span>
                </div>
                <div class="flex items-center gap-1.5">
                    ${!e.isLmsExam ? `
                    <button type="button" onclick="event.stopPropagation(); window.deleteExam('${e.id}')" class="w-7 h-7 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold flex items-center justify-center transition-colors" title="Xóa bài thi này">
                        <i class="fa-solid fa-trash"></i>
                    </button>` : ''}
                    <span class="px-2.5 py-1 rounded-lg ${isCurrent ? 'bg-gray-100 dark:bg-[#1E1B29] text-slate-600 dark:text-slate-300' : 'btn-season-primary'} text-[11px] font-bold">
                        ${isCurrent ? 'Mở quét' : 'Chọn chấm →'}
                    </span>
                </div>
            </div>
        </div>
        `;
    }).join('');
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
    const targetExam = state.exams.find(e => e.id === examId);
    const examName = targetExam ? targetExam.name : 'bài thi này';
    const gradedCount = (state.gradedCountsByExam && state.gradedCountsByExam[examId]) || (state.exam?.id === examId ? state.submissions.length : 0);

    const res = await Swal.fire({
        title: `Xóa đề "${examName}"?`,
        text: gradedCount > 0 
            ? `Đề này đã chấm ${gradedCount} bài. Toàn bộ đáp án, danh sách học sinh và kết quả chấm của bài thi sẽ bị xóa hoàn toàn!`
            : 'Toàn bộ đáp án và thiết lập của bài thi này sẽ bị xóa!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa vĩnh viễn',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#ef4444'
    });
    if (!res.isConfirmed) return;

    // Xóa trong state.exams
    state.exams = state.exams.filter(e => e.id !== examId);
    saveLocalExams(state.exams);

    // Ghi nhận tombstone xóa vào localStorage để chống hồi sinh từ cache
    try {
        const delIds = JSON.parse(localStorage.getItem('omr_deleted_exam_ids') || '[]');
        if (!delIds.includes(examId)) delIds.push(examId);
        localStorage.setItem('omr_deleted_exam_ids', JSON.stringify(delIds.slice(-500)));
    } catch (_) {}

    // Xóa sạch dữ liệu bài chấm và cache của đề này trên toàn bộ localStorage
    try {
        localStorage.removeItem(`omr_submissions_${examId}`);
        localStorage.removeItem(`omr_students_${examId}`);
        localStorage.removeItem(`omr_exam_class_${examId}`);
        if (state.gradedCountsByExam) delete state.gradedCountsByExam[examId];

        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('omr_exams_') || k.startsWith('bank_exams_'))) {
                try {
                    const arr = JSON.parse(localStorage.getItem(k) || '[]');
                    if (Array.isArray(arr) && arr.some(x => x && x.id === examId)) {
                        localStorage.setItem(k, JSON.stringify(arr.filter(x => x && x.id !== examId)));
                    }
                } catch (_) {}
            }
        }
    } catch (_) {}

    // Đồng bộ xóa vĩnh viễn lên Cloud Database & lưu tombstone cho mọi thiết bị (dùng configurations an toàn)
    if (state.teacherUid) {
        try { await deleteDoc(doc(db, "omr_exams", examId)); } catch(e) {}
        try { await deleteDoc(doc(db, "exams", examId)); } catch(e) {}
        try {
            const delSnap = await getDoc(doc(db, "configurations", "omr_deleted_exams_" + state.teacherUid));
            const existingIds = (delSnap && delSnap.exists() && Array.isArray(delSnap.data()?.ids)) ? delSnap.data().ids : [];
            if (!existingIds.includes(examId)) existingIds.push(examId);
            await setDoc(doc(db, "configurations", "omr_deleted_exams_" + state.teacherUid), {
                ids: existingIds.slice(-200),
                updatedAt: new Date().toISOString()
            });
        } catch(e) {}
    }

    // Nếu đề bị xóa là đề đang chọn, chuyển sang đề đầu tiên còn lại
    if (state.exam?.id === examId) {
        state.submissions = [];
        await selectExam(state.exams[0].id);
    }

    // Cập nhật lại UI ở cả Modal chọn đề và Tab danh sách đề
    window.renderExamsListTab();
    window.renderLmsExamPickerList();
    updateOverviewStats();

    Swal.fire('Đã xóa', `Đã xóa đề "${examName}" thành công!`, 'success');
};

window.clearExamSubmissions = async (examId) => {
    const targetExam = state.exams.find(e => e.id === examId) || state.exam;
    if (!targetExam) return;
    const gradedCount = (state.gradedCountsByExam && state.gradedCountsByExam[targetExam.id]) || (state.exam?.id === targetExam.id ? state.submissions.length : 0);
    if (gradedCount === 0) {
        Swal.fire('Thông báo', 'Đề này chưa có bài nào được chấm.', 'info');
        return;
    }

    const res = await Swal.fire({
        title: `Xóa ${gradedCount} bài đã chấm?`,
        text: `Toàn bộ ${gradedCount} bài chấm của đề "${targetExam.name}" sẽ bị làm trống để giáo viên chấm lại từ đầu. Đề thi và đáp án vẫn được giữ nguyên.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Xóa bài chấm (Làm sạch)',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#ef4444'
    });
    if (!res.isConfirmed) return;

    if (state.exam?.id === targetExam.id) {
        state.submissions = [];
    }
    if (state.gradedCountsByExam) {
        state.gradedCountsByExam[targetExam.id] = 0;
    }
    try {
        localStorage.removeItem(`omr_submissions_${targetExam.id}`);
    } catch (_) {}

    renderSubmissionsUI();
    window.renderLmsExamPickerList();
    window.renderExamsListTab();
    updateOverviewStats();

    Swal.fire('Đã làm sạch', `Đã xóa sạch kết quả chấm của đề "${targetExam.name}". Bạn có thể bắt đầu đợt chấm mới!`, 'success');
};

window.openCreateExamModal = () => {
    document.getElementById('createExamModal').classList.remove('hidden');
    const folderSelect = document.getElementById('newExamFolderSelect');
    if (folderSelect) {
        folderSelect.innerHTML = `<option value="">📁 [Thư mục gốc]</option>` +
            (state.folders || []).map(f => `<option value="${f.id}" ${state.currentFolderId === f.id ? 'selected' : ''}>📁 ${f.name}</option>`).join('');
    }
    window.calcExamScorePreview('create');
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
    const p1Point = parseFloat(document.getElementById('newExamPointP1')?.value) || 0.25;
    const p2Count = parseInt(document.getElementById('newExamCountP2')?.value) || 4;
    const p3Count = parseInt(document.getElementById('newExamCountP3')?.value) || 6;
    const p3Point = parseFloat(document.getElementById('newExamPointP3')?.value) || 0.5;
    const omrClassId = document.getElementById('newExamOmrClassId')?.value || '';
    const folderId = document.getElementById('newExamFolderSelect')?.value || state.currentFolderId || null;

    const totalScore = (p1Count * p1Point) + (p2Count * 1.0) + (p3Count * p3Point);
    if (totalScore > 10.001) {
        const warnRes = await Swal.fire({
            title: 'Tổng điểm vượt quá 10 điểm!',
            text: `Tổng điểm dự kiến của bài thi là ${totalScore.toFixed(2)} đ (> 10.0 đ). Thầy/Cô có chắc chắn muốn tạo với mức điểm này không?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Vẫn tạo',
            cancelButtonText: 'Sửa lại',
            confirmButtonColor: '#ef4444'
        });
        if (!warnRes.isConfirmed) return;
    }

    let attachedClass = null;
    if (omrClassId) {
        if (omrClassId.startsWith('lms_')) {
            const rawId = omrClassId.replace('lms_', '');
            const lmsCls = (state.lmsClasses || []).find(c => c.id === rawId);
            if (lmsCls) {
                attachedClass = {
                    id: lmsCls.id,
                    name: lmsCls.name || 'Lớp LMS',
                    students: (lmsCls.students || []).map((st, i) => ({
                        student_no: st.sbd || st.student_no || String(i + 1).padStart(3, '0'),
                        name: st.name || st.studentName || st.displayName || `Học sinh ${i + 1}`,
                        phone: st.phoneParent || st.phone || '',
                        note: ''
                    })),
                    isLms: true
                };
            }
        } else if (Array.isArray(state.omrClasses)) {
            attachedClass = state.omrClasses.find(c => c.id === omrClassId);
        }
    }

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
        classId: attachedClass ? attachedClass.id : null,
        className: attachedClass ? attachedClass.name : null,
        createdAt: new Date().toISOString()
    };

    state.exams.unshift(newExam);
    saveLocalExams(state.exams);
    if (state.teacherUid) {
        try { await setDoc(doc(db, "omr_exams", newExam.id), newExam); } catch(e) {}
    }

    // Auto-populate students for this exam if an OMR class was attached
    if (attachedClass && Array.isArray(attachedClass.students) && attachedClass.students.length > 0) {
        const examStudents = attachedClass.students.map(st => ({
            id: `st_${newExam.id}_${st.student_no}`,
            examId: newExam.id,
            teacherId: state.teacherUid,
            student_no: st.student_no,
            name: st.name,
            phone: st.phone,
            note: st.note,
            class_id: attachedClass.id,
            class_name: attachedClass.name
        }));
        state.students = examStudents;
        localStorage.setItem(`omr_students_${newExam.id}`, JSON.stringify(examStudents));
        localStorage.setItem(`omr_exam_class_${newExam.id}`, JSON.stringify({ classId: attachedClass.id, className: attachedClass.name }));
        if (state.teacherUid) {
            for (const s of examStudents) {
                try { await setDoc(doc(db, "omr_students", s.id), s); } catch(e) {}
            }
        }
    }

    window.closeCreateExamModal();
    await selectExam(newExam.id);
    window.switchTab('keys');
    const successMsg = attachedClass
        ? `Đã tạo bài thi "${name}" cho lớp "${attachedClass.name}" kèm ${attachedClass.students.length} học sinh!`
        : 'Đã tạo bài thi mới! Hãy thiết lập đáp án cho các mã đề.';
    Swal.fire('Thành công', successMsg, 'success');
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
// 11. LMS EXAM PICKER MODAL & PHHS PARENT RESULT SHARING
// ========================================================

// ========================================================
// TÍNH ĐIỂM TRỰC TIẾP, CẢNH BÁO > 10Đ & CÀI ĐẶT ĐỀ THI
// ========================================================
window.calcExamScorePreview = (mode = 'create') => {
    const prefix = mode === 'create' ? 'newExam' : 'editExam';
    const p1Count = parseInt(document.getElementById(`${prefix}CountP1`)?.value) || 0;
    const p1Pt = parseFloat(document.getElementById(`${prefix}PointP1`)?.value) || 0;
    const p2Count = parseInt(document.getElementById(`${prefix}CountP2`)?.value) || 0;
    const p2MaxPt = 1.0; // Barem Bộ GD: tối đa 1.0đ cho mỗi câu 4 ý
    const p3Count = parseInt(document.getElementById(`${prefix}CountP3`)?.value) || 0;
    const p3Pt = parseFloat(document.getElementById(`${prefix}PointP3`)?.value) || 0;

    const p1Total = p1Count * p1Pt;
    const p2Total = p2Count * p2MaxPt;
    const p3Total = p3Count * p3Pt;
    const total = p1Total + p2Total + p3Total;

    const badge = document.getElementById(`${prefix}ScoreBadge`);
    const warnBox = document.getElementById(`${prefix}ScoreWarnBox`);

    if (badge) {
        badge.innerHTML = `Tổng điểm: <b class="font-mono text-sm">${total.toFixed(2)}</b> / 10.0 đ (P1: ${p1Total.toFixed(2)}đ · P2: ${p2Total.toFixed(2)}đ · P3: ${p3Total.toFixed(2)}đ)`;
    }

    if (warnBox) {
        if (total > 10.001) {
            warnBox.classList.remove('hidden');
            warnBox.className = 'p-3 rounded-xl border border-rose-400 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2';
            warnBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-base"></i> CẢNH BÁO: Tổng điểm hiện tại là ${total.toFixed(2)}đ (VƯỢT QUÁ 10 ĐIỂM)! Vui lòng điều chỉnh lại số câu hoặc điểm/câu.`;
        } else if (Math.abs(total - 10.0) > 0.001 && total > 0) {
            warnBox.classList.remove('hidden');
            warnBox.className = 'p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-2';
            warnBox.innerHTML = `<i class="fa-solid fa-circle-info text-base"></i> Lưu ý: Tổng điểm là ${total.toFixed(2)} đ (chưa đạt chuẩn 10.00 điểm).`;
        } else {
            warnBox.classList.add('hidden');
        }
    }

    return total;
};

// ========================================================
// TỰ ĐỘNG ĐÓNG DẤU LẠI PHIẾU CHẤM (RESTAMP SUBMISSION)
// ========================================================
async function reStampSubmission(sub) {
    if (!sub) return null;
    let baseImgSrc = sub.clean_image;
    if (!baseImgSrc && sub.id) {
        baseImgSrc = await getOmrImageFromDb(sub.id + '_clean');
        if (baseImgSrc) sub.clean_image = baseImgSrc;
    }
    if (!baseImgSrc) {
        baseImgSrc = sub.stamped_image || sub.image_data;
        if (!baseImgSrc && sub.id) {
            baseImgSrc = await getOmrImageFromDb(sub.id);
        }
    }
    if (!baseImgSrc) return null;

    try {
        const img = await new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('Load image failed'));
            i.src = baseImgSrc;
        });

        const isClean = !!(sub.clean_image && baseImgSrc === sub.clean_image);
        let bodyCanvas;
        if (isClean) {
            bodyCanvas = img;
        } else {
            // Tự động phát hiện và bóc tách sạch sẽ toàn bộ các header đã đóng dấu trước đó (dù có 1 hay 2 header)
            const headerH = detectExistingHeadersOffset(img);
            const naturalW = img.naturalWidth || img.width;
            const naturalH = img.naturalHeight || img.height;
            const bodyH = Math.max(1, naturalH - headerH);
            bodyCanvas = document.createElement('canvas');
            bodyCanvas.width = naturalW;
            bodyCanvas.height = bodyH;
            const bCtx = bodyCanvas.getContext('2d');
            bCtx.drawImage(img, 0, headerH, naturalW, bodyH, 0, 0, naturalW, bodyH);
        }

        const tplKey = sub.template_key || state.exam?.sheet_template || 'qmcv1239';
        const tpl = (window.MAU && window.MAU[tplKey]) || window.MAU.qmcv1239;
        const newStamped = await generateStampedGradedSheet(sub, {
            rectifiedCanvas: bodyCanvas,
            template: tpl,
            templateKey: tplKey,
            onlyHeaderUpgrade: false
        });

        if (newStamped) {
            sub.image_data = newStamped;
            sub.stamped_image = newStamped;
            sub._headerV25Upgraded = true;
            saveOmrImageToDb(sub.id, newStamped);
            if (state.memoryImages) state.memoryImages[sub.id] = newStamped;

            // Đồng bộ cập nhật ảnh lên giao diện chi tiết nếu đang mở bài này
            const imgEl = document.getElementById('resRectifiedImg');
            if (imgEl && state.lastSubmission?.id === sub.id) {
                imgEl.src = newStamped;
            }
        }
        return newStamped;
    } catch(err) {
        console.warn("reStampSubmission error:", err);
        return null;
    }
}

// ========================================================
// CÀI ĐẶT ĐỀ THI & SỬA ĐÁP ÁN (EDIT EXAM SETTINGS & KEYS)
// ========================================================
let editExamCurrentCode = '101';

window.switchExamSettingsTab = (tab) => {
    const btnInfo = document.getElementById('tabBtnExamSettingsInfo');
    const btnKeys = document.getElementById('tabBtnExamSettingsKeys');
    const panelInfo = document.getElementById('panelExamSettingsInfo');
    const panelKeys = document.getElementById('panelExamSettingsKeys');

    if (tab === 'info') {
        if (btnInfo) btnInfo.className = 'px-4 py-2.5 font-bold text-xs border-b-2 border-emerald-600 text-emerald-600 dark:text-emerald-400 cursor-pointer flex items-center gap-1.5 transition-all';
        if (btnKeys) btnKeys.className = 'px-4 py-2.5 font-bold text-xs border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer flex items-center gap-1.5 transition-all';
        if (panelInfo) panelInfo.classList.remove('hidden');
        if (panelKeys) panelKeys.classList.add('hidden');
    } else {
        if (btnInfo) btnInfo.className = 'px-4 py-2.5 font-bold text-xs border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer flex items-center gap-1.5 transition-all';
        if (btnKeys) btnKeys.className = 'px-4 py-2.5 font-bold text-xs border-b-2 border-amber-600 text-amber-600 dark:text-amber-400 cursor-pointer flex items-center gap-1.5 transition-all';
        if (panelInfo) panelInfo.classList.add('hidden');
        if (panelKeys) panelKeys.classList.remove('hidden');
        window.renderEditExamModalKeys(editExamCurrentCode);
    }
};

window.openEditExamSettingsModal = () => {
    state._keysModifiedInModal = false;
    if (!state.exam) return;
    const modal = document.getElementById('editExamSettingsModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    document.getElementById('editExamName').value = state.exam.name || '';
    document.getElementById('editExamTemplate').value = state.exam.sheet_template || 'qmcv1239';
    document.getElementById('editExamCodes').value = (state.exam.codes || ['101', '102']).join(', ');
    document.getElementById('editExamCountP1').value = state.exam.question_count || 12;
    document.getElementById('editExamPointP1').value = state.exam.part1_point ?? 0.25;
    document.getElementById('editExamCountP2').value = state.exam.part2_count || 4;
    document.getElementById('editExamCountP3').value = state.exam.part3_count || 6;
    document.getElementById('editExamPointP3').value = state.exam.part3_point ?? 0.5;

    const folderSelect = document.getElementById('editExamFolderSelect');
    if (folderSelect) {
        folderSelect.innerHTML = `<option value="">📁 [Thư mục gốc]</option>` +
            (state.folders || []).map(f => `<option value="${f.id}" ${state.exam.folderId === f.id ? 'selected' : ''}>📁 ${f.name}</option>`).join('');
    }

    // Populate mã đề selector trong tab đáp án của modal
    const codeSelect = document.getElementById('editExamModalCodeSelect');
    const codes = state.exam.codes && state.exam.codes.length > 0 ? state.exam.codes : ['101', '102'];
    editExamCurrentCode = codes[0] || '101';
    if (codeSelect) {
        codeSelect.innerHTML = codes.map(c => `<option value="${c}">${c}</option>`).join('');
        codeSelect.value = editExamCurrentCode;
    }

    // Hiển thị lớp hiện tại đang gán cho bài thi
    const classTextEl = document.getElementById('editExamCurrentClassText');
    if (classTextEl) {
        if (state.exam.className) {
            const tempTag = state.exam.isTempClass ? ' (Lớp tạm)' : '';
            classTextEl.textContent = `${state.exam.className}${tempTag} · ${(state.students || []).length} học sinh`;
        } else {
            classTextEl.textContent = 'Chưa gán lớp (Bài thi tự do)';
        }
    }

    window.switchExamSettingsTab('info');
    window.calcExamScorePreview('edit');
    window.renderEditExamModalKeys(editExamCurrentCode);
};

window.handleEditExamModalCodeChange = (code) => {
    // Lưu mã cũ trước khi đổi
    window.saveCurrentEditModalKey(editExamCurrentCode);
    editExamCurrentCode = code;
    window.renderEditExamModalKeys(code);
};

window.renderEditExamModalKeys = (code) => {
    const key = state.keys[code] || { answers: '', part2: [], part3: [] };
    const bonusP1 = key.bonus_p1 || {};
    const bonusP2 = key.bonus_p2 || {};
    const bonusP3 = key.bonus_p3 || {};

    // P1 Grid
    const p1Cont = document.getElementById('editExamModalP1Grid');
    const qCount1 = parseInt(document.getElementById('editExamCountP1')?.value) || state.exam?.question_count || 12;
    if (p1Cont) {
        p1Cont.innerHTML = Array.from({ length: qCount1 }, (_, i) => {
            const currentAns = (key.answers || '')[i] || '-';
            const isBonus = !!(bonusP1[i] || bonusP1[String(i)]);
            return `
                <div class="p-2 bg-slate-50 dark:bg-slate-900 rounded-xl border ${isBonus ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'} flex items-center justify-between gap-1">
                    <span class="font-bold text-slate-600 dark:text-slate-300 text-xs shrink-0">Câu ${i + 1}:</span>
                    <div class="flex items-center gap-1.5">
                        <select data-modal-p1="${i}" class="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-bold text-emerald-600 outline-none text-xs">
                            <option value="-" ${currentAns==='-'?'selected':''}>-</option>
                            <option value="A" ${currentAns==='A'?'selected':''}>A</option>
                            <option value="B" ${currentAns==='B'?'selected':''}>B</option>
                            <option value="C" ${currentAns==='C'?'selected':''}>C</option>
                            <option value="D" ${currentAns==='D'?'selected':''}>D</option>
                        </select>
                        <label class="inline-flex items-center gap-1 cursor-pointer select-none text-[11px] font-bold ${isBonus ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 hover:text-amber-600'}" title="Tất cả học sinh đều được điểm câu này">
                            <input type="checkbox" data-modal-bonus-p1="${i}" ${isBonus ? 'checked' : ''} onchange="this.closest('.p-2').classList.toggle('border-amber-400', this.checked); this.closest('.p-2').classList.toggle('bg-amber-50/40', this.checked)" class="rounded text-amber-500 w-3.5 h-3.5 border-slate-300 focus:ring-0">
                            <span class="text-[10px]">Cho điểm</span>
                        </label>
                    </div>
                </div>
            `;
        }).join('');
    }

    // P2 Grid
    const p2Cont = document.getElementById('editExamModalP2Grid');
    const qCount2 = parseInt(document.getElementById('editExamCountP2')?.value) || state.exam?.part2_count || 4;
    if (p2Cont) {
        p2Cont.innerHTML = Array.from({ length: qCount2 }, (_, q) => {
            const currentChunk = (key.part2 && key.part2[q]) ? key.part2[q] : '----';
            const isQBonus = !!(bonusP2[q] || bonusP2[String(q)]);
            return `
                <div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border ${isQBonus ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'} space-y-2">
                    <div class="flex items-center justify-between">
                        <b class="text-xs text-slate-700 dark:text-slate-200">Câu ${q + 1} (Đúng / Sai)</b>
                        <label class="inline-flex items-center gap-1 cursor-pointer select-none text-[11px] font-bold ${isQBonus ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 hover:text-amber-600'}" title="Tất cả học sinh đều được điểm câu này">
                            <input type="checkbox" data-modal-bonus-p2="${q}" ${isQBonus ? 'checked' : ''} onchange="this.closest('.p-3').classList.toggle('border-amber-400', this.checked)" class="rounded text-amber-500 w-3.5 h-3.5 border-slate-300 focus:ring-0">
                            <span>Cho điểm cả câu</span>
                        </label>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        ${['a', 'b', 'c', 'd'].map((opt, r) => {
                            const val = currentChunk[r] || '-';
                            return `
                                <div class="flex items-center justify-between text-xs bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <span class="font-bold text-slate-500">${opt})</span>
                                    <div class="inline-flex gap-1" data-modal-p2-opt-row="${r}">
                                        <button type="button" onclick="window.selectModalP2Btn(this, ${q}, ${r}, 'Đ')" class="p2-modal-btn px-2 py-0.5 rounded text-xs font-bold border transition-all ${val==='Đ'?'bg-emerald-600 text-white border-emerald-600':'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}">Đ</button>
                                        <button type="button" onclick="window.selectModalP2Btn(this, ${q}, ${r}, 'S')" class="p2-modal-btn px-2 py-0.5 rounded text-xs font-bold border transition-all ${val==='S'?'bg-rose-600 text-white border-rose-600':'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'}">S</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    // P3 Grid
    const p3Cont = document.getElementById('editExamModalP3Grid');
    const qCount3 = parseInt(document.getElementById('editExamCountP3')?.value) || state.exam?.part3_count || 6;
    if (p3Cont) {
        p3Cont.innerHTML = Array.from({ length: qCount3 }, (_, i) => {
            const val = (key.part3 && key.part3[i]) || '';
            const isBonus = !!(bonusP3[i] || bonusP3[String(i)]);
            return `
                <div class="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border ${isBonus ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'} space-y-1">
                    <div class="flex items-center justify-between">
                        <label class="block font-bold text-slate-500 text-xs">Câu ${i + 1}:</label>
                        <label class="inline-flex items-center gap-1 cursor-pointer select-none text-[10px] font-bold ${isBonus ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 hover:text-amber-600'}" title="Tất cả học sinh đều được điểm câu này">
                            <input type="checkbox" data-modal-bonus-p3="${i}" ${isBonus ? 'checked' : ''} onchange="this.closest('.p-2.5').classList.toggle('border-amber-400', this.checked)" class="rounded text-amber-500 w-3 h-3 border-slate-300 focus:ring-0">
                            <span>Cho điểm</span>
                        </label>
                    </div>
                    <input type="text" data-modal-p3="${i}" value="${val}" placeholder="VD: -4,5" class="w-full px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold text-center outline-none text-xs">
                </div>
            `;
        }).join('');
    }
};

window.selectModalP2Btn = (btn, q, r, val) => {
    const parent = btn.parentElement;
    parent.querySelectorAll('button').forEach(b => {
        b.className = "p2-modal-btn px-2 py-0.5 rounded text-xs font-bold border transition-all bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600";
    });
    btn.className = val === 'Đ' 
        ? "p2-modal-btn px-2 py-0.5 rounded text-xs font-bold border transition-all bg-emerald-600 text-white border-emerald-600"
        : "p2-modal-btn px-2 py-0.5 rounded text-xs font-bold border transition-all bg-rose-600 text-white border-rose-600";
    btn.dataset.val = val;
};

window.applyModalBulkKey = () => {
    const text = document.getElementById('editExamModalBulkInput')?.value || '';
    if (!text) return;
    try {
        const qCount = parseInt(document.getElementById('editExamCountP1')?.value) || 12;
        const res = window.parseQuickAnswers ? window.parseQuickAnswers(text, qCount) : { answers: text.toUpperCase().replace(/[^ABCD]/g, '') };
        const ansStr = res.answers || '';
        document.querySelectorAll('[data-modal-p1]').forEach((sel, i) => {
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

window.saveCurrentEditModalKey = (code) => {
    state._keysModifiedInModal = true;
    if (!code || !state.exam) return;
    const qCount1 = parseInt(document.getElementById('editExamCountP1')?.value) || 12;
    const qCount2 = parseInt(document.getElementById('editExamCountP2')?.value) || 4;
    const qCount3 = parseInt(document.getElementById('editExamCountP3')?.value) || 6;

    let p1Answers = '';
    const bonus_p1 = {};
    document.querySelectorAll('[data-modal-p1]').forEach(sel => {
        p1Answers += sel.value || '-';
    });
    document.querySelectorAll('[data-modal-bonus-p1]').forEach(cb => {
        const idx = parseInt(cb.dataset.modalBonusP1);
        if (cb.checked) bonus_p1[idx] = true;
    });

    const p2Cards = document.getElementById('editExamModalP2Grid')?.children || [];
    let p2Chunks = [];
    const bonus_p2 = {};
    for (let q = 0; q < qCount2; q++) {
        const card = p2Cards[q];
        let chunk = '';
        if (card) {
            for (let r = 0; r < 4; r++) {
                const row = card.querySelector(`[data-modal-p2-opt-row="${r}"]`);
                if (row) {
                    const active = row.querySelector('.bg-emerald-600, .bg-rose-600');
                    chunk += active ? active.textContent.trim() : '-';
                } else {
                    chunk += '-';
                }
            }
            const cb = card.querySelector('[data-modal-bonus-p2]');
            if (cb && cb.checked) bonus_p2[q] = true;
        }
        p2Chunks.push(chunk || '----');
    }

    let p3Answers = [];
    const bonus_p3 = {};
    document.querySelectorAll('[data-modal-p3]').forEach(inp => {
        p3Answers.push(inp.value.trim());
    });
    document.querySelectorAll('[data-modal-bonus-p3]').forEach(cb => {
        const idx = parseInt(cb.dataset.modalBonusP3);
        if (cb.checked) bonus_p3[idx] = true;
    });

    const keyObj = {
        id: `key_${state.exam.id}_${code}`,
        examId: state.exam.id,
        teacherId: state.teacherUid,
        code,
        answers: p1Answers,
        part2: p2Chunks,
        part3: p3Answers,
        bonus_p1,
        bonus_p2,
        bonus_p3,
        updatedAt: new Date().toISOString()
    };
    state.keys[code] = keyObj;

    if (state.teacherUid) {
        try { setDoc(doc(db, "omr_keys", keyObj.id), keyObj); } catch(_) {}
    }
    localStorage.setItem(`omr_keys_${state.exam.id}`, JSON.stringify(Object.values(state.keys)));
};

window.confirmSaveExamSettings = async () => {
    if (!state.exam) return;
    const oldP1Count = state.exam.question_count;
    const oldP1Pt = state.exam.part1_point;
    const oldP2Count = state.exam.part2_count;
    const oldP3Count = state.exam.part3_count;
    const oldP3Pt = state.exam.part3_point;
    const oldCodes = (state.exam.codes || []).join(',');

    const name = document.getElementById('editExamName')?.value.trim();
    if (!name) {
        Swal.fire('Lưu ý', 'Tên bài thi không được để trống!', 'warning');
        return;
    }

    const total = window.calcExamScorePreview('edit');
    if (total > 10.001) {
        const confirmOver = await Swal.fire({
            title: 'Tổng điểm vượt quá 10 điểm!',
            text: `Tổng điểm cấu hình hiện tại là ${total.toFixed(2)} đ (> 10.0 đ). Thầy/Cô có chắc chắn muốn lưu mức điểm này không?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Vẫn lưu',
            cancelButtonText: 'Sửa lại',
            confirmButtonColor: '#ef4444'
        });
        if (!confirmOver.isConfirmed) return;
    }

    // Lưu mã đề đang chọn trong tab keys
    const codeSelect = document.getElementById('editExamModalCodeSelect');
    if (codeSelect && codeSelect.value) {
        window.saveCurrentEditModalKey(codeSelect.value);
    }

    state.exam.name = name;
    state.exam.sheet_template = document.getElementById('editExamTemplate')?.value || state.exam.sheet_template;
    state.exam.codes = (document.getElementById('editExamCodes')?.value || '101').split(',').map(s => s.trim()).filter(Boolean);
    state.exam.question_count = parseInt(document.getElementById('editExamCountP1')?.value) || 12;
    state.exam.part1_point = parseFloat(document.getElementById('editExamPointP1')?.value) || 0.25;
    state.exam.part2_count = parseInt(document.getElementById('editExamCountP2')?.value) || 4;
    state.exam.part3_count = parseInt(document.getElementById('editExamCountP3')?.value) || 6;
    state.exam.part3_point = parseFloat(document.getElementById('editExamPointP3')?.value) || 0.5;
    state.exam.folderId = document.getElementById('editExamFolderSelect')?.value || null;

    saveLocalExams(state.exams);
    if (typeof storage !== 'undefined' && storage.saveExams) {
        await storage.saveExams(state.exams);
    }
    if (state.teacherUid && typeof db !== 'undefined') {
        try { await setDoc(doc(db, "omr_exams", state.exam.id), state.exam, { merge: true }); } catch (_) {}
    }

    document.getElementById('editExamSettingsModal').classList.add('hidden');
    updateActiveExamBanner();
    window.renderExamsListTab();
    window.renderExamPickerList();

    const newP1Count = state.exam.question_count;
    const newP1Pt = state.exam.part1_point;
    const newP2Count = state.exam.part2_count;
    const newP3Count = state.exam.part3_count;
    const newP3Pt = state.exam.part3_point;
    const newCodes = (state.exam.codes || []).join(',');

    const baremChanged = (oldP1Count !== newP1Count) || (oldP1Pt !== newP1Pt) ||
                         (oldP2Count !== newP2Count) || (oldP3Count !== newP3Count) || (oldP3Pt !== newP3Pt) ||
                         (oldCodes !== newCodes) || (state._keysModifiedInModal === true);
    state._keysModifiedInModal = false;

    if (baremChanged && state.submissions && state.submissions.length > 0) {
        await window.recalculateAllSubmissionsScore();
    } else {
        Swal.fire({
            icon: 'success',
            title: 'Đã lưu cấu hình bài thi!',
            timer: 1500,
            showConfirmButton: false
        });
    }
};


function renderSubmissionsUI() {
    if (typeof window.renderResultsTable === 'function') {
        window.renderResultsTable();
    }
    if (typeof updateOverviewStats === 'function') {
        updateOverviewStats();
    }
}
window.renderSubmissionsUI = renderSubmissionsUI;

window.recalculateAllSubmissionsScore = async () => {
    if (!state.exam || !state.submissions || state.submissions.length === 0) return;

    try {
        // 1. TÍNH LẠI TOÀN BỘ ĐIỂM SỐ SIÊU TỐC TRONG BỘ NHỚ (< 10ms CHO HÀNG TRĂM BÀI)
        for (const sub of state.submissions) {
            const scoreData = calculateExamScore(sub.code, sub.answers, sub.part2, sub.part3);
            sub.score = scoreData.totalScore;
            sub.part1_score = scoreData.part1Score;
            sub.part2_score = scoreData.part2Score;
            sub.part3_score = scoreData.part3Score;
            sub._needsRestamp = true;
            sub._headerV25Upgraded = false;
        }

        // 2. Lưu ngay kết quả điểm mới vào storage & cập nhật ngay lập tức giao diện
        if (typeof storage !== 'undefined' && storage.saveSubmissions) {
            await storage.saveSubmissions(state.exam.id, state.submissions);
        } else {
            saveSubmissionsToLocalSafe(state.exam.id, state.submissions);
        }

        // 3. Tái đóng dấu bài thi đang mở xem hiện tại (nếu có)
        if (state.lastSubmission) {
            const updatedLast = state.submissions.find(s => s.id === state.lastSubmission.id);
            if (updatedLast) {
                state.lastSubmission = updatedLast;
                try {
                    await reStampSubmission(updatedLast);
                    if (typeof displayLastResultInspector === 'function') {
                        await displayLastResultInspector(updatedLast, null);
                    }
                } catch (_) {}
            }
        }

        if (typeof window.renderResultsTable === 'function') {
            window.renderResultsTable();
        }
        if (typeof updateOverviewStats === 'function') {
            updateOverviewStats();
        }

        // 4. Đồng bộ nền Supabase (Batch background sync, không nghẽn UI)
        setTimeout(async () => {
            if (typeof syncSubmissionToLmsResultsCollection === 'function') {
                for (const sub of state.submissions) {
                    try { await syncSubmissionToLmsResultsCollection(sub); } catch (_) {}
                }
            }
        }, 100);

        Swal.fire({
            icon: 'success',
            title: 'Đã cập nhật điểm thành công!',
            text: `Đã tính lại điểm chính xác cho ${state.submissions.length} bài thi!`,
            timer: 1600,
            showConfirmButton: false
        });
    } catch(err) {
        console.error('[recalculateAllSubmissionsScore Error]:', err);
        Swal.fire('Lỗi', 'Không thể tính lại điểm: ' + (err.message || err), 'error');
    }
};

// ========================================================
// SỬA BÀI THI & ĐÍNH CHÍNH TÔ TRẮC NGHIỆM (HS TẨY CHƯA SẠCH / TÔ NHẦM)
// ========================================================
let editSubState = {
    sub: null,
    answersP1: '',
    answersP2: [],
    answersP3: [],
    activeTab: 'p1'
};

window.openEditSubmissionAnswersModal = () => {
    const sub = state.lastSubmission;
    if (!sub) return;
    editSubState.sub = sub;
    editSubState.answersP1 = sub.answers || '';
    editSubState.answersP2 = sub.part2 ? JSON.parse(JSON.stringify(sub.part2)) : [];
    editSubState.answersP3 = sub.part3 ? JSON.parse(JSON.stringify(sub.part3)) : [];
    editSubState.activeTab = 'p1';

    const sbdInp = document.getElementById('editSubModalSbd');
    const codeInp = document.getElementById('editSubModalCode');
    const nameInp = document.getElementById('editSubModalName');
    const reasonInp = document.getElementById('editSubModalReason');

    if (sbdInp) sbdInp.value = sub.student_no || '';
    if (codeInp) codeInp.value = sub.code || '';
    if (nameInp) nameInp.value = sub.student_name || '';
    if (reasonInp) reasonInp.value = sub.is_manual_entry ? 'Chấm thủ công ảnh lỗi' : '';

    // Hiển thị ảnh bài thi (nếu có) để đối chiếu
    const imgEl = document.getElementById('editSubModalImage');
    const imgCont = document.getElementById('editSubModalImageContainer');
    const imgLink = document.getElementById('editSubModalImageLink');
    const imgSrc = sub.clean_image || sub.image_data || sub.stamped_image;
    if (imgEl && imgCont && imgSrc) {
        imgEl.src = imgSrc;
        if (imgLink) imgLink.href = imgSrc;
        imgCont.classList.remove('hidden');
    } else if (imgCont) {
        imgCont.classList.add('hidden');
    }

    window.switchEditSubTab('p1');
    window.renderEditSubP1();
    window.renderEditSubP2();
    window.renderEditSubP3();

    document.getElementById('editSubmissionAnswersModal')?.classList.remove('hidden');
};

window.closeEditSubmissionAnswersModal = () => {
    document.getElementById('editSubmissionAnswersModal')?.classList.add('hidden');
};

window.switchEditSubTab = (tab) => {
    editSubState.activeTab = tab;
    ['p1', 'p2', 'p3'].forEach(t => {
        const btn = document.getElementById(`tabBtnEditSub${t.toUpperCase()}`);
        const panel = document.getElementById(`editSubPanel${t.toUpperCase()}`);
        if (btn) {
            btn.className = t === tab
                ? 'px-4 py-2 font-bold border-b-2 border-amber-600 text-amber-600 dark:text-amber-400 cursor-pointer'
                : 'px-4 py-2 font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer';
        }
        if (panel) {
            panel.classList.toggle('hidden', t !== tab);
        }
    });
};

window.renderEditSubP1 = () => {
    const cont = document.getElementById('editSubP1Container');
    if (!cont) return;
    const qCount = state.exam?.question_count || 12;
    const sub = editSubState.sub;
    const key = resolveKeyForCode(sub?.code);
    const keyAns = key.answers || '';
    const origAns = sub?._original_answers || sub?.answers || '';

    cont.innerHTML = Array.from({ length: qCount }, (_, i) => {
        const currentChoice = (editSubState.answersP1 || '')[i] || '-';
        const kChar = keyAns[i] || '-';
        const oChar = origAns[i] || '-';
        const isModified = sub?.manual_overrides?.p1?.[i] || (currentChoice !== oChar && currentChoice !== '-');

        return `
            <div class="p-2.5 rounded-xl border ${isModified ? 'border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'} flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                    <span class="font-bold text-slate-700 dark:text-slate-200 text-xs shrink-0">Câu ${i + 1}:</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold" title="Đáp án chuẩn của đề">Đ/A: ${kChar}</span>
                    ${isModified ? '<span class="text-[10px] text-purple-600 font-bold">● Sửa</span>' : ''}
                </div>
                <div class="inline-flex gap-1 shrink-0">
                    ${['A', 'B', 'C', 'D'].map(c => `
                        <button type="button" onclick="window.chooseEditSubP1(${i}, '${c}')" class="w-7 h-7 rounded-lg text-xs font-bold border transition-all cursor-pointer ${currentChoice === c ? 'bg-amber-600 text-white border-amber-600 shadow-2xs scale-105' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100'}">${c}</button>
                    `).join('')}
                    <button type="button" onclick="window.chooseEditSubP1(${i}, '-')" class="w-7 h-7 rounded-lg text-xs font-bold border text-slate-400 border-slate-300 dark:border-slate-600 hover:bg-rose-50 hover:text-rose-600 cursor-pointer" title="Bỏ trống / Tô hỏng">✕</button>
                </div>
            </div>
        `;
    }).join('');
};

window.chooseEditSubP1 = (q, val) => {
    let arr = editSubState.answersP1.split('');
    while (arr.length <= q) arr.push('-');
    arr[q] = val;
    editSubState.answersP1 = arr.join('');
    window.renderEditSubP1();
};

window.renderEditSubP2 = () => {
    const cont = document.getElementById('editSubP2Container');
    if (!cont) return;
    const qCount = state.exam?.part2_count || 4;
    const sub = editSubState.sub;
    const key = resolveKeyForCode(sub?.code);

    cont.innerHTML = Array.from({ length: qCount }, (_, q) => {
        const sChunk = (editSubState.answersP2 && editSubState.answersP2[q]) ? editSubState.answersP2[q] : '----';
        const kChunk = (key.part2 && key.part2[q]) ? key.part2[q] : '----';
        return `
            <div class="p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div class="font-bold text-xs text-slate-800 dark:text-slate-200">Câu ${q + 1} (Đúng / Sai):</div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    ${['a', 'b', 'c', 'd'].map((opt, r) => {
                        const val = (sChunk[r] || '-').toUpperCase().replace('D', 'Đ');
                        const kVal = (kChunk[r] || '-').toUpperCase().replace('D', 'Đ');
                        const isMod = sub?.manual_overrides?.p2?.[`${q}_${r}`];
                        return `
                            <div class="p-2 rounded-xl border ${isMod ? 'border-purple-300 bg-purple-50/50' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'} flex items-center justify-between">
                                <span class="font-bold text-slate-600 dark:text-slate-300 text-xs">${opt}) <small class="text-emerald-600 font-bold font-mono">${kVal}</small></span>
                                <div class="inline-flex gap-1">
                                    <button type="button" onclick="window.chooseEditSubP2(${q}, ${r}, 'Đ')" class="px-2 py-0.5 rounded text-xs font-bold border ${val === 'Đ' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-100 text-slate-600 border-slate-300'}">Đ</button>
                                    <button type="button" onclick="window.chooseEditSubP2(${q}, ${r}, 'S')" class="px-2 py-0.5 rounded text-xs font-bold border ${val === 'S' ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-100 text-slate-600 border-slate-300'}">S</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
};

window.chooseEditSubP2 = (q, r, val) => {
    while (editSubState.answersP2.length <= q) editSubState.answersP2.push('----');
    let chunk = (editSubState.answersP2[q] || '----').split('');
    while (chunk.length < 4) chunk.push('-');
    chunk[r] = val;
    editSubState.answersP2[q] = chunk.join('');
    window.renderEditSubP2();
};

window.renderEditSubP3 = () => {
    const cont = document.getElementById('editSubP3Container');
    if (!cont) return;
    const qCount = state.exam?.part3_count || 6;
    const sub = editSubState.sub;
    const key = resolveKeyForCode(sub?.code);

    cont.innerHTML = Array.from({ length: qCount }, (_, i) => {
        let val = '';
        if (Array.isArray(editSubState.answersP3)) val = editSubState.answersP3[i] || '';
        else if (Array.isArray(sub?.part3)) val = sub?.part3[i] || '';
        const kVal = (key.part3 && key.part3[i]) || '';
        const isMod = sub?.manual_overrides?.p3?.[i];

        return `
            <div class="p-2.5 rounded-xl border ${isMod ? 'border-purple-300 bg-purple-50/50' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'} space-y-1">
                <div class="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                    <span>Câu ${i + 1}:</span>
                    <span class="text-emerald-600 font-mono text-[11px]">Đ/A: ${kVal}</span>
                </div>
                <input type="text" oninput="window.changeEditSubP3(${i}, this.value)" value="${val}" placeholder="VD: -4,5" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold text-center text-xs">
            </div>
        `;
    }).join('');
};

window.changeEditSubP3 = (q, val) => {
    while (editSubState.answersP3.length <= q) editSubState.answersP3.push('');
    editSubState.answersP3[q] = val.trim();
};

window.confirmSaveSubmissionEdit = async () => {
    const sub = editSubState.sub;
    if (!sub) return;
    Swal.showLoading();

    const newSbd = document.getElementById('editSubModalSbd')?.value.trim() || sub.student_no;
    const newCode = document.getElementById('editSubModalCode')?.value.trim() || sub.code;
    const newName = document.getElementById('editSubModalName')?.value.trim() || sub.student_name;
    const reason = document.getElementById('editSubModalReason')?.value.trim() || 'Giáo viên đính chính';

    if (!sub._original_answers) sub._original_answers = sub.answers || '';
    if (!sub.manual_overrides) sub.manual_overrides = { p1: {}, p2: {}, p3: {} };

    // So sánh P1
    const qCount1 = state.exam?.question_count || 12;
    for (let i = 0; i < qCount1; i++) {
        const cur = (editSubState.answersP1 || '')[i] || '-';
        const orig = (sub._original_answers || '')[i] || '-';
        if (cur !== orig && cur !== '-') {
            sub.manual_overrides.p1[i] = { from: orig, to: cur, reason, at: new Date().toISOString() };
            sub.has_manual_override = true;
        }
    }

    // So sánh P2
    const qCount2 = state.exam?.part2_count || 4;
    for (let q = 0; q < qCount2; q++) {
        const curChunk = editSubState.answersP2[q] || '----';
        const origChunk = (sub.part2 && sub.part2[q]) ? sub.part2[q] : '----';
        for (let r = 0; r < 4; r++) {
            if (curChunk[r] && origChunk[r] && curChunk[r] !== origChunk[r]) {
                sub.manual_overrides.p2[`${q}_${r}`] = { from: origChunk[r], to: curChunk[r], reason, at: new Date().toISOString() };
                sub.has_manual_override = true;
            }
        }
    }

    // So sánh P3
    const qCount3 = state.exam?.part3_count || 6;
    for (let q = 0; q < qCount3; q++) {
        const curVal = editSubState.answersP3[q] || '';
        const origVal = (sub.part3 && sub.part3[q]) ? String(sub.part3[q]) : '';
        if (curVal !== origVal && curVal !== '') {
            sub.manual_overrides.p3[q] = { from: origVal, to: curVal, reason, at: new Date().toISOString() };
            sub.has_manual_override = true;
        }
    }

    sub.student_no = newSbd;
    sub.code = newCode;
    sub.student_name = newName;
    sub.answers = editSubState.answersP1;
    sub.part2 = editSubState.answersP2;
    sub.part3 = editSubState.answersP3;

    // Tính lại điểm
    const scoreData = calculateExamScore(sub.code, sub.answers, sub.part2, sub.part3);
    sub.score = scoreData.totalScore;
    sub.part1_score = scoreData.part1Score;
    sub.part2_score = scoreData.part2Score;
    sub.part3_score = scoreData.part3Score;

    // Nếu là bài chấm thủ công từ hàng đợi ảnh lỗi, đưa vào state.submissions và loại bỏ khỏi hàng đợi lỗi
    if (sub.is_manual_entry) {
        if (typeof sub._failedItemIdx === 'number' && state.failedBatchFiles?.[sub._failedItemIdx]) {
            state.failedBatchFiles.splice(sub._failedItemIdx, 1);
            renderBatchFailedQueue();
        }
        const existingIdx = state.submissions.findIndex(s => s.id === sub.id);
        if (existingIdx !== -1) {
            state.submissions[existingIdx] = sub;
        } else {
            state.submissions.unshift(sub);
        }
    }

    // Đóng dấu lại ảnh với vòng màu tím cho các câu sửa
    await reStampSubmission(sub);

    // Lưu vào storage & database
    if (typeof storage !== 'undefined' && storage.saveSubmissions) {
        await storage.saveSubmissions(state.exam.id, state.submissions);
    } else {
        saveSubmissionsToLocalSafe(state.exam.id, state.submissions);
    }
    if (state.teacherUid && typeof db !== 'undefined') {
        try { await setDoc(doc(db, "omr_submissions", sub.id), sub, { merge: true }); } catch (_) {}
    }

    window.closeEditSubmissionAnswersModal();
    await displayLastResultInspector(sub, null);
    window.renderResultsTable();
    updateOverviewStats();

    Swal.fire({
        icon: 'success',
        title: 'Đã đính chính bài làm!',
        text: `Đã tính lại điểm (${sub.score.toFixed(2)}đ) và đóng dấu lại ảnh với vòng màu tím cho các câu sửa.`,
        timer: 2500
    });
};


// ========================================================
// QUẢN LÝ CÂY THƯ MỤC ĐỀ THI (TREE FOLDER EXPLORER)
// ========================================================
state.folders = [];
state.currentFolderId = null; // null = root

async function loadFolders() {
    let fList = [];
    if (typeof storage !== 'undefined' && storage.getFolders) {
        fList = await storage.getFolders();
    } else {
        const raw = localStorage.getItem('bank_folders') || localStorage.getItem('omr_standalone_folders');
        if (raw) {
            try { fList = JSON.parse(raw); } catch(_) {}
        }
    }
    if (!Array.isArray(fList) || fList.length === 0) {
        fList = [
            { id: 'f_k12', name: 'Khối 12 - Ôn Thi Tốt Nghiệp', parentId: null, createdAt: new Date().toISOString() },
            { id: 'f_midterm', name: 'Khảo Sát & Giữa Kỳ', parentId: null, createdAt: new Date().toISOString() }
        ];
    }
    state.folders = fList;
    return fList;
}

window.navigateExamFolder = (folderId) => {
    state.currentFolderId = folderId;
    window.renderExamPickerList();
};

window.navigateUpExamFolder = () => {
    if (!state.currentFolderId) return;
    const cur = state.folders.find(f => f.id === state.currentFolderId);
    state.currentFolderId = cur?.parentId || null;
    window.renderExamPickerList();
};

window.createNewExamFolder = async () => {
    const { value: folderName } = await Swal.fire({
        title: 'Tạo thư mục mới',
        input: 'text',
        inputPlaceholder: 'Nhập tên thư mục (VD: Khối 11, Giữa Kỳ I...)',
        showCancelButton: true,
        confirmButtonText: 'Tạo thư mục',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#059669'
    });
    if (!folderName || !folderName.trim()) return;

    const newFolder = {
        id: 'f_' + Date.now(),
        name: folderName.trim(),
        parentId: state.currentFolderId || null,
        createdAt: new Date().toISOString()
    };
    state.folders.push(newFolder);
    if (typeof storage !== 'undefined' && storage.saveFolders) {
        await storage.saveFolders(state.folders);
    } else {
        localStorage.setItem('bank_folders', JSON.stringify(state.folders));
    }
    window.renderExamPickerList();
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Đã tạo thư mục "${newFolder.name}"`, showConfirmButton: false, timer: 2000 });
};

window.moveExamToFolder = async (examId) => {
    const ex = state.exams.find(e => e.id === examId);
    if (!ex) return;

    const inputOptions = { 'root': '📁 [Thư mục gốc]' };
    (state.folders || []).forEach(f => {
        inputOptions[f.id] = `📁 ${f.name}`;
    });

    const { value: targetFolderId } = await Swal.fire({
        title: `Chuyển đề "${ex.name}"`,
        input: 'select',
        inputOptions,
        inputValue: ex.folderId || 'root',
        showCancelButton: true,
        confirmButtonText: 'Chuyển vào đây',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#059669'
    });
    if (typeof targetFolderId === 'undefined') return;

    ex.folderId = targetFolderId === 'root' ? null : targetFolderId;
    saveLocalExams(state.exams);
    if (typeof storage !== 'undefined' && storage.saveExams) {
        await storage.saveExams(state.exams);
    }
    window.renderExamPickerList();
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã chuyển đề thi thành công!', showConfirmButton: false, timer: 1800 });
};

// ========================================================
// HIỂN THỊ DANH SÁCH ĐỀ THI DẠNG EXPLORER CÂY THƯ MỤC
// ========================================================
window.renderExamPickerList = () => {
    const listEl = document.getElementById('examPickerList') || document.getElementById('lmsExamPickerList');
    if (!listEl) return;
    const filter = (document.getElementById('examSearchInput')?.value || document.getElementById('lmsExamSearchInput')?.value || '').toLowerCase().trim();

    // 1. Cập nhật Breadcrumb Navigation
    const trailEl = document.getElementById('examBreadcrumbTrail');
    const statsEl = document.getElementById('examFolderStatsText');

    if (trailEl) {
        if (!state.currentFolderId) {
            trailEl.innerHTML = '';
        } else {
            // Build path
            const path = [];
            let curr = state.folders.find(f => f.id === state.currentFolderId);
            while (curr) {
                path.unshift(curr);
                curr = curr.parentId ? state.folders.find(f => f.id === curr.parentId) : null;
            }
            trailEl.innerHTML = path.map((f, idx) => {
                const isLast = idx === path.length - 1;
                return `
                    <span class="text-slate-300 dark:text-slate-600">/</span>
                    <button type="button" onclick="window.navigateExamFolder('${f.id}')" class="${isLast ? 'text-emerald-700 dark:text-emerald-300 font-extrabold' : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600'} transition-colors cursor-pointer truncate max-w-[150px]">
                        ${f.name}
                    </button>
                `;
            }).join('');
        }
    }

    // 2. Lọc Thư mục con & Đề thi
    let subFolders = [];
    let currentExams = [];

    if (filter) {
        // Tìm kiếm toàn diện
        currentExams = (state.exams || []).filter(e => {
            const nameMatch = e.name && e.name.toLowerCase().includes(filter);
            const codeMatch = (e.omrCode && e.omrCode.includes(filter)) || (Array.isArray(e.codes) && e.codes.some(c => c.includes(filter)));
            return nameMatch || codeMatch;
        });
    } else {
        // Lọc theo thư mục hiện tại
        subFolders = (state.folders || []).filter(f => (f.parentId || null) === (state.currentFolderId || null));
        currentExams = (state.exams || []).filter(e => (e.folderId || null) === (state.currentFolderId || null));
    }

    if (statsEl) {
        statsEl.textContent = `${subFolders.length} thư mục · ${currentExams.length} đề thi`;
    }

    if (subFolders.length === 0 && currentExams.length === 0) {
        listEl.innerHTML = `
            <div class="p-12 text-center text-slate-400">
                <i class="fa-solid fa-folder-open text-4xl mb-3 opacity-40"></i>
                <p class="text-sm font-bold text-slate-700 dark:text-slate-300">Thư mục này hiện đang trống</p>
                <p class="text-xs text-slate-500 mt-1">Chưa có đề thi hoặc thư mục con nào ${filter ? 'khớp từ khóa "' + filter + '"' : ''}.</p>
                <div class="flex items-center justify-center gap-2 mt-4">
                    <button type="button" onclick="window.createNewExamFolder()" class="px-3.5 py-2 rounded-xl btn-season-secondary text-xs font-bold cursor-pointer">
                        <i class="fa-solid fa-folder-plus text-amber-500 mr-1"></i> Tạo thư mục
                    </button>
                    <button type="button" onclick="window.closeLmsExamPickerModal(); window.closeExamPickerModal(); window.openCreateExamModal();" class="px-4 py-2 rounded-xl btn-season-primary text-xs font-bold cursor-pointer">
                        <i class="fa-solid fa-plus mr-1"></i> Tạo đề thi mới
                    </button>
                </div>
            </div>
        `;
        return;
    }

    let html = '';

    // A. Hiển thị danh sách Thư mục con (Folders Grid)
    if (subFolders.length > 0 && !filter) {
        html += `
            <div class="space-y-2">
                <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <i class="fa-solid fa-folder text-amber-500"></i> Thư mục con (${subFolders.length}):
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    ${subFolders.map(f => {
                        const countInF = (state.exams || []).filter(e => e.folderId === f.id).length;
                        return `
                            <div onclick="window.navigateExamFolder('${f.id}')" class="p-3 rounded-2xl bg-white dark:bg-[#262335] border border-gray-200/80 dark:border-[#38344D] hover:border-amber-400 dark:hover:border-amber-500 shadow-2xs hover:shadow-xs cursor-pointer transition-all flex items-center justify-between gap-3 group">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform">
                                        <i class="fa-solid fa-folder"></i>
                                    </div>
                                    <div class="min-w-0">
                                        <h5 class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate group-hover:text-amber-600 transition-colors" title="${f.name}">${f.name}</h5>
                                        <p class="text-[11px] text-slate-500 dark:text-slate-400 font-mono">${countInF} đề thi</p>
                                    </div>
                                </div>
                                <i class="fa-solid fa-chevron-right text-xs text-slate-300 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all shrink-0"></i>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // B. Hiển thị danh sách Đề thi (Exams Grid / List)
    if (currentExams.length > 0) {
        html += `
            <div class="space-y-2">
                <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <i class="fa-solid fa-file-lines text-emerald-500"></i> Bài thi (${currentExams.length}):
                </div>
                <div class="space-y-2">
                    ${currentExams.map(item => {
                        const isCurrent = state.exam?.id === item.id;
                        const omrCode = item.omrCode || (item.codes && item.codes[0]) || '101';
                        const gradedCount = (state.gradedCountsByExam && state.gradedCountsByExam[item.id]) || 0;
                        const folderOfExam = item.folderId ? state.folders.find(f => f.id === item.folderId) : null;
                        
                        return `
                            <div onclick="window.selectExamForGrading('${item.id}')" class="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-[#262335] border ${isCurrent ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-200/90 dark:border-[#38344D] hover:border-emerald-400'} shadow-2xs cursor-pointer transition-all group space-y-2.5">
                                <div class="flex items-start justify-between gap-2">
                                    <div class="flex items-start gap-2.5 min-w-0 flex-1">
                                        <div class="w-8 h-8 rounded-xl ${isCurrent ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-[#1E1B29] text-emerald-600'} flex items-center justify-center text-sm font-bold shrink-0">
                                            <i class="fa-solid fa-file-signature"></i>
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <h5 class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-snug line-clamp-2 group-hover:text-emerald-600 transition-colors" title="${(item.name || '').replace(/"/g, '&quot;')}">
                                                ${item.name}
                                            </h5>
                                            <div class="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                                <span><b>${item.question_count || 12}</b> TN (${item.part1_point ?? 0.25}đ) · <b>${item.part2_count || 4}</b> Đ/S · <b>${item.part3_count || 6}</b> TLN (${item.part3_point ?? 0.5}đ)</span>
                                                <span>•</span>
                                                <span class="font-mono text-emerald-700 dark:text-emerald-300 font-bold">Mã OMR: ${omrCode}</span>
                                                ${item.className ? `<span>• Lớp: <b>${item.className}</b></span>` : ''}
                                                ${folderOfExam ? `<span class="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold text-[10px]"><i class="fa-solid fa-folder text-[9px] mr-0.5"></i>${folderOfExam.name}</span>` : ''}
                                            </div>
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-1.5 shrink-0">
                                        ${gradedCount > 0 ? `<button type="button" onclick="event.stopPropagation(); window.clearExamSubmissions('${item.id}')" class="px-2 py-1 rounded-lg text-[10px] font-extrabold bg-emerald-50 hover:bg-rose-50 text-emerald-700 hover:text-rose-700 dark:bg-emerald-950/60 dark:hover:bg-rose-950/60 border border-emerald-300/50 dark:border-emerald-700 transition-colors cursor-pointer" title="Xóa sạch bài chấm để chấm lại">✓ Đã chấm ${gradedCount} bài <i class="fa-solid fa-rotate-left text-[9px] ml-0.5"></i></button>` : ''}
                                        ${isCurrent ? '<span class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-600 text-white">Đang chọn</span>' : ''}
                                    </div>
                                </div>

                                <div class="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-[#38344D]/70 text-[11px]">
                                    <div class="flex items-center gap-2">
                                        <button type="button" onclick="event.stopPropagation(); window.moveExamToFolder('${item.id}')" class="px-2 py-1 rounded-lg bg-gray-100 hover:bg-amber-50 dark:bg-[#1E1B29] dark:hover:bg-amber-950/50 text-slate-600 dark:text-slate-300 hover:text-amber-600 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-gray-200 dark:border-[#38344D]" title="Chuyển sang thư mục khác">
                                            <i class="fa-solid fa-folder-tree text-amber-500"></i>
                                            <span>Chuyển thư mục</span>
                                        </button>
                                        <button type="button" onclick="event.stopPropagation(); window.deleteExam('${item.id}')" class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-rose-50 dark:bg-[#1E1B29] dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs active:scale-95 transition-all cursor-pointer border border-gray-200 dark:border-[#38344D]" title="Xóa đề thi này">
                                            <i class="fa-solid fa-trash-can"></i>
                                        </button>
                                    </div>

                                    <button type="button" onclick="window.selectExamForGrading('${item.id}')" class="px-3.5 py-1.5 rounded-xl ${isCurrent ? 'bg-gray-100 dark:bg-[#1E1B29] text-slate-700 dark:text-slate-300' : 'btn-season-primary'} text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                                        <span>${isCurrent ? 'Nạp lại' : 'Chọn chấm'}</span>
                                        <i class="fa-solid fa-arrow-right text-[10px]"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    listEl.innerHTML = html;
};
window.renderLmsExamPickerList = window.renderExamPickerList;

window.openLmsExamPickerModal = async () => {
    const modal = document.getElementById('lmsExamPickerModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const searchInput = document.getElementById('lmsExamSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }

    // Đồng bộ loại phiếu hiện tại vào ô chọn loại phiếu trong modal
    const tplSelect = document.getElementById('lmsPickerTemplateSelect');
    if (tplSelect && state.exam?.sheet_template) {
        tplSelect.value = state.exam.sheet_template;
    }

    // Nạp danh sách lớp học vào ô chọn lớp trong Modal
    const classSelect = document.getElementById('lmsPickerClassSelect');
    if (classSelect) {
        classSelect.innerHTML = `<option value="">🏫 Chọn lớp chấm (tùy chọn)</option>`;
        fetchTeacherLmsClasses().then(classes => {
            classSelect.innerHTML = `<option value="">🏫 Chọn lớp chấm (tùy chọn)</option>` +
                classes.map(c => `<option value="${c.id}" ${state.exam?.classId === c.id ? 'selected' : ''}>Lớp: ${c.name || 'Lớp học'} (${c.studentCount || (c.students?.length) || 0} HS)</option>`).join('');
        });
    }

    // Nếu danh sách đề LMS đang trống, thử tải lại từ Firestore exams
    const lmsItems = (state.exams || []).filter(e => e.isLmsExam);
    if (lmsItems.length === 0 && state.teacherUid) {
        try {
            const snapLms = await getDocs(query(collection(db, "exams"), orderBy("createdAt", "desc"), limit(300)));
            const loaded = snapLms.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(e => !e.isDeleted && (e.title || e.name))
                .map(e => normalizeLmsExam(e));
            loaded.forEach(ne => {
                if (!state.exams.some(x => x.id === ne.id)) state.exams.push(ne);
            });
        } catch(e) {
            console.warn("Tải lại kho đề LMS:", e);
        }
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

    // Hiển thị TẤT CẢ đề thi: cả đề giáo viên tạo thêm trên OMR (!e.isLmsExam) VÀ đề trong Kho đề LMS (e.isLmsExam)
    const allItems = [...(state.exams || [])];

    // Ưu tiên xếp các đề ĐÃ CÓ BÀI CHẤM hoặc ĐỀ TẠO THÊM lên đầu để giáo viên tìm lại ngay lập tức
    allItems.sort((a, b) => {
        const countA = (state.gradedCountsByExam && state.gradedCountsByExam[a.id]) || 0;
        const countB = (state.gradedCountsByExam && state.gradedCountsByExam[b.id]) || 0;
        if (countA > 0 && countB === 0) return -1;
        if (countB > 0 && countA === 0) return 1;
        if (!a.isLmsExam && b.isLmsExam) return -1;
        if (a.isLmsExam && !b.isLmsExam) return 1;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    const filtered = allItems.filter(e => {
        if (!filter) return true;
        const nameMatch = e.name && e.name.toLowerCase().includes(filter);
        const codeMatch = (e.omrCode && e.omrCode.includes(filter)) || (Array.isArray(e.codes) && e.codes.some(c => c.includes(filter)));
        return nameMatch || codeMatch;
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="p-8 text-center text-slate-400">
                <i class="fa-solid fa-file-circle-question text-3xl mb-2 opacity-50"></i>
                <p class="text-xs font-semibold">Không tìm thấy đề thi nào ${filter ? 'khớp từ khóa "' + filter + '"' : 'trong tài khoản của bạn'}.</p>
                <button type="button" onclick="window.closeLmsExamPickerModal(); window.openCreateExamModal();" class="mt-3 px-4 py-2 rounded-xl btn-season-primary text-xs font-bold cursor-pointer">
                    <i class="fa-solid fa-plus mr-1"></i> Tạo đề chấm mới ngay
                </button>
            </div>
        `;
        return;
    }

    listEl.innerHTML = filtered.map(item => {
        const isCurrent = state.exam?.id === item.id;
        const omrCode = item.omrCode || (item.codes && item.codes[0]) || '101';
        const gradedCount = (state.gradedCountsByExam && state.gradedCountsByExam[item.id]) || 0;
        return `
            <div onclick="window.selectLmsExamForGrading('${item.id}')" class="p-3.5 rounded-2xl bg-white dark:bg-[#262335] border ${isCurrent ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-gray-200/90 dark:border-[#38344D] hover:border-emerald-400'} shadow-2xs cursor-pointer transition-all group space-y-2">
                <!-- Dòng 1: Dành trọn 100% chiều ngang cho Tên Đề Thi (tối đa 2 dòng rõ ràng, không bị nút che khuất) -->
                <div class="flex items-start justify-between gap-2">
                    <h5 class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-snug line-clamp-2 flex-1 group-hover:text-emerald-600 transition-colors" title="${(item.name || '').replace(/"/g, '&quot;')}">
                        ${item.name}
                    </h5>
                    <div class="flex items-center gap-1 shrink-0">
                        ${gradedCount > 0 ? `<button type="button" onclick="event.stopPropagation(); window.clearExamSubmissions('${item.id}')" class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 hover:bg-rose-100 text-emerald-800 hover:text-rose-700 dark:bg-emerald-950 dark:hover:bg-rose-950/60 dark:text-emerald-300 dark:hover:text-rose-300 border border-emerald-300/60 dark:border-emerald-700 transition-colors cursor-pointer" title="Bấm để xóa sạch ${gradedCount} bài đã chấm (chấm lại)">✓ Đã chấm ${gradedCount} bài <i class="fa-solid fa-rotate-left text-[9px] ml-1"></i></button>` : ''}
                        ${isCurrent ? '<span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-600 text-white">Đang chọn</span>' : ''}
                    </div>
                </div>

                <!-- Dòng 2: Thông tin cấu trúc + Mã đề OMR + Nút chọn gọn gàng -->
                <div class="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-[#38344D]/70 text-[11px] text-slate-500 dark:text-slate-400">
                    <div class="flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${item.isLmsExam ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}">${item.isLmsExam ? 'Kho đề LMS' : 'Đề tự tạo'}</span>
                        <span><b>${item.question_count || 12}</b> TN · <b>${item.part2_count || 4}</b> Đ/S · <b>${item.part3_count || 6}</b> TLN</span>
                        <span class="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono font-bold text-[10px]">Mã: ${omrCode}</span>
                        ${item.className ? `<span class="text-emerald-600 dark:text-emerald-400 font-bold truncate">• ${item.className}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${!item.isLmsExam ? `
                        <button type="button" onclick="event.stopPropagation(); window.deleteExam('${item.id}')" class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-rose-50 dark:bg-[#1E1B29] dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs active:scale-95 transition-all cursor-pointer border border-gray-200 dark:border-[#38344D]" title="Xóa đề thi này">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                        ` : ''}
                        <span class="px-2.5 py-1 rounded-lg ${isCurrent ? 'bg-gray-100 dark:bg-[#1E1B29] text-slate-700 dark:text-slate-300' : 'btn-season-primary'} text-[11px] font-bold shrink-0 flex items-center gap-1">
                            <span>${isCurrent ? 'Nạp lại' : 'Chọn chấm'}</span>
                            <i class="fa-solid fa-arrow-right text-[10px]"></i>
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

window.selectLmsExamForGrading = async (examId, forcedClassId = '') => {
    const pickedClassId = forcedClassId || document.getElementById('lmsPickerClassSelect')?.value || '';
    const pickedTemplate = document.getElementById('lmsPickerTemplateSelect')?.value || '';
    window.closeLmsExamPickerModal();

    try {
        let ex = state.exams.find(e => e.id === examId);

        // Nếu là đề LMS (hoặc chưa có trong danh sách), tải chi tiết câu hỏi từ bảng exams
        if (!ex || ex.isLmsExam) {
            Swal.fire({
                title: 'Đang nạp đề thi & đáp án...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
            try {
                const fullDoc = await getDoc(doc(db, "exams", examId));
                if (fullDoc.exists()) {
                    const fullData = { id: fullDoc.id, ...fullDoc.data() };
                    const normalized = normalizeLmsExam(fullData);
                    if (ex) Object.assign(ex, normalized);
                    else {
                        ex = normalized;
                        state.exams.unshift(ex);
                    }
                }
            } catch(fetchErr) {
                console.warn("Lỗi tải chi tiết đề LMS:", fetchErr);
            }
        }

        // Áp dụng Loại phiếu chấm mà giáo viên đã chọn trong Modal
        if (ex && pickedTemplate) {
            ex.sheet_template = pickedTemplate;
            try {
                localStorage.setItem(`omr_exam_class_${ex.id}`, JSON.stringify({
                    classId: pickedClassId || ex.classId || '',
                    className: ex.className || '',
                    sheet_template: pickedTemplate
                }));
            } catch(e) {}
        }

        await selectExam(examId);

        // Nếu là đề LMS, trích xuất đáp án từ câu hỏi LMS và lưu lên omr_keys
        if (state.exam && state.exam.isLmsExam) {
            autoFillKeysFromLmsQuestions(state.exam, true);
            if (state.teacherUid) {
                for (const kObj of Object.values(state.keys)) {
                    try { await setDoc(doc(db, "omr_keys", kObj.id), kObj); } catch(e) {}
                }
            }
        }

        // Nếu giáo viên chọn Lớp học trong popup, tự động đồng bộ danh sách học sinh của lớp đó
        let syncedCount = 0;
        if (pickedClassId && state.exam) {
            const stuList = await syncStudentsFromClassIdToExam(pickedClassId, state.exam, true);
            syncedCount = stuList.length;
        }

        window.switchTab('scan');

        const p1Count = state.exam?.question_count || 0;
        const p2Count = state.exam?.part2_count || 0;
        const p3Count = state.exam?.part3_count || 0;
        const classNote = state.exam?.className ? ` · Lớp ${state.exam.className} (${syncedCount} HS)` : '';
        const subNote = state.submissions?.length ? ` · Có ${state.submissions.length} bài đã chấm` : '';

        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `Đã chọn đề: ${state.exam?.name || ''} (${p1Count} TN, ${p2Count} Đ/S, ${p3Count} TLN)${classNote}${subNote}`,
            showConfirmButton: false,
            timer: 3000
        });
    } catch(err) {
        console.error("Lỗi chọn đề:", err);
        Swal.fire('Lỗi', 'Không thể nạp đề thi: ' + err.message, 'error');
    }
};

window.syncAllResultsToLmsClass = async () => {
    if (!state.exam) return;
    if (state.submissions.length === 0) {
        Swal.fire('Thông báo', 'Chưa có bài chấm nào trong bài thi này để đồng bộ!', 'info');
        return;
    }

    // Nếu bài thi chưa gắn Lớp LMS, hỏi giáo viên có muốn chọn lớp trước khi đồng bộ không
    if (!state.exam.classId) {
        const classes = await fetchTeacherLmsClasses();
        if (classes.length > 0) {
            const inputOptions = {};
            classes.forEach(c => { inputOptions[c.id] = `${c.name || 'Lớp học'} (${c.studentCount || (c.students?.length) || 0} HS)`; });
            const { value: chosenClassId } = await Swal.fire({
                title: 'Chọn Lớp học LMS để lưu bảng điểm',
                input: 'select',
                inputOptions,
                inputPlaceholder: '-- Chọn lớp học --',
                showCancelButton: true,
                confirmButtonText: 'Đồng bộ ngay',
                cancelButtonText: 'Hủy',
                confirmButtonColor: '#4f46e5'
            });
            if (!chosenClassId) return;
            await syncStudentsFromClassIdToExam(chosenClassId, state.exam, true);
        }
    }

    try {
        Swal.fire({
            title: 'Đang đồng bộ kết quả vào Lớp học LMS...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        let okCount = 0;
        for (const sub of state.submissions) {
            // Ghép lại thông tin học sinh từ danh sách lớp nếu vừa đồng bộ lớp mới
            const matched = findStudentBySbd(sub.student_no, state.exam?.id, state.exam?.classId);
            if (matched) {
                const curName = (sub.student_name || '').trim();
                const isPlaceholder = !curName || curName.startsWith('Học sinh #') || curName.startsWith('Phiếu ') || curName.startsWith('Học sinh SBD');
                if (isPlaceholder || !sub.student_name) sub.student_name = matched.name;
                sub.student_uid = matched.student_uid || sub.student_uid || '';
                sub.student_email = matched.student_email || sub.student_email || '';
                sub.class_id = matched.class_id || sub.class_id || state.exam.classId || '';
                sub.class_name = matched.class_name || sub.class_name || state.exam.className || '';
            } else {
                sub.class_id = sub.class_id || state.exam.classId || '';
                sub.class_name = sub.class_name || state.exam.className || '';
            }
            await syncSubmissionToLmsResultsCollection(sub);
            okCount++;
        }

        saveSubmissionsToLocalSafe(state.exam.id, state.submissions);
        window.renderResultsTable();

        Swal.fire({
            icon: 'success',
            title: 'Đã lưu kết quả vào Lớp học LMS!',
            text: `Đã đồng bộ ${okCount} bài chấm vào đề "${state.exam.name}"${state.exam.className ? ` (Lớp ${state.exam.className})` : ''}. Phụ huynh có thể xem điểm trực tuyến qua Link Cổng Phụ Huynh!`,
            confirmButtonColor: '#10b981'
        });
    } catch(err) {
        Swal.fire('Lỗi đồng bộ', err.message, 'error');
    }
};

let currentPhhsSubmission = null;

window.openSendParentModal = async (subId) => {
    const sub = subId ? state.submissions.find(s => s.id === subId) : state.lastSubmission;
    if (!sub) {
        Swal.fire('Thông báo', 'Chưa có kết quả bài chấm để gửi cho phụ huynh!', 'info');
        return;
    }
    currentPhhsSubmission = sub;

    const modal = document.getElementById('sendParentModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const titleEl = document.getElementById('phhsStudentTitle');
    const scoreEl = document.getElementById('phhsScoreSummary');
    const badgeEl = document.getElementById('phhsSyncStatusBadge');
    const urlInput = document.getElementById('phhsParentWatchUrl');
    const msgInput = document.getElementById('phhsMessageText');
    const previewImg = document.getElementById('phhsPreviewImg');

    const stName = sub.student_name || (sub.student_no ? `Học sinh SBD ${sub.student_no}` : 'Học sinh');
    const examTitle = state.exam?.name || 'Bài kiểm tra Toán';
    const className = sub.class_name || state.exam?.className || '';
    const totalScore = Number(sub.score || 0).toFixed(2);
    const p1Score = Number(sub.part1_score || 0).toFixed(2);
    const p2Score = Number(sub.part2_score || 0).toFixed(2);
    const p3Score = Number(sub.part3_score || 0).toFixed(2);

    if (titleEl) titleEl.textContent = `${stName} ${sub.student_no ? `(SBD: ${sub.student_no})` : ''}${className ? ` · ${className}` : ''}`;
    if (scoreEl) scoreEl.textContent = `Tổng điểm: ${totalScore} / 10 đ (Phần I: ${p1Score}đ · Phần II: ${p2Score}đ · Phần III: ${p3Score}đ)`;
    if (previewImg && sub.image_data) previewImg.src = sub.image_data;

    // Đồng bộ bài chấm lên bảng "results" của LMS ngay để phụ huynh mở link thấy điểm tức thì
    if (badgeEl) {
        badgeEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Đang đồng bộ LMS...';
    }
    try {
        await syncSubmissionToLmsResultsCollection(sub);
        if (badgeEl) badgeEl.innerHTML = '<i class="fa-solid fa-cloud-check mr-1"></i>Đã lưu vào Lớp LMS';
    } catch(e) {
        if (badgeEl) badgeEl.innerHTML = '<i class="fa-solid fa-check mr-1"></i>Sẵn sàng gửi';
    }

    // Tạo link Cổng Phụ Huynh (parent-watch.html?t=...) nếu học sinh có tài khoản trong lớp LMS
    let parentWatchUrl = `${window.location.origin}/parent-watch.html`;
    if (urlInput) urlInput.value = 'Đang tạo đường link theo dõi cho Phụ huynh...';

    const matchedStu = findStudentBySbd(sub.student_no, sub.examId || state.exam?.id, sub.class_id || state.exam?.classId);
    const studentUid = sub.student_uid || matchedStu?.student_uid || '';
    if (studentUid && typeof getOrCreateParentWatchToken === 'function') {
        try {
            const token = await getOrCreateParentWatchToken(studentUid);
            if (token) {
                parentWatchUrl = `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}parent-watch.html?t=${encodeURIComponent(token)}`;
            }
        } catch(e) {
            console.warn("Không tạo được parent watch token:", e);
        }
    }
    if (urlInput) urlInput.value = parentWatchUrl;

    if (msgInput) {
        msgInput.value =
`📊 THÔNG BÁO KẾT QUẢ BÀI THI - QMATH LMS
👩‍🎓 Học sinh: ${stName}${sub.student_no ? ` (SBD: ${sub.student_no})` : ''}${className ? ` - Lớp: ${className}` : ''}
📝 Bài thi: ${examTitle} (Mã đề: ${sub.code || '101'})
🏆 Tổng điểm: ${totalScore} / 10 điểm
   • Phần I (Trắc nghiệm): ${p1Score} đ
   • Phần II (Đúng/Sai): ${p2Score} đ
   • Phần III (Trả lời ngắn): ${p3Score} đ
🔗 Xem chi tiết lịch sử học tập & bài chấm trực tuyến tại:
${parentWatchUrl}`;
    }
};

window.closeSendParentModal = () => {
    const modal = document.getElementById('sendParentModal');
    if (modal) modal.classList.add('hidden');
};

window.copyParentWatchUrl = async () => {
    const url = document.getElementById('phhsParentWatchUrl')?.value || '';
    if (!url) return;
    try {
        await navigator.clipboard.writeText(url);
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã copy đường link Phụ huynh!', showConfirmButton: false, timer: 1800 });
    } catch(e) {}
};

window.copyPhhsMessageAndImage = async () => {
    const msg = document.getElementById('phhsMessageText')?.value || '';
    try {
        await navigator.clipboard.writeText(msg);
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã copy nội dung tin nhắn gửi PHHS!', showConfirmButton: false, timer: 2000 });
    } catch(e) {}
};

window.shareResultToParent = async () => {
    const sub = currentPhhsSubmission || state.lastSubmission;
    if (!sub) return;
    const msg = document.getElementById('phhsMessageText')?.value || '';

    try {
        // Nếu trình duyệt hỗ trợ Web Share API (điện thoại iOS / Android hoặc Windows/macOS) -> chia sẻ trực tiếp cả File ảnh phiếu đã đóng dấu + Tin nhắn qua Zalo / Messenger!
        if (navigator.share && sub.image_data) {
            const res = await fetch(sub.image_data);
            const blob = await res.blob();
            const sbd = sub.student_no || 'SBD';
            const file = new File([blob], `PhieuCham_${sbd}.jpg`, { type: 'image/jpeg' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: `Kết quả bài thi - ${sub.student_name || sbd}`,
                    text: msg,
                    files: [file]
                });
                return;
            } else {
                await navigator.share({
                    title: `Kết quả bài thi - ${sub.student_name || sbd}`,
                    text: msg
                });
                return;
            }
        }
    } catch(shareErr) {
        if (shareErr && shareErr.name === 'AbortError') return;
        console.warn("Web Share fallback:", shareErr);
    }

    // Fallback trên máy tính: Tự động copy tin nhắn và tải ảnh phiếu đóng dấu để dán ngay vào Zalo PC
    try { await navigator.clipboard.writeText(msg); } catch(e) {}
    state.lastSubmission = sub;
    window.downloadGradedSheet();
    Swal.fire({
        icon: 'success',
        title: 'Đã Copy tin nhắn & Tải ảnh phiếu!',
        text: 'Bạn có thể mở Zalo / Messenger và nhấn Ctrl+V để gửi ngay cho Phụ huynh học sinh.',
        confirmButtonColor: '#4f46e5'
    });
};
