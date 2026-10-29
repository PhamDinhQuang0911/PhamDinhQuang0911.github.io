const fs = require('fs');
const content = fs.readFileSync('C:/Users/ADMIN/Documents/GitHub/PhamDinhQuang0911.github.io/dashboard.html', 'utf8');

const pos = content.indexOf('window.openNoteRendererApp =');
console.log(content.slice(pos, pos + 1500));
