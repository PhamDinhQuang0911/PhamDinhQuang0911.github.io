/**
 * QMath Anti-Screenshot & Copyright Protection System
 * Cơ chế bảo vệ bản quyền bài tập & lời giải dành cho học sinh.
 * - KHÔNG dùng overlay đen, KHÔNG làm lag GPU, KHÔNG gây đơ trình duyệt di động.
 * - Cảnh báo vi phạm bản quyền khi phát hiện thao tác chụp ảnh màn hình hoặc sao chép.
 * - Chặn in ấn (@media print), chặn bôi đen/chuột phải trong vùng bảo vệ.
 * - Cho phép giáo viên bật/tắt theo 4 khu vực độc lập từ Dashboard:
 *    1. leaderboard: Bảng xếp hạng học sinh
 *    2. lookup: Tra cứu câu hỏi & lời giải theo ID / CCCD
 *    3. review: Xem lại bài thi sau khi nộp
 *    4. solutions: Lời giải chi tiết câu hỏi
 */
(function() {
    'use strict';

    const STORAGE_KEY = 'qmath_security_config';

    const DEFAULT_CONFIG = {
        leaderboard: true,
        lookup: true,
        review: true,
        solutions: true
    };

    function loadCachedConfig() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return { ...DEFAULT_CONFIG, ...(parsed.antiScreenshot || parsed) };
            }
        } catch(e) {}
        return { ...DEFAULT_CONFIG };
    }

    let currentConfig = loadCachedConfig();
    const activeZones = new Set();
    let isWarningModalOpen = false;
    let wasBlurredWhileProtected = false;

    // 1. Chèn CSS bản quyền: Chống in ấn & chống sao chép trong vùng bảo vệ
    if (!document.getElementById('qmathAntiScreenshotStyles')) {
        const style = document.createElement('style');
        style.id = 'qmathAntiScreenshotStyles';
        style.textContent = `
            /* Ẩn nội dung khi in ấn nếu đang ở vùng bảo vệ */
            @media print {
                body.anti-screenshot-active #lookupModalBody,
                body.anti-screenshot-active #lookupSolutionSection,
                body.anti-screenshot-active #examLeaderboardBox,
                body.anti-screenshot-active #solutionView,
                body.anti-screenshot-active #practiceStep,
                body.anti-screenshot-active .protected-zone {
                    display: none !important;
                }
            }
            /* Chống bôi đen sao chép trong vùng bảo vệ */
            body.anti-screenshot-active #lookupModalBody,
            body.anti-screenshot-active #lookupSolutionSection,
            body.anti-screenshot-active #examLeaderboardBox,
            body.anti-screenshot-active #solutionView,
            body.anti-screenshot-active .protected-content {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
            @keyframes qmWarningScaleIn {
                0% { transform: scale(0.9); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }
            .qm-warning-box {
                animation: qmWarningScaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
        `;
        document.head.appendChild(style);
    }

    function isProtected() {
        if (activeZones.size === 0) return false;
        for (const zone of activeZones) {
            if (currentConfig[zone] === true) return true;
        }
        return false;
    }

    // 2. Modal Cảnh Báo Bản Quyền & Vi Phạm (Trực quan, chuẩn nhận diện thương hiệu QMath)
    function showCopyrightWarningModal(triggerSource = 'screenshot') {
        if (isWarningModalOpen) return;
        if (!isProtected()) return;

        isWarningModalOpen = true;

        // Xóa modal cũ nếu còn sót
        const oldModal = document.getElementById('qmathCopyrightWarningModal');
        if (oldModal) oldModal.remove();

        const modal = document.createElement('div');
        modal.id = 'qmathCopyrightWarningModal';
        modal.className = 'fixed inset-0 z-[2147483647] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200';
        modal.innerHTML = `
            <div class="qm-warning-box bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-7 max-w-sm w-full text-center shadow-2xl border-2 border-red-500 relative overflow-hidden">
                <div class="w-16 h-16 bg-red-100 dark:bg-red-950/60 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl text-red-600 dark:text-red-400 border-2 border-red-200 dark:border-red-800/50 shadow-inner">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
                <div class="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-[11px] font-black uppercase tracking-wider mb-2 border border-red-100 dark:border-red-800/40">
                    <i class="fa-solid fa-triangle-exclamation"></i> Cảnh báo vi phạm
                </div>
                <h3 class="text-lg font-black text-gray-900 dark:text-white mb-2 leading-snug">
                    Nội Dung Được Bảo Vệ Bản Quyền
                </h3>
                <p class="text-xs text-gray-600 dark:text-slate-300 leading-relaxed mb-4 text-justify">
                    Hệ thống phát hiện thao tác <b>chụp ảnh màn hình</b> hoặc sao chép nội dung. Toàn bộ đề thi, lời giải và bảng xếp hạng thuộc bản quyền độc quyền của <b>Thầy Phạm Đình Quang</b>.
                </p>
                <div class="bg-gray-50 dark:bg-slate-700/50 rounded-xl p-2.5 mb-5 text-[11px] text-gray-500 dark:text-slate-400 text-center italic">
                    <i class="fa-solid fa-circle-info text-amber-500 mr-1"></i>Hành vi đã được ghi nhận vào hệ thống để bảo vệ tác quyền.
                </div>
                <button id="btnDismissCopyrightWarning" class="w-full py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-500/25 active:scale-95 transition-all cursor-pointer">
                    Đã hiểu, tôi sẽ tiếp tục học
                </button>
            </div>
        `;
        document.body.appendChild(modal);

        const closeWarning = () => {
            modal.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                modal.remove();
                isWarningModalOpen = false;
            }, 200);
        };

        document.getElementById('btnDismissCopyrightWarning')?.addEventListener('click', closeWarning);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeWarning();
        });
    }

    // 3. Đè bản quyền vào Clipboard khi có hành vi đáng ngờ
    function stampClipboardCopyright() {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('Nội dung đề thi & lời giải thuộc bản quyền Thầy Phạm Đình Quang - QMath (https://qmath.io.vn)');
            }
        } catch(e) {}
    }

    // 4. Phát hiện chụp ảnh màn hình trên Điện thoại (Blur / VisibilityChange)
    window.addEventListener('blur', () => {
        if (isProtected()) {
            wasBlurredWhileProtected = true;
            stampClipboardCopyright();
        }
    });

    window.addEventListener('focus', () => {
        if (wasBlurredWhileProtected && isProtected()) {
            wasBlurredWhileProtected = false;
            showCopyrightWarningModal('screenshot_mobile');
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            if (isProtected()) {
                wasBlurredWhileProtected = true;
                stampClipboardCopyright();
            }
        } else if (document.visibilityState === 'visible') {
            if (wasBlurredWhileProtected && isProtected()) {
                wasBlurredWhileProtected = false;
                showCopyrightWarningModal('screenshot_mobile');
            }
        }
    });

    // 5. Chặn phím tắt chụp ảnh PC & in ấn
    window.addEventListener('keydown', (e) => {
        if (!isProtected()) return;
        if (
            e.key === 'PrintScreen' ||
            (e.ctrlKey && (e.key === 'p' || e.key === 's' || e.key === 'P' || e.key === 'S')) ||
            (e.ctrlKey && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === 'i' || e.key === 'I')) ||
            (e.metaKey && e.shiftKey) // macOS Cmd+Shift+3/4
        ) {
            e.preventDefault();
            e.stopPropagation();
            stampClipboardCopyright();
            showCopyrightWarningModal('screenshot_key');
            return false;
        }
    });

    window.addEventListener('keyup', (e) => {
        if (!isProtected()) return;
        if (e.key === 'PrintScreen') {
            stampClipboardCopyright();
            showCopyrightWarningModal('screenshot_key');
        }
    });

    // 6. Chặn chuột phải & copy trong vùng bảo vệ
    document.addEventListener('contextmenu', (e) => {
        if (isProtected()) {
            e.preventDefault();
            return false;
        }
    });

    document.addEventListener('copy', (e) => {
        if (isProtected()) {
            e.preventDefault();
            stampClipboardCopyright();
            if (window.showNotification) {
                window.showNotification("⚠️ Nội dung được bảo vệ bản quyền thuộc Thầy Phạm Đình Quang!", "warning");
            } else if (typeof window.showToast === 'function') {
                window.showToast("⚠️ Nội dung được bảo vệ bản quyền thuộc Thầy Phạm Đình Quang!", "warning");
            }
            return false;
        }
    });

    // 7. Global API
    window.AntiScreenshot = {
        getConfig() {
            return { ...currentConfig };
        },
        updateConfig(newConfig) {
            currentConfig = { ...currentConfig, ...newConfig };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig));
            } catch(e) {}
            if (isProtected()) {
                document.body.classList.add('anti-screenshot-active');
            } else {
                document.body.classList.remove('anti-screenshot-active');
            }
        },
        enterZone(zoneName) {
            activeZones.add(zoneName);
            if (isProtected()) {
                document.body.classList.add('anti-screenshot-active');
            }
        },
        leaveZone(zoneName) {
            activeZones.delete(zoneName);
            if (!isProtected()) {
                document.body.classList.remove('anti-screenshot-active');
            }
        },
        isCurrentlyProtected() {
            return isProtected();
        },
        async syncFromFirestore(db, docFn, getDocFn) {
            if (!db || !docFn || !getDocFn) return;
            try {
                const snap = await getDocFn(docFn(db, "site_settings", "security_config"));
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.antiScreenshot) {
                        this.updateConfig(data.antiScreenshot);
                    }
                }
            } catch(e) {
                console.warn("Không đồng bộ được cấu hình bảo mật:", e.message);
            }
        }
    };
})();
