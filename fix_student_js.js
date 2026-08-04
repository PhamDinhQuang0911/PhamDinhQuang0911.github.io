const fs = require('fs');
let html = fs.readFileSync('student.html', 'utf8');

// Fix 1: Restore welcomeName ID
html = html.replace('id="welcomeName2"', 'id="welcomeName"');

// Fix 2: Restore pendingTitle span inside the new Header
html = html.replace('<h3 class="font-bold text-gray-800 text-lg flex items-center gap-2"><i class="fa-solid fa-pen-to-square text-primary-500"></i> Bài tập về nhà</h3>', 
    '<h3 class="font-bold text-gray-800 text-lg flex items-center gap-2"><i class="fa-solid fa-pen-to-square text-primary-500"></i> <span id="pendingTitle">Bài tập về nhà</span></h3>');

fs.writeFileSync('student.html', html, 'utf8');
console.log('Fixed missing IDs in student.html');
