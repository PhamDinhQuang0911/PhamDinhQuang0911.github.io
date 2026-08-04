const fs = require('fs');
let html = fs.readFileSync('dashboard.html', 'utf8');

// The marker is: <!-- ====== QUẢN LÝ HỌC SINH TỔNG QUÁT ====== -->
const marker = '<!-- ====== QUẢN LÝ HỌC SINH TỔNG QUÁT ====== -->';
const markerIndex = html.indexOf(marker);

// Look backwards from marker to count how many </div> there are.
// We should make sure we have exactly two </div> between tabContentReports closing and the marker.
// Let's just insert one more </div> right before the marker to see if that fixes it.
// Actually, let's calculate the exact nesting.

html = html.replace(/\s+<\/div>\s*<!-- ====== QUẢN LÝ HỌC SINH TỔNG QUÁT ====== -->/, '\n            </div>\n        </div>\n\n        <!-- ====== QUẢN LÝ HỌC SINH TỔNG QUÁT ====== -->');

fs.writeFileSync('dashboard.html', html, 'utf8');
console.log('Fixed missing div in dashboard.html');
