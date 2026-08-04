const fs = require('fs');
const html = fs.readFileSync('dashboard.html', 'utf8');

const start = html.indexOf('function setSeasonalTheme()');
if (start !== -1) {
    const end = html.indexOf('}', start + 1000);
    console.log(html.substring(start, end + 1));
} else {
    console.log("NOT FOUND in dashboard.html");
}
