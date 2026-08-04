const fs = require('fs');
const html = fs.readFileSync('dashboard.html', 'utf8');

console.log('view-students:', html.indexOf('id="view-students"'));
console.log('view-exambank:', html.indexOf('id="view-exambank"'));

const viewStudentsIndex = html.indexOf('id="view-students"');
if (viewStudentsIndex !== -1) {
    console.log(html.substring(viewStudentsIndex - 20, viewStudentsIndex + 100));
}
