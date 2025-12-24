/**
 * utils.js - Thư viện dùng chung cho Editor và Exam
 * Chứa logic xử lý hiển thị LaTeX, TikZ, và HTML cleanup (Đã fix lỗi hiển thị <x)
 */

// 1. CẤU HÌNH API
const TIKZ_API_URL = "https://modern-brisbane-self-descending.trycloudflare.com/compile"; 

export const compileTikZToImage = async (tikzCode) => {
  try {
    const response = await fetch(TIKZ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: tikzCode })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.log || data.error || "Lỗi server");
    return data.url;
  } catch (error) { console.error("API Error:", error); throw error; }
};

// ============================================================================
// 2. CÁC HÀM XỬ LÝ NỘI BỘ (HELPER)
// ============================================================================

function cleanTikzCode(code) {
    let cleaned = code.replace(/\\resizebox\{[^}]+\}\{[^}]+\}\{\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\}/g, "$1");
    return cleaned.replace(/\\begin\{center\}/g, "").replace(/\\end\{center\}/g, "");
}

function processNestedTikz(text) {
    if (!text) return "";
    let result = "", remaining = String(text);
    while (true) {
        const startIdx = remaining.indexOf("\\begin{tikzpicture}");
        if (startIdx === -1) { result += remaining; break; }
        result += remaining.substring(0, startIdx); remaining = remaining.substring(startIdx);
        let depth = 0, endIdx = -1, pos = "\\begin{tikzpicture}".length; depth = 1;
        while (depth > 0) {
            const no = remaining.indexOf("\\begin{tikzpicture}", pos);
            const nc = remaining.indexOf("\\end{tikzpicture}", pos);
            if (nc === -1) { endIdx = remaining.length; depth = 0; break; }
            if (no !== -1 && no < nc) { depth++; pos = no + 19; } 
            else { depth--; pos = nc + 17; if (depth === 0) endIdx = pos; }
        }
        let raw = remaining.substring(0, endIdx);
        let final = cleanTikzCode(raw);
        if (!final.includes("\\usetikzlibrary")) final = "\\usetikzlibrary{calc,intersections,arrows.meta}\n" + final;
        result += `<div class="flex justify-center my-4 overflow-x-auto"><script type="text/tikz">${final}<\/script></div>`;
        remaining = remaining.substring(endIdx);
    }
    return result;
}

function processTabular(text) {
    if (!text) return "";
    let processed = text.replace(/\\begin\{table\}(\[.*?\])?/g, '').replace(/\\end\{table\}/g, '');
    const regex = /\\begin\{tabular\}(\{|\[).*?(\}|\])([\s\S]*?)\\end\{tabular\}/g;
    return processed.replace(regex, (match, open, close, body) => {
        const rows = body.split('\\\\').filter(r => r.trim().length > 0);
        let html = '<div class="my-3 w-full js-scale-wrapper" style="position: relative; width: 100%;">';
        html += '<table class="js-scale-table border-collapse border border-gray-300 bg-white text-sm origin-top-left" style="min-width: max-content;">';
        rows.forEach((row, rIdx) => {
            let cleanRow = row.replace(/\\hline/g, '').trim();
            if(cleanRow.length === 0) return;
            const cols = cleanRow.split('&');
            html += `<tr class="${rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">`;
            cols.forEach(col => { html += `<td class="border border-gray-300 px-3 py-2">${col.trim()}</td>`; });
            html += '</tr>';
        });
        html += '</table></div>';
        return html;
    });
}

function processLatexLists(text) {
    let processed = text;
    // itemchoice
    processed = processed.replace(/\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}/g, (match, body) => {
        const items = body.split('\\itemch').filter(s => s.trim().length > 0);
        const htmlItems = items.map(item => {
            let content = item.trim().replace(/\\\\/g, '<br>').replace(/\n/g, ' ');
            return `<li class="flex items-start gap-2 mb-1"><span class="text-blue-600 font-bold shrink-0">•</span><div class="leading-relaxed">${content}</div></li>`;
        }).join('');
        return `<ul class="my-3 pl-2 list-none">${htmlItems}</ul>`;
    });
    // Helper parse items
    const parseItems = (bodyStr) => {
        const rawItems = bodyStr.split(/\\item(?![a-zA-Z])/).filter(s => s.trim().length > 0);
        return rawItems.map((item) => {
            let content = item.trim(), label = null;
            if (content.startsWith('[')) {
                const cb = content.indexOf(']');
                if (cb > -1) { label = content.substring(1, cb); content = content.substring(cb + 1).trim(); }
            }
            content = processTabular(content);
            return { label, content };
        });
    };
    // ListEX
    const regexCols = /\\begin\{(?:listEX|enumEX)\}(?:\[(\d+)\]|\{(\d+)\}(?:\[(.*?)\])?)([\s\S]*?)\\end\{(?:listEX|enumEX)\}/g;
    processed = processed.replace(regexCols, (match, c1, c2, style, body) => {
        const cols = c1 || c2 || 1;
        const items = parseItems(body);
        let gridHtml = `<div class="grid grid-cols-1 md:grid-cols-${cols} gap-4 my-3">`;
        items.forEach((it, idx) => {
            let displayLabel = it.label;
            if (!displayLabel && match.includes('enumEX')) displayLabel = String.fromCharCode(97 + idx) + ')';
            gridHtml += `<div class="flex gap-2">${displayLabel ? `<span class="font-bold text-gray-700 shrink-0">${displayLabel}</span>` : `<span class="text-gray-400 shrink-0">•</span>`}<div>${it.content}</div></div>`;
        });
        gridHtml += `</div>`;
        return gridHtml;
    });
    // Enumerate
    processed = processed.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (match, body) => {
        const items = parseItems(body);
        let html = `<ol class="list-decimal pl-8 space-y-1 my-2">`;
        items.forEach(it => { html += it.label ? `<li class="list-none -ml-4"><span class="font-bold mr-1">${it.label}</span>${it.content}</li>` : `<li>${it.content}</li>`; });
        html += `</ol>`;
        return html;
    });
    // Itemize
    processed = processed.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (match, body) => {
        const items = parseItems(body);
        let html = `<ul class="list-disc pl-8 space-y-1 my-2">`;
        items.forEach(it => { html += it.label ? `<li class="list-none -ml-4"><span class="font-bold mr-1">${it.label}</span>${it.content}</li>` : `<li>${it.content}</li>`; });
        html += `</ul>`;
        return html;
    });
    return processed;
}

