const fs = require('fs');
const acorn = require('acorn');
const code = fs.readFileSync('exam-editor.html', 'utf8');
const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
while ((match = scriptRegex.exec(code)) !== null) {
    const isModule = match[1].includes('type="module"');
    const scriptContent = match[2];
    const offsetLines = code.substring(0, match.index).split('\n').length - 1;
    
    try {
        acorn.parse(scriptContent, {
            ecmaVersion: 'latest',
            sourceType: isModule ? 'module' : 'script'
        });
    } catch (e) {
        console.log(`Syntax error in ${isModule ? 'module' : 'script'} starting at line ${offsetLines}`);
        console.log(`Line ${e.loc.line + offsetLines}: ${e.message}`);
    }
}
