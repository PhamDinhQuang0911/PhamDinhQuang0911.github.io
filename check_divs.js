const fs = require('fs');
const html = fs.readFileSync('dashboard.html', 'utf8');

let depth = 0;
let studentsDepth = -1;
let classDetailDepth = -1;
let classDetailCloseCount = 0;
const regex = /<\/?div[^>]*>/g;
let match;

while((match = regex.exec(html)) !== null) {
    if(match[0].startsWith('<div')) {
        depth++;
        if(match[0].includes('id="view-teacher-class-detail"')) classDetailDepth = depth;
        if(match[0].includes('id="view-students"')) studentsDepth = depth;
    } else if(match[0].startsWith('</div')) {
        if(classDetailDepth > -1 && depth <= classDetailDepth) {
            classDetailCloseCount++;
            if (classDetailCloseCount === 1) {
                console.log('view-teacher closed at index', match.index, 'before view-students:', match.index < html.indexOf('id="view-students"'));
            }
        }
        depth--;
    }
}
console.log('classDetailDepth:', classDetailDepth, 'studentsDepth:', studentsDepth);