// 3. CÁC HÀM EXPORT CHO BÊN NGOÀI SỬ DỤNG
export const convertArrayToMatrix = (content) => {
  if (!content) return "";
  let processed = content.replace(/\\begin\{array\}\s*\{[^{}]*?\}/g, '\\begin{matrix}');
  processed = processed.replace(/\\begin\{array\}/g, '\\begin{matrix}');
  processed = processed.replace(/\\end\{array\}/g, '\\end{matrix}');
  return processed;
};

export const autoScaleTables = () => {
    document.querySelectorAll('.js-scale-wrapper').forEach(wrap => {
        const table = wrap.querySelector('table');
        if (!table) return;
        table.style.transform = 'none'; table.style.width = 'auto'; wrap.style.height = 'auto';
        const containerWidth = wrap.offsetWidth;
        const tableWidth = table.scrollWidth;
        if (tableWidth > containerWidth) {
            const scale = containerWidth / tableWidth;
            table.style.transform = `scale(${scale})`;
            wrap.style.height = `${table.scrollHeight * scale}px`;
            wrap.style.overflow = 'hidden'; 
        }
    });
};

export const formatContent = (text) => {
    if (text === null || text === undefined) return "";
    let processed = text;

    // Cleanup Text
    processed = processed.replace(/\\centering/g, "");
    processed = processed.replace(/\\%/g, "%");
    processed = processed.replace(/\\textbf\{([^}]+)\}/g, '<b class="font-bold">$1</b>');
    processed = processed.replace(/\\textit\{([^}]+)\}/g, '<i class="italic">$1</i>');
    processed = processed.replace(/\\hfill/g, '<span style="display:inline-block; width: 2rem;"></span>');
    processed = processed.replace(/\\allowdisplaybreaks(\[.*?\])?/g, "");
    processed = processed.replace(/\\lq\\lq/g, '"').replace(/\\rq\\rq/g, '"');
    processed = processed.replace(/\\lq/g, '"').replace(/\\rq/g, '"');
    processed = processed.replace(/\\wideparen\{([^}]+)\}/g, '\\overset{\\frown}{$1}');
    processed = processed.replace(/\\(h|v)space\*?\{[^}]+\}/g, '');
    processed = processed.replace(/\\(no)?indent/g, '');

    // Structure
    processed = convertArrayToMatrix(processed);
    processed = processNestedTikz(processed); 
    processed = processTabular(processed);    
    processed = processLatexLists(processed); 

    // Placeholder images
    processed = processed.replace(/<div[^>]*class="[^"]*image-placeholder[^"]*"[^>]*>[\s\S]*?<\/div>/g, '');
    processed = processed.replace(/<div[^>]*class="[^"]*group relative[^"]*"[^>]*>[\s\S]*?(<img[^>]+>)[\s\S]*?<\/div>/gi, '<div class="flex justify-center my-3">$1</div>');
    processed = processed.replace(/Click đúp để tải file|hoặc Ctrl \+ V để dán ảnh|ẢNH TỪ IMMINI|VỊ TRÍ HÌNH TIKZ/gi, '');
    processed = processed.replace(/^\s*\}\s*$/gm, '').replace(/\}\s*$/g, '').replace(/Ảnh minh họa \(immini\)/g, '').replace(/Ảnh canh giữa/g, '');

    // FIX LỖI CẮT NGẮN CÔNG THỨC <x
    const tagWhitelist = "script|style|div|span|p|br|img|table|tbody|thead|tr|td|th|ul|ol|li|b|i|u|strong|em|mark|label|input|button|a|h1|h2|h3|h4";
    const regex = new RegExp(`(\\$\\$[\\s\\S]*?\\$\\$|\\\\\\[[\\s\\S]*?\\\\\\]|\\\\\\([\\s\\S]*?\\\\\\)|(?:\\$[\\s\\S]*?\\$)|<\\/?(?:${tagWhitelist})[^>]*>)`, 'gi');
    
    const parts = processed.split(regex);
    
    return parts.map(part => {
        const isMath = part.trim().startsWith('$') || part.trim().startsWith('\\(') || part.trim().startsWith('\\[');
        const isTag = part.startsWith('<') && part.endsWith('>');

        if (isMath) {
            return part.replace(/</g, ' < '); // FIX: Thêm khoảng trắng
        } else if (isTag) {
            return part; 
        } else {
            let cleanPart = part.replace(/</g, '&lt;'); // FIX: Mã hóa text thường
            cleanPart = cleanPart.replace(/\}/g, '');
            return cleanPart.replace(/\\\\/g, '<br>').replace(/\n/g, '<br>');
        }
    }).join('');
};
