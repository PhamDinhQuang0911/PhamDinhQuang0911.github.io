const fs = require('fs');
const html = fs.readFileSync('student.html', 'utf8');

console.log('welcomeName:', html.includes('id="welcomeName"'));
console.log('pendingTitle:', html.includes('id="pendingTitle"'));
