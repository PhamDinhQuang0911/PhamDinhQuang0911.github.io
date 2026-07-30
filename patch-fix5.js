const fs = require('fs');
let content = fs.readFileSync('exam-editor.html', 'utf8');

const targetStr = "let displayTitle = '';";
const startIdx = content.indexOf(targetStr);
if (startIdx !== -1) {
    const endIdx = content.indexOf("const navItem = document.createElement('button');", startIdx);
    if (endIdx !== -1) {
        const replaceStr = `                // GROUPING LOGIC
                if (q.dangTitle) {
                    if (q.type === 'essay' && q.dangTitle !== currentDangTitleEssay) {
                        currentDangTitleEssay = q.dangTitle;
                        const header = document.createElement('div');
                        header.className = "mt-6 mb-2 border-b-2 border-purple-200 pb-2 w-full";
                        header.innerHTML = \`<h4 class="text-lg font-black text-purple-800"><i class="fa-solid fa-layer-group mr-2"></i>Dạng \${q.dangIndex || ''}: \${q.dangTitle}</h4>\`;
                        essayContainer.appendChild(header);
                        
                        const navHeader = document.createElement('div');
                        navHeader.className = "mt-3 mb-1 text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded shadow-sm border border-purple-100";
                        navHeader.innerHTML = \`<i class="fa-solid fa-layer-group mr-1"></i> Dạng \${q.dangIndex || ''}\`;
                        nav.appendChild(navHeader);
                    } else if (q.type !== 'essay' && q.dangTitle !== currentDangTitleMC) {
                        currentDangTitleMC = q.dangTitle;
                        const header = document.createElement('div');
                        header.className = "mt-6 mb-2 border-b-2 border-purple-200 pb-2 w-full";
                        header.innerHTML = \`<h4 class="text-lg font-black text-purple-800"><i class="fa-solid fa-layer-group mr-2"></i>Dạng \${q.dangIndex || ''}: \${q.dangTitle}</h4>\`;
                        mcContainer.appendChild(header);
                        
                        const navHeader = document.createElement('div');
                        navHeader.className = "mt-3 mb-1 text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded shadow-sm border border-purple-100";
                        navHeader.innerHTML = \`<i class="fa-solid fa-layer-group mr-1"></i> Dạng \${q.dangIndex || ''}\`;
                        nav.appendChild(navHeader);
                    }
                }

                const dangBadge = q.dangTitle ? \` <span class="text-[11px] font-normal text-purple-600 bg-purple-50 border border-purple-200 px-2 py-1 rounded-lg ml-2 inline-block shadow-sm"><i class="fa-solid fa-layer-group mr-1.5 text-purple-500"></i>Dạng \${q.dangIndex || ''}: \${q.dangTitle}</span>\` : '';

                let displayTitle = '';
                let navTitle = '';
                if (q.type === 'essay') {
                    displayTitle = \`Bài \${essayCounter} (Tự luận)\` + dangBadge;
                    navTitle = \`Bài \${essayCounter} <span class="float-right">TL</span>\`;
                    essayCounter++;
                } else {
                    displayTitle = \`Câu \${mcCounter}\` + dangBadge;
                    navTitle = \`Câu \${mcCounter} <span class="float-right">\${q.type.toUpperCase()}</span>\`;
                    mcCounter++;
                }

                `;
        content = content.substring(0, startIdx) + replaceStr + content.substring(endIdx);
        
        // Also ensure currentDangTitle variables are declared
        if (!content.includes('let currentDangTitleMC = null;')) {
            content = content.replace(
                'let mcCounter = 1;\n            let essayCounter = 1;',
                'let mcCounter = 1;\n            let essayCounter = 1;\n            let currentDangTitleMC = null;\n            let currentDangTitleEssay = null;'
            );
        }
        
        fs.writeFileSync('exam-editor.html', content, 'utf8');
        console.log("Patched successfully with exact indices!");
    } else {
        console.log("Could not find navItem line");
    }
} else {
    console.log("Could not find displayTitle string");
}
