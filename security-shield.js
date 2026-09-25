/**
 * QMath Security Shield
 * Bảo vệ bản quyền & chống chụp màn hình cho các khu vực nhạy cảm:
 * 1. Bảng Xếp Hạng (#examLeaderboardModal / #examLeaderboardBox / #leaderboardModal)
 * 2. Tra cứu câu hỏi theo ID & Lời giải (#studentQuestionLookupModal / #lookupModalBody)
 * 3. Xem chi tiết Lời giải đề thi (#solutionView / #solutionContentArea)
 */
(function() {
    'use strict';

    // Danh sách các selector cần bảo vệ khi đang hiển thị
    const PROTECTED_SELECTORS = [
        {
            modal: '#examLeaderboardModal',
            content: '#examLeaderboardBox',
            isOpen: function(m) { return m && !m.classList.contains('hidden') && !m.classList.contains('opacity-0'); }
        },
        {
            modal: '#leaderboardModal',
            content: '#leaderboardModal > div',
            isOpen: function(m) { return m && !m.classList.contains('hidden') && !m.classList.contains('opacity-0'); }
        },
        {
            modal: '#studentQuestionLookupModal',
            content: '#lookupModalBody',
            isOpen: function(m) { return m && !m.classList.contains('pointer-events-none') && !m.classList.contains('opacity-0'); }
        },
        {
            modal: '#solutionView',
            content: '#solutionView',
            isOpen: function(m) { return m && !m.classList.contains('hidden'); }
        }
    ];

    function getActiveProtectedElements() {
        const activeElements = [];
        for (let i = 0; i < PROTECTED_SELECTORS.length; i++) {
            const item = PROTECTED_SELECTORS[i];
            const modalEl = document.querySelector(item.modal);
            if (item.isOpen(modalEl)) {
                const contentEl = item.content ? document.querySelector(item.content) : modalEl;
                if (contentEl) activeElements.push(contentEl);
            }
        }
        return activeElements;
    }

    let unblurTimer = null;

    function applyShieldBlur(duration) {
        const targets = getActiveProtectedElements();
        if (targets.length === 0) return;

        targets.forEach(function(el) {
            el.style.transition = 'filter 0.08s ease';
            el.style.filter = 'blur(28px)';
            el.style.userSelect = 'none';
            el.style.webkitUserSelect = 'none';
        });

        if (duration && duration > 0) {
            clearTimeout(unblurTimer);
            unblurTimer = setTimeout(removeShieldBlur, duration);
        }
    }

    function removeShieldBlur(delay) {
        clearTimeout(unblurTimer);
        const wait = typeof delay === 'number' ? delay : 350;
        unblurTimer = setTimeout(function() {
            const targets = getActiveProtectedElements();
            targets.forEach(function(el) {
                el.style.filter = '';
            });
        }, wait);
    }

    // 1. Chống chụp màn hình trên điện thoại di động (iOS / Android)
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            applyShieldBlur();
        } else {
            removeShieldBlur(400);
        }
    }, { passive: true });

    window.addEventListener('blur', function() {
        applyShieldBlur();
    }, { passive: true });

    window.addEventListener('focus', function() {
        removeShieldBlur(350);
    }, { passive: true });

    // 2. Chặn các phím chụp màn hình trên máy tính (PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5)
    window.addEventListener('keyup', function(e) {
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            applyShieldBlur(1800);
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText('Nội dung được bảo vệ bản quyền bởi QMath!');
                }
            } catch (_) {}
        }
    }, { passive: true });

    window.addEventListener('keydown', function(e) {
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            applyShieldBlur(1800);
        }
        // Chặn Ctrl+P / Cmd+P (In ấn khi đang mở tài liệu bảo mật)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
            const targets = getActiveProtectedElements();
            if (targets.length > 0) {
                e.preventDefault();
                applyShieldBlur(1500);
            }
        }
        // Chặn Mac Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5
        if (e.metaKey && e.shiftKey && ['3', '4', '5'].indexOf(e.key) !== -1) {
            applyShieldBlur(1800);
        }
    });

    // 3. Chống sao chép & click chuột phải trong các khu vực bảo vệ
    document.addEventListener('contextmenu', function(e) {
        const targets = getActiveProtectedElements();
        for (let i = 0; i < targets.length; i++) {
            if (targets[i].contains(e.target)) {
                e.preventDefault();
                return false;
            }
        }
    });

    document.addEventListener('copy', function(e) {
        const targets = getActiveProtectedElements();
        for (let i = 0; i < targets.length; i++) {
            if (targets[i].contains(e.target)) {
                e.preventDefault();
                if (e.clipboardData) {
                    e.clipboardData.setData('text/plain', 'Nội dung được bảo vệ bản quyền bởi QMath!');
                }
                return false;
            }
        }
    });

    // 4. Áp dụng CSS user-select: none cho các khu vực bảo mật khi trang sẵn sàng
    function applySelectNone() {
        if (document.getElementById('qmath-security-style')) return;
        const style = document.createElement('style');
        style.id = 'qmath-security-style';
        style.textContent = `
            #examLeaderboardBox, #lookupModalBody, #solutionView {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applySelectNone);
    } else {
        applySelectNone();
    }
})();
