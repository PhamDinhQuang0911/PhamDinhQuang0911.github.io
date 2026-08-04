const fs = require('fs');
let html = fs.readFileSync('student.html', 'utf8');

// Replace font URL
html = html.replace('family=Nunito:wght@400;600;700;800;900', 'family=Inter:wght@400;500;600;700;800;900');
html = html.replace(/font-family:\s*'Nunito'/g, "font-family: 'Inter'");
html = html.replace(/Nunito/g, 'Inter');

// Replace teal classes with primary classes
html = html.replace(/teal-/g, 'primary-');

// Also in dashboard.html and exam-editor.html (if needed later, but let's just do student.html for now)
fs.writeFileSync('student.html', html, 'utf8');
console.log('student.html updated successfully.');
