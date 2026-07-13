const fs = require('fs');

let c = fs.readFileSync('exam.html', 'utf8');

c = c.replace(
    /if\(userAnswers\[0\]\) {\s*document\.getElementById\('hwStatusDisplay'\)\.innerHTML = `<i class="fa-solid fa-check-circle text-green-500"><\/i> Trạng thái: <b class="text-green-600">Đã lưu ảnh \(Chưa nộp\)<\/b>`;\s*}/g,
    `if(userAnswers[0]) {
                if (window.currentResultId) {
                    document.getElementById('hwStatusDisplay').innerHTML = \`<i class="fa-solid fa-check-circle text-green-500"></i> Trạng thái: <b class="text-green-600">Đã nộp bài</b>\`;
                } else {
                    document.getElementById('hwStatusDisplay').innerHTML = \`<i class="fa-solid fa-check-circle text-green-500"></i> Trạng thái: <b class="text-green-600">Đã lưu ảnh (Chưa nộp)</b>\`;
                }
            }`
);

fs.writeFileSync('exam.html', c);
console.log('Fixed hwStatusDisplay in exam.html');
