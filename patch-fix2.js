const fs = require('fs');
let content = fs.readFileSync('exam-editor.html', 'utf8');

// The block to replace
const findStr = `                let displayTitle = '';
                let navTitle = '';
                if (q.type === 'essay') {
                    displayTitle = \`Bài \${essayCounter} (Tự luận)\`;
                    navTitle = \`Bài \${essayCounter} <span class="float-right">TL</span>\`;
                    essayCounter++;
                } else {
                    displayTitle = \`Câu \${mcCounter}\`;
                    navTitle = \`Câu \${mcCounter} <span class="float-right">\${q.type.toUpperCase()}</span>\`;
                    mcCounter++;
                }`;

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
                }`;

if (content.includes("let displayTitle = '';") && !content.includes("currentDangTitleEssay = q.dangTitle;")) {
    content = content.replace(findStr, replaceStr);
    
    // Make sure currentDangTitle... is initialized
    content = content.replace(
        'let mcCounter = 1;\n            let essayCounter = 1;',
        'let mcCounter = 1;\n            let essayCounter = 1;\n            let currentDangTitleMC = null;\n            let currentDangTitleEssay = null;'
    );
    
    fs.writeFileSync('exam-editor.html', content, 'utf8');
    console.log('Group logic correctly patched!');
} else {
    console.log('Could not find displayTitle block or already patched!');
}
