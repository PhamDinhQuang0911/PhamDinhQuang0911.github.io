/**
 * QMath Security Shield (Cơ chế Chống Chụp Màn Hình & Bảo Vệ Bản Quyền Gốc)
 * - Tự động kích hoạt màn hình đen tuyệt đối (#000) khi phát hiện hành vi chụp ảnh.
 * - Hiển thị cảnh báo vi phạm bản quyền.
 * - Xóa sạch clipboard và vô hiệu hóa công cụ chụp (PrintScreen, Snipping Tool, phím cứng điện thoại).
 */
(function() {
    'use strict';

    // 1. TẠO LỚP PHỦ MÀN HÌNH ĐEN & CSS BẢO VỆ
    function injectProtectionStylesAndOverlay() {
        if (document.getElementById('anti-screenshot-overlay')) return;

        // Thêm CSS bảo vệ
        const style = document.createElement('style');
        style.id = 'anti-screenshot-styles';
        style.textContent = `
            #anti-screenshot-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background-color: #000000 !important;
                z-index: 2147483647 !important;
                display: none;
                cursor: not-allowed;
                pointer-events: all;
            }
            @media print {
                body { display: none !important; }
            }
            .blur-content {
                filter: blur(25px) grayscale(100%) !important;
                transition: filter 0.05s linear;
            }
            #examLeaderboardBox, #lookupModalBody, #solutionView {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
        `;
        document.head.appendChild(style);

        // Thêm div màn hình đen
        const overlay = document.createElement('div');
        overlay.id = 'anti-screenshot-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectProtectionStylesAndOverlay);
    } else {
        injectProtectionStylesAndOverlay();
    }

    let isWarningShown = false;
    let blackScreenTimer = null;

    // 2. HÀM KÍCH HOẠT MÀN HÌNH ĐEN TUYỆT ĐỐI (0.8 GIÂY)
    function activeBlackScreen(duration) {
        const overlay = document.getElementById('anti-screenshot-overlay');
        if (!overlay) return;
        overlay.style.display = 'block';
        clearTimeout(blackScreenTimer);
        const time = typeof duration === 'number' ? duration : 800;
        blackScreenTimer = setTimeout(function() {
            overlay.style.display = 'none';
        }, time);
    }

    // 3. HIỂN THỊ CẢNH BÁO VI PHẠM BẢN QUYỀN
    function showViolationWarning() {
        if (isWarningShown) return;
        isWarningShown = true;
        setTimeout(function() { isWarningShown = false; }, 4000);

        const msg = 'Cảnh báo: Nội dung bản quyền. Hành vi chụp màn hình đã bị chặn!';
        if (typeof window.showNotification === 'function') {
            window.showNotification(msg, 'error');
        } else if (typeof window.customAlert === 'function') {
            window.customAlert(msg, 'error');
        } else {
            alert(msg);
        }
    }

    // 4. CHẶN PHÍM TẮT CHỤP MÀN HÌNH & F12
    document.addEventListener('keydown', function(e) {
        // Danh sách phím cần chặn: F12, PrintScreen, Ctrl+P, Ctrl+S, Ctrl+Shift+I/C/J/S, Mac Cmd+Shift+3/4/5
        const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
        const isDevTools = e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['i', 'c', 'j'].indexOf(e.key.toLowerCase()) !== -1);
        const isPrintOrSave = (e.ctrlKey || e.metaKey) && ['p', 's', 'u'].indexOf(e.key.toLowerCase()) !== -1;
        const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5', 's'].indexOf(e.key.toLowerCase()) !== -1;

        if (isPrintScreen || isDevTools || isPrintOrSave || isMacScreenshot) {
            activeBlackScreen(900);
            e.preventDefault();
            e.stopPropagation();

            // Xóa sạch clipboard
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText('Nội dung được bảo vệ bản quyền bởi QMath!');
                }
            } catch (_) {}

            showViolationWarning();
            return false;
        }
    }, true);

    // 5. XỬ LÝ PHÍM PRINTSCREEN (Sự kiện Keyup)
    document.addEventListener('keyup', function(e) {
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            activeBlackScreen(900);
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText('Nội dung được bảo vệ bản quyền bởi QMath!');
                }
            } catch (_) {}
            showViolationWarning();
        }
    }, true);

    // 6. CHỐNG CHỤP MÀN HÌNH TRÊN ĐIỆN THOẠI & CHỐNG SNIPPING TOOL / LIGHTSHOT
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            activeBlackScreen(1200);
            if (document.body) document.body.classList.add('blur-content');
        } else {
            const overlay = document.getElementById('anti-screenshot-overlay');
            if (overlay) overlay.style.display = 'none';
            if (document.body) document.body.classList.remove('blur-content');
        }
    });

    // Mất tiêu điểm cửa sổ (chống Snipping Tool trên máy tính)
    window.addEventListener('blur', function() {
        // Tránh kích hoạt nhầm khi học sinh đang gõ vào ô input/textarea
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
            return;
        }
        const overlay = document.getElementById('anti-screenshot-overlay');
        if (overlay) overlay.style.display = 'block';
        if (document.body) document.body.classList.add('blur-content');
    });

    window.addEventListener('focus', function() {
        const overlay = document.getElementById('anti-screenshot-overlay');
        if (overlay) overlay.style.display = 'none';
        if (document.body) document.body.classList.remove('blur-content');
    });

    // 7. CHẶN CHUỘT PHẢI
    document.addEventListener('contextmenu', function(e) {
        const tag = e.target ? e.target.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
        e.preventDefault();
        return false;
    });

    // 8. CHẶN SAO CHÉP TRONG CÁC KHU VỰC BẢO MẬT
    document.addEventListener('copy', function(e) {
        const tag = e.target ? e.target.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;

        e.preventDefault();
        if (e.clipboardData) {
            e.clipboardData.setData('text/plain', 'Nội dung được bảo vệ bản quyền bởi QMath!');
        }
        showViolationWarning();
        return false;
    });
})();
