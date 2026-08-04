const fs = require('fs');
const html = fs.readFileSync('dashboard.html', 'utf8');

const start = html.indexOf('<div id="view-students"');
if(start !== -1) {
    console.log(html.substring(start, start + 1000));
} else {
    console.log("NOT FOUND");
}
