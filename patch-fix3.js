const fs = require('fs');
let content = fs.readFileSync('exam.html', 'utf8');

// The new shortMatch logic
const newLogic = `const normShort = (v) => String(v ?? '').trim().toLowerCase().replace(/\\$/g, '').replace(/\\s+/g, ' ').replace(/,/g, '.');
const shortMatch = (a, b) => {
    const na = normShort(a), nb = normShort(b);
    if (na === '' || nb === '') return false;
    if (na === nb) return true;
    const isNum = (t) => /^[-+]?\\d*\\.?\\d+$/.test(t);
    if (isNum(na) && isNum(nb)) return Math.abs(parseFloat(na) - parseFloat(nb)) < 1e-9;
    return false;
};
`;

// 1. Replace the first normalize definition
const find1 = "const normalize = (s) => String(s).replace(/\\$| /g,'').toLowerCase().trim();";
if (content.includes(find1)) {
    content = content.replace(find1, newLogic);
}

// 2. Replace the second normalize definition
const find2 = "const normalize = (str) => String(str).replace(/\\$| /g, '').toLowerCase().trim();";
if (content.includes(find2)) {
    content = content.replace(find2, newLogic);
}

// 3. Replace the usage
content = content.replace(/normalize\(u\)\s*===\s*normalize\(q.answer\)/g, 'shortMatch(u, q.answer)');

fs.writeFileSync('exam.html', content, 'utf8');
console.log('exam.html short answer logic patched!');
