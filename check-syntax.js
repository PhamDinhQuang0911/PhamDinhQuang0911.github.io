const fs = require('fs');
const acorn = require('acorn'); // If not available, we will try something else
try {
    const code = fs.readFileSync('exam-editor.html', 'utf8');
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(code)) !== null) {
        if (match[0].includes('type=" module\')) continue;
 const scriptContent = match[1];
 const offsetLines = code.substring(0, match.index).split('\n').length - 1;
 
 try {
 // Using new Function to check syntax
 new Function(scriptContent);
 } catch (e) {
 console.log('Error found in script starting at line: ' + offsetLines);
 console.log(e.message);
 // Let's write the script content to a temp file to see exact error with node
 fs.writeFileSync('temp-script.js', scriptContent);
 require('child_process').execSync('node temp-script.js', {stdio: 'inherit'});
 }
 }
} catch (e) {
 console.log(e.message);
}
