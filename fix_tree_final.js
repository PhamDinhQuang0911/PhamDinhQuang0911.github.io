const fs = require('fs');

// 1. Fix season-theme.js
let jsContent = fs.readFileSync('season-theme.js', 'utf8');
jsContent = jsContent.replace(
    "const hero = document.querySelector('.from-teal-600.to-blue-600, .from-blue-500.to-pink-500');",
    "const hero = document.querySelector('.from-teal-600, .from-blue-500, .from-primary-600, .from-primary-700');"
);
fs.writeFileSync('season-theme.js', jsContent, 'utf8');
console.log('Fixed season-theme.js');

// 2. Remove hardcoded tree from student.html
let html = fs.readFileSync('student.html', 'utf8');
const hardcodedTree = `<div class="absolute bottom-0 right-4 w-32 h-32 md:w-48 md:h-48 pointer-events-none opacity-90 flex items-end justify-end overflow-hidden">
            <img src="assets/autumn-tree.png" alt="Mùa thu" class="w-full h-full object-contain filter drop-shadow-xl animate-fade-in origin-bottom" style="animation-duration: 2s;">
        </div>`;
if (html.includes(hardcodedTree)) {
    html = html.replace(hardcodedTree, '');
    fs.writeFileSync('student.html', html, 'utf8');
    console.log('Removed hardcoded tree from student.html');
} else {
    // try to find it using regex if exact match fails
    html = html.replace(/<div class="absolute bottom-0 right-4[^>]*>\s*<img src="assets\/autumn-tree.png"[^>]*>\s*<\/div>/, '');
    fs.writeFileSync('student.html', html, 'utf8');
    console.log('Regex removed hardcoded tree from student.html');
}

