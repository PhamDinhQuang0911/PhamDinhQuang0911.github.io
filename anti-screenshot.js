/**
 * QMath Anti-Screenshot & Copyright Protection System
 * Tái tạo và nhân rộng cơ chế chống chụp ảnh màn hình bản quyền (màn hình đen, chặn print, blur khi mất focus).
 * Hỗ trợ giáo viên cấu hình bật/tắt theo từng khu vực:
 *  - leaderboard: Bảng xếp hạng học sinh
 *  - lookup: Tra cứu câu hỏi & lời giải theo ID / CCCD
 *  - review: Xem lại bài thi sau khi nộp
 *  - solutions: Lời giải chi tiết câu hỏi
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
    let isWarningShown = false;

    // 1. Chèn CSS chống chụp màn hình & in ấn
    if (!document.getElementById('qmathAntiScreenshotStyles')) {
        const style = document.createElement('style');
        style.id = 'qmathAntiScreenshotStyles';
        style.textContent = `
            #anti-screenshot-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background-color: #000 !important;
                z-index: 2147483647 !important;
                display: none;
                cursor: not-allowed !important;
                pointer-events: auto !important;
            }
            @media print {
                body.anti-screenshot-active, body.anti-screenshot-active * {
                    display: none !important;
                }
            }
            .blur-content-protected, .blur-content {
                filter: blur(25px) grayscale(100%) !important;
                transition: filter 0.05s linear !important;
            }
        `;
        document.head.appendChild(style);
    }

    // 2. Tạo overlay đen phủ toàn màn hình
    let overlay = document.getElementById('anti-screenshot-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'anti-screenshot-overlay';
        if (document.body) {
            document.body.appendChild(overlay);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                if (!document.getElementById('anti-screenshot-overlay')) {
                    document.body.appendChild(overlay);
                }
            });
        }
    }

    function isProtected() {
        if (activeZones.size === 0) return false;
        for (const zone of activeZones) {
            if (currentConfig[zone] === true) return true;
        }
        return false;
    }

    function activeBlackScreen(duration = 800) {
        if (!isProtected()) return;
        if (overlay) overlay.style.display = 'block';
        setTimeout(() => {
            if (!isProtected() || document.hasFocus()) {
                if (overlay) overlay.style.display = 'none';
            }
        }, duration);
    }

    let wasBlurredWhileProtected = false;
    let blurStart = 0;

    function showCopyrightAlert() {
        if (isWarningShown) return;
        isWarningShown = true;
        setTimeout(() => { isWarningShown = false; }, 3500);
        try {
            alert('Cảnh báo: Nội dung bản quyền. Hành động chụp màn hình đã bị chặn.');
        } catch(e) {
            if (typeof window.customAlert === 'function') {
                window.customAlert('Cảnh báo: Nội dung bản quyền. Hành động chụp màn hình đã bị chặn.', 'warning');
            }
        }
    }

    // 3. Xử lý mất focus (Điện thoại bấm tổ hợp chụp ảnh màn hình / Snipping tool / Chuyển tab)
    window.addEventListener('blur', () => {
        if (isProtected()) {
            wasBlurredWhileProtected = true;
            blurStart = Date.now();
            if (overlay) overlay.style.display = 'block';
            document.body.classList.add('blur-content-protected');
            document.body.classList.add('blur-content');
        }
    });

    window.addEventListener('focus', () => {
        if (overlay && overlay.style.display === 'block') {
            overlay.style.display = 'none';
        }
        document.body.classList.remove('blur-content-protected');
        document.body.classList.remove('blur-content');
        if (wasBlurredWhileProtected && isProtected()) {
            wasBlurredWhileProtected = false;
            showCopyrightAlert();
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            if (isProtected()) {
                wasBlurredWhileProtected = true;
                blurStart = Date.now();
                if (overlay) overlay.style.display = 'block';
                document.body.classList.add('blur-content-protected');
                document.body.classList.add('blur-content');
            }
        } else {
            if (overlay && overlay.style.display === 'block') {
                overlay.style.display = 'none';
            }
            document.body.classList.remove('blur-content-protected');
            document.body.classList.remove('blur-content');
            if (wasBlurredWhileProtected && isProtected()) {
                wasBlurredWhileProtected = false;
                showCopyrightAlert();
            }
        }
    });

    // 4. Chặn phím tắt chụp màn hình & F12 & In ấn trên máy tính
    document.addEventListener('keydown', (e) => {
        if (!isProtected()) return;
        if (
            e.key === 'F12' || 
            e.key === 'PrintScreen' ||
            (e.ctrlKey && (e.key === 'p' || e.key === 's' || e.key === 'u' || e.key === 'P' || e.key === 'S' || e.key === 'U')) ||
            (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'c' || e.key === 'j' || e.key === 's' || e.key === 'I' || e.key === 'C' || e.key === 'J' || e.key === 'S')) ||
            (e.metaKey && e.shiftKey) // Mac OS Command + Shift + 3/4/5
        ) {
            activeBlackScreen(1200);
            e.preventDefault();
            e.stopPropagation();
            try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(''); } catch(err) {}
            return false;
        }
    });

    document.addEventListener('keyup', (e) => {
        if (!isProtected()) return;
        if (e.key === 'PrintScreen') {
            activeBlackScreen(1200);
            try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(''); } catch(err) {}
            showCopyrightAlert();
        }
    });

    // 5. Chặn chuột phải trong khu vực được bảo vệ
    document.addEventListener('contextmenu', (e) => {
        if (isProtected()) {
            e.preventDefault();
            return false;
        }
    });

    // 6. Global API
    window.AntiScreenshot = {
        getConfig() {
            return { ...currentConfig };
        },
        updateConfig(newConfig) {
            currentConfig = { ...currentConfig, ...newConfig };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig));
            } catch(e) {}
            if (!isProtected()) {
                if (overlay) overlay.style.display = 'none';
                document.body.classList.remove('anti-screenshot-active');
                document.body.classList.remove('blur-content-protected');
                document.body.classList.remove('blur-content');
            } else {
                document.body.classList.add('anti-screenshot-active');
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
                document.body.classList.remove('blur-content-protected');
                document.body.classList.remove('blur-content');
                if (overlay) overlay.style.display = 'none';
            }
        },
        isCurrentlyProtected() {
            return isProtected();
        },
        // Đồng bộ cấu hình từ Firestore
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
