const fs = require('fs');
const html = fs.readFileSync('student.html', 'utf8');

const start = html.indexOf('<div id="tab-dashboard"');
const end = html.indexOf('<div id="tab-practice"');
if (start !== -1 && end !== -1) {
    console.log(html.substring(start, end));
} else {
    console.log("NOT FOUND");
}
