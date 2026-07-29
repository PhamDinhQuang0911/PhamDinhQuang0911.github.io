const fs = require('fs');

let utils = fs.readFileSync('utils.js', 'utf8');
utils = utils.replace(/export /g, '');

// evaluate utils.js to get the functions
eval(utils);

const input = `\\begin{enumEX} {4} \\item $\\begin{cases} 5x + 3y = 10 \\\\ -5x + 2y = -35 \\end{cases}$ \\item $\\begin{cases} 4x + 3y = 13 \\\\ 5x - 3y = -31 \\end{cases}$ \\item $\\begin{cases} 3x - 4y = 17 \\\\ 5x + 2y = 11 \\end{cases}$ \\item $\\begin{cases} 2x + 2y = 9 \\\\ 2x - 3y = 4 \\end{cases}$ \\end{enumEX}`;

const output = processLatexLists(input);
console.log("processLatexLists output:", output);
