const fs = require('fs');
const html = fs.readFileSync('dashboard.html', 'utf8');

const start = html.indexOf('id="sidebarDecorTree"');
if (start !== -1) {
    console.log(html.substring(start - 200, start + 200));
} else {
    console.log("NOT FOUND in dashboard.html");
}
