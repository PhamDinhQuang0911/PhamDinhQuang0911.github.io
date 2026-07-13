const fs = require('fs');
let c = fs.readFileSync('exam.html', 'utf8');

// Fix 1: Force Edit Mode if canEdit is true, regardless of mode=review in URL
c = c.replace(
    `                        if (urlParams.get('mode') === 'review' || isGraded || isResubmitPending) {
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
                        }`,
    `                        if (canEdit) {
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
                        } else if (urlParams.get('mode') === 'review' || isGraded || isResubmitPending) {
                            // Chế độ Đọc (Review) - Đã chấm hoặc xem lại
                            document.getElementById('lobbyScreen').classList.add('hidden'); 
                            window.isEditMode = false;
                            window.isReviewMode = true;
                            renderHomeworkView(); 
                            return;
                        }`
);

// Fix 2: Add instructions in Edit Mode
c = c.replace(
    `                // CHẾ ĐỘ LÀM BÀI / CẬP NHẬT BÀI (EDIT MODE)
                const wrapper = document.createElement('div');
                wrapper.className = "space-y-4"; 
                
                // 1. Khu vực hiển thị ảnh đã tải lên`,
    `                // CHẾ ĐỘ LÀM BÀI / CẬP NHẬT BÀI (EDIT MODE)
                const wrapper = document.createElement('div');
                wrapper.className = "space-y-4"; 
                
                // 0. Hướng dẫn nộp bài
                const instructions = document.createElement('div');
                instructions.className = "bg-blue-50 border border-blue-200 p-4 md:p-6 rounded-2xl mb-6 shadow-sm";
                instructions.innerHTML = \`
                    <h4 class="font-bold text-blue-800 text-sm md:text-base mb-3 flex items-center gap-2">
                        <i class="fa-solid fa-circle-info text-blue-600"></i> Hướng dẫn nộp bài:
                    </h4>
                    <ul class="text-xs md:text-sm text-blue-700 space-y-2 list-none pl-1">
                        <li class="flex gap-2">
                            <span class="font-bold text-blue-600">Bước 1:</span>
                            <span>Tải từng ảnh của bài làm, sau đó bấm nút <b>"Đóng dấu thứ tự trang & Nộp bài"</b> để hệ thống đánh số thứ tự. Tải tiếp các ảnh của trang sau và làm tương tự.</span>
                        </li>
                        <li class="flex gap-2">
                            <span class="font-bold text-blue-600">Bước 2:</span>
                            <span>Kiểm tra thứ tự ảnh đã đúng chưa ở mục <b>"Ảnh bài làm bạn đã tải lên"</b>. Nếu sai có thể xóa đi tải lại.</span>
                        </li>
                        <li class="flex gap-2">
                            <span class="font-bold text-blue-600">Bước 3:</span>
                            <span>Sau khi đã tải đủ tất cả ảnh bài làm, kéo xuống dưới cùng và bấm nút <b>"XÁC NHẬN NỘP BÀI" / "CẬP NHẬT LẠI BÀI LÀM"</b> để gửi cho giáo viên.</span>
                        </li>
                    </ul>
                \`;
                wrapper.appendChild(instructions);

                // 1. Khu vực hiển thị ảnh đã tải lên`
);

fs.writeFileSync('exam.html', c);
console.log('Fixed exam.html');
