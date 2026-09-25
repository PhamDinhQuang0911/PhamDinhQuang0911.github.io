/**
 * QMath Security Shield (Cơ chế Chặn Chụp Màn Hình & Cảnh Báo Vi Phạm Bản Quyền)
 * - Chặn trực tiếp phím tắt chụp màn hình (PrintScreen, Win+Shift+S, Mac Cmd+Shift+3/4/5, Ctrl+P).
 * - Chặn cử chỉ vuốt 3 ngón tay trên màn hình điện thoại (thao tác chụp màn hình Android/iOS).
 * - Tự động hiển thị Modal Cảnh Báo Vi Phạm Bản Quyền khi phát hiện hành vi chụp.
 * - Xóa sạch clipboard, ngăn chặn bôi đen và sao chép nội dung.
 * - Tuyệt đối KHÔNG dùng màn hình đen, KHÔNG làm ảnh hưởng đến thao tác vuốt chạm thông thường.
 */
(function() {
    'use strict';

    // 1. TỰ ĐỘNG CHÈN CSS CHỐNG BÔI ĐEN VÀ MODAL CẢNH BÁO
    function initSecurityShieldUI() {
        if (document.getElementById('qmath-security-shield-style')) return;

        // CSS
        const style = document.createElement('style');
        style.id = 'qmath-security-shield-style';
        style.textContent = `
            #examLeaderboardBox, #lookupModalBody, #solutionView {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
            @media print {
                body { display: none !important; }
            }
            #copyrightViolationModal {
                transition: opacity 0.25s ease-out;
            }
            #copyrightViolationModal .violation-box {
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
        `;
        document.head.appendChild(style);

        // Tạo Modal Cảnh Báo Vi Phạm Bản Quyền
        if (!document.getElementById('copyrightViolationModal')) {
            const modalHtml = `
            <div id="copyrightViolationModal" class="fixed inset-0 z-[2147483647] flex items-center justify-center bg-gray-950/80 backdrop-blur-md hidden opacity-0 p-4 select-none pointer-events-auto">
                <div class="violation-box bg-white dark:bg-[#1e1b2e] rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl transform scale-90 border-2 border-red-500/80 relative">
                    <div class="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl sm:text-4xl border border-red-200 dark:border-red-800 animate-pulse">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <h3 class="text-lg sm:text-xl font-black text-red-600 dark:text-red-400 uppercase tracking-tight mb-2">Cảnh báo vi phạm bản quyền!</h3>
                    <p class="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium mb-5" id="copyrightViolationMsg">
                        Hệ thống phát hiện hành vi chụp màn hình hoặc sao chép nội dung được bảo vệ. Hành vi này đã bị chặn và ghi nhận vi phạm!
                    </p>
                    <button id="btnDismissCopyrightViolation" type="button" class="w-full py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-lg shadow-red-500/25 transition-all transform active:scale-95 cursor-pointer">
                        Tôi đã hiểu & Cam kết tuân thủ
                    </button>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Bắt sự kiện đóng modal
            const btnClose = document.getElementById('btnDismissCopyrightViolation');
            if (btnClose) {
                btnClose.addEventListener('click', closeViolationModal);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSecurityShieldUI);
    } else {
        initSecurityShieldUI();
    }

    let isModalOpen = false;
    let lastViolationTime = 0;

    // 2. HIỂN THỊ MODAL CẢNH BÁO VI PHẠM
    function triggerViolationAlert(reason) {
        const now = Date.now();
        if (now - lastViolationTime < 1500) return; // Debounce 1.5s
        lastViolationTime = now;

        // Xóa clipboard ngay lập tức
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText('');
            }
        } catch (_) {}

        const modal = document.getElementById('copyrightViolationModal');
        if (!modal) return;

        const msgEl = document.getElementById('copyrightViolationMsg');
        if (msgEl && reason) {
            msgEl.textContent = reason;
        }

        isModalOpen = true;
        modal.classList.remove('hidden');
        setTimeout(function() {
            modal.classList.remove('opacity-0');
            const box = modal.querySelector('.violation-box');
            if (box) box.classList.remove('scale-90');
        }, 10);
    }

    function closeViolationModal() {
        const modal = document.getElementById('copyrightViolationModal');
        if (!modal) return;
        modal.classList.add('opacity-0');
        const box = modal.querySelector('.violation-box');
        if (box) box.classList.add('scale-90');
        setTimeout(function() {
            modal.classList.add('hidden');
            isModalOpen = false;
        }, 250);
    }

    // 3. CHẶN PHÍM TẮT CHỤP MÀN HÌNH (PrintScreen, Win+Shift+S, Mac Cmd+Shift+3/4/5, Ctrl+P)
    document.addEventListener('keydown', function(e) {
        const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
        const isDevTools = e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['i', 'c', 'j'].indexOf(e.key.toLowerCase()) !== -1);
        const isPrint = (e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P');
        const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5', 's'].indexOf(e.key.toLowerCase()) !== -1;

        if (isPrintScreen || isPrint || isMacScreenshot) {
            e.preventDefault();
            e.stopPropagation();
            triggerViolationAlert('Hệ thống đã chặn thao tác phím chụp màn hình. Nội dung được bảo vệ bản quyền!');
            return false;
        }
    }, true);

    document.addEventListener('keyup', function(e) {
        if (e.key === 'PrintScreen' || e.keyCode === 44) {
            e.preventDefault();
            e.stopPropagation();
            triggerViolationAlert('Hệ thống đã chặn thao tác chụp màn hình (PrintScreen). Nội dung được bảo vệ bản quyền!');
        }
    }, true);

    // 4. CHẶN CỬ CHỈ VUỐT 3 NGÓN TAY CHỤP MÀN HÌNH TRÊN ĐIỆN THOẠI (Xiaomi, Oppo, Realme, Samsung...)
    window.addEventListener('touchstart', function(e) {
        if (e.touches && e.touches.length >= 3) {
            // Chặn cử chỉ 3 ngón tay ngay lập tức
            e.preventDefault();
            e.stopPropagation();
            triggerViolationAlert('Hệ thống phát hiện cử chỉ vuốt 3 ngón tay để chụp màn hình. Thao tác đã bị chặn!');
        }
    }, { capture: true, passive: false });

    window.addEventListener('touchmove', function(e) {
        if (e.touches && e.touches.length >= 3) {
            // Chặn cử chỉ vuốt 3 ngón
            e.preventDefault();
            e.stopPropagation();
            triggerViolationAlert('Hệ thống phát hiện cử chỉ vuốt 3 ngón tay để chụp màn hình. Thao tác đã bị chặn!');
        }
    }, { capture: true, passive: false });

    // 5. THEO DÕI HÀNH VI RỜI KHỎI TRÌNH DUYỆT (CHỤP PHÍM CỨNG HOẶC CHUYỂN TAB) KHI ĐANG MỞ VÙNG BẢO VỆ
    function isInsideProtectedZone() {
        const lbModal = document.getElementById('examLeaderboardModal');
        if (lbModal && !lbModal.classList.contains('hidden') && !lbModal.classList.contains('opacity-0')) return true;

        const lookupModal = document.getElementById('studentQuestionLookupModal');
        if (lookupModal && !lookupModal.classList.contains('pointer-events-none') && !lookupModal.classList.contains('opacity-0')) return true;

        const solView = document.getElementById('solutionView');
        if (solView && !solView.classList.contains('hidden')) return true;

        return false;
    }

    let leaveTimestamp = 0;
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            if (isInsideProtectedZone()) {
                leaveTimestamp = Date.now();
            }
        } else if (document.visibilityState === 'visible') {
            if (leaveTimestamp > 0) {
                const elapsed = Date.now() - leaveTimestamp;
                leaveTimestamp = 0;
                // Nếu rời màn hình trong khoảng 0.3s - 3s (thời gian điển hình khi điện thoại chớp chụp màn hình phím cứng)
                if (elapsed >= 250 && elapsed <= 4000) {
                    triggerViolationAlert('Hệ thống phát hiện hành vi rời màn hình hoặc chụp ảnh phím cứng trong khu vực được bảo vệ!');
                }
            }
        }
    });

    // 6. CHỐNG CHUỘT PHẢI VÀ CHỐNG COPY TRONG VÙNG BẢO MẬT
    document.addEventListener('contextmenu', function(e) {
        const tag = e.target ? e.target.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;

        if (isInsideProtectedZone()) {
            e.preventDefault();
            return false;
        }
    });

    document.addEventListener('copy', function(e) {
        const tag = e.target ? e.target.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;

        if (isInsideProtectedZone()) {
            e.preventDefault();
            if (e.clipboardData) {
                e.clipboardData.setData('text/plain', '');
            }
            triggerViolationAlert('Hành vi sao chép nội dung bài thi / lời giải đã bị chặn!');
            return false;
        }
    });
})();
