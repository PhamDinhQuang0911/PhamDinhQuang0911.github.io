const fs = require('fs');
let c = fs.readFileSync('exam.html', 'utf8');

// Fix 1: Add whitespace-nowrap and items-start to instructions
c = c.replace(
    /<li class="flex gap-2">\s*<span class="font-bold text-blue-600">Bước 1:<\/span>/g,
    '<li class="flex gap-2 items-start">\n                            <span class="font-bold text-blue-600 whitespace-nowrap">Bước 1:</span>'
).replace(
    /<li class="flex gap-2">\s*<span class="font-bold text-blue-600">Bước 2:<\/span>/g,
    '<li class="flex gap-2 items-start">\n                            <span class="font-bold text-blue-600 whitespace-nowrap">Bước 2:</span>'
).replace(
    /<li class="flex gap-2">\s*<span class="font-bold text-blue-600">Bước 3:<\/span>/g,
    '<li class="flex gap-2 items-start">\n                            <span class="font-bold text-blue-600 whitespace-nowrap">Bước 3:</span>'
);

// Fix 2: Define deleteStudentImage function before deleteAllImages
if (!c.includes('window.deleteStudentImage = async')) {
    c = c.replace(
        `        // --- HÀM XÓA TẤT CẢ ẢNH CỦA 1 CÂU (CÓ XÓA CLOUD) ---`,
        `        // --- HÀM XÓA 1 ẢNH (CÓ XÓA CLOUD) ---
        window.deleteStudentImage = async (url, qIdx, uniqueId) => {
            const confirmDelete = await window.customConfirm("Bạn có chắc chắn muốn xóa ảnh này không?");
            if (!confirmDelete) return;

            window.isUploading = true;
            window.showToast("Đang xóa...", "info");

            try {
                // Xoá file trên cloud (nếu API xoá hoạt động)
                const fileName = url.substring(url.lastIndexOf('/') + 1);
                try {
                    await fetch("https://upload-helper.phamngockhanh-942001.workers.dev/" + fileName, { method: 'DELETE' });
                } catch(e) { console.warn("Lỗi xoá trên server", e); }

                // Xoá trong DOM
                const el = document.getElementById(uniqueId);
                if (el) el.remove();

                // Cập nhật lại chuỗi HTML
                const container = document.getElementById('submitted-area-' + qIdx);
                if (container) {
                    userAnswers[qIdx] = container.innerHTML.trim();
                }

                window.isUploading = false;
                window.showToast("Đã xóa ảnh!", "success");

                // Nếu xoá hết thì ẩn khung
                if (!userAnswers[qIdx] || !userAnswers[qIdx].includes('<img')) {
                    userAnswers[qIdx] = "";
                    const wrapper = document.getElementById('submitted-area-wrapper-' + qIdx);
                    if (wrapper) wrapper.classList.add('hidden');
                }
            } catch (error) {
                window.isUploading = false;
                window.customAlert("Lỗi khi xóa: " + error.message, "error");
            }
        };

        // --- HÀM XÓA TẤT CẢ ẢNH CỦA 1 CÂU (CÓ XÓA CLOUD) ---`
    );
}

fs.writeFileSync('exam.html', c);
console.log('Fixed UI issues and added delete functionality in exam.html');
