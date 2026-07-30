const fs = require('fs');
let content = fs.readFileSync('exam-editor.html', 'utf8');

if (!content.includes('let currentDangTitleMC = null;')) {
    const fnStart = content.indexOf('window.renderGradingView = () => {');
    if (fnStart !== -1) {
        const insertPoint = content.indexOf('{', fnStart) + 1;
        content = content.substring(0, insertPoint) + '\n            let currentDangTitleMC = null;\n            let currentDangTitleEssay = null;\n' + content.substring(insertPoint);
        fs.writeFileSync('exam-editor.html', content, 'utf8');
        console.log('Successfully injected currentDangTitle variables!');
    } else {
        console.log('Could not find window.renderGradingView');
    }
} else {
    console.log('Variables already exist!');
}
