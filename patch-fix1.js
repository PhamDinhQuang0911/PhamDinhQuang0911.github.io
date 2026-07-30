const fs = require('fs');
let content = fs.readFileSync('exam-editor.html', 'utf8');

const btnHtml = `
            <button onclick="window.toggleLeftNav()" title="Thu gọn/Mở rộng danh sách" class="hidden md:flex fixed top-[45%] left-[224px] lg:left-[256px] z-[110] w-7 h-12 bg-white border-2 border-blue-200 shadow-xl rounded-r-xl items-center justify-center hover:bg-blue-50 transition-all duration-300 text-blue-600 cursor-pointer" id="btnToggleLeftNav"><i id="leftNavIcon" class="fa-solid fa-chevron-left text-xs"></i></button>
            <button onclick="window.toggleRightGrading()" title="Thu gọn/Mở rộng công cụ chấm" class="hidden md:flex fixed top-[45%] right-[384px] z-[110] w-7 h-12 bg-white border-2 border-blue-200 shadow-xl rounded-l-xl items-center justify-center hover:bg-blue-50 transition-all duration-300 text-blue-600 cursor-pointer" id="btnToggleRightNav"><i id="rightGradingIcon" class="fa-solid fa-chevron-right text-xs"></i></button>
`;
if (!content.includes('id="btnToggleLeftNav"')) {
    const insertPoint = content.indexOf('<div class="flex-1 flex flex-col md:flex-row overflow-hidden bg-gray-100 relative">');
    if (insertPoint !== -1) {
        content = content.substring(0, insertPoint) + btnHtml + content.substring(insertPoint);
        console.log('Inserted toggle buttons in exam-editor.html');
    } else {
        console.log('Could not find insertion point!');
    }
} else {
    console.log('Buttons already exist in HTML!');
}
fs.writeFileSync('exam-editor.html', content, 'utf8');
