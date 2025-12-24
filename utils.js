/**
 * utils.js - Thư viện dùng chung (Đã Fix lỗi <x và Export Helper)
 */

const TIKZ_API_URL = "https://surrey-decreased-let-detailed.trycloudflare.com/compile"; 

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

// --- CÁC HÀM EXPORT (ĐỂ EDITOR DÙNG LẠI) ---

export function cleanTikzCode(code) {
    let cleaned = code.replace(/\\resizebox\{[^}]+\}\{[^}]+\}\{\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\}/g, "$1");
    return cleaned.replace(/\\begin\{center\}/g, "").replace(/\\end\{center\}/g, "");
}

export function extractNextBrace(text) {
    if (!text) return null;
    const start = text.indexOf('{');
    if (start === -1) return null;
    
    let depth = 1;
    let end = -1;
    
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        
        if (depth === 0) {
            end = i;
            break;
        }
    }
    
    if (end === -1) return null;
    
    return {
        content: text.substring(start + 1, end),
        remaining: text.substring(end + 1),
        fullMatch: text.substring(start, end + 1)
    };
}

// --- CÁC HÀM XỬ LÝ HIỂN THỊ (NỘI BỘ) ---

function processNestedTikz(text) {
    if (!text) return "";
    let result = "";
    let remaining = String(text);
    
    while (true) {
        const startIdx = remaining.indexOf("\\begin{tikzpicture}");
        if (startIdx === -1) { result += remaining; break; }
        
        result += remaining.substring(0, startIdx);
        remaining = remaining.substring(startIdx);
        
        let depth = 1;
        let endIdx = -1;
        const openTag = "\\begin{tikzpicture}"; 
        const closeTag = "\\end{tikzpicture}";
        let searchPos = openTag.length;

        while (depth > 0) {
            const nextOpen = remaining.indexOf(openTag, searchPos);
            const nextClose = remaining.indexOf(closeTag, searchPos);
            
            if (nextClose === -1) { endIdx = remaining.length; depth = 0; break; }
            
            if (nextOpen !== -1 && nextOpen < nextClose) { 
                depth++; 
                searchPos = nextOpen + openTag.length; 
            } else { 
                depth--; 
                searchPos = nextClose + closeTag.length; 
                if (depth === 0) endIdx = searchPos; 
            }
        }
        
        let rawTikz = remaining.substring(0, endIdx);
        let finalTikz = cleanTikzCode(rawTikz);
        if (!finalTikz.includes("\\usetikzlibrary")) finalTikz = "\\usetikzlibrary{calc,intersections,arrows.meta}\n" + finalTikz;

        result += `<div class="flex justify-center my-4 overflow-x-auto"><script type="text/tikz">${finalTikz}<\/script></div>`;
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

    const parseItems = (bodyStr) => {
        const rawItems = bodyStr.split(/\\item(?![a-zA-Z])/).filter(s => s.trim().length > 0);
        return rawItems.map((item) => {
            let content = item.trim();
            if (content.startsWith('[')) {
                const cb = content.indexOf(']');
                if (cb > -1) content = content.substring(cb + 1).trim();
            }
            content = processTabular(content);
            return { content };
        });
    };

    processed = processed.replace(/\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}/g, (match, body) => {
        const items = body.split('\\itemch').filter(s => s.trim().length > 0);
        const htmlItems = items.map(item => `<li class="flex items-start gap-2 mb-1"><span class="text-blue-600 font-bold shrink-0">•</span><div class="leading-relaxed">${item.trim()}</div></li>`).join('');
        return `<ul class="my-3 pl-2 list-none">${htmlItems}</ul>`;
    });

    // Enumerate
    processed = processed.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (match, body) => {
        const items = parseItems(body);
        let html = `<ol class="list-decimal pl-8 space-y-1 my-2">`;
        items.forEach(it => { html += `<li class="pl-1">${it.content}</li>`; });
        html += `</ol>`;
        return html;
    });

    // Itemize
    processed = processed.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (match, body) => {
        const items = parseItems(body);
        let html = `<ul class="list-disc pl-8 space-y-1 my-2">`;
        items.forEach(it => { html += `<li class="pl-1">${it.content}</li>`; });
        html += `</ul>`;
        return html;
    });

    return processed;
}

export const convertArrayToMatrix = (content) => {
  if (!content) return "";
  return content.replace(/\\begin\{array\}(\{.*?\})?/g, '\\begin{matrix}').replace(/\\end\{array\}/g, '\\end{matrix}');
};

export const autoScaleTables = () => {
    document.querySelectorAll('.js-scale-wrapper').forEach(wrap => {
        const table = wrap.querySelector('table');
        if (!table) return;
        table.style.transform = 'none'; table.style.width = 'auto'; wrap.style.height = 'auto';
        if (table.scrollWidth > wrap.offsetWidth) {
            const scale = wrap.offsetWidth / table.scrollWidth;
            table.style.transform = `scale(${scale})`;
            wrap.style.height = `${table.scrollHeight * scale}px`;
            wrap.style.overflow = 'hidden'; 
        }
    });
};

/**
 * HÀM XỬ LÝ CHÍNH: FORMAT NỘI DUNG (FINAL FIX)
 */
export const formatContent = (text) => {
    if (text === null || text === undefined) return "";
    let processed = text;

    // 1. Clean Text
    processed = processed.replace(/\\centering/g, "").replace(/\\%/g, "%");
    processed = processed.replace(/\\textbf\{([^}]+)\}/g, '<b class="font-bold">$1</b>');
    processed = processed.replace(/\\textit\{([^}]+)\}/g, '<i class="italic">$1</i>');
    processed = processed.replace(/\\hfill/g, '<span style="display:inline-block; width: 2rem;"></span>');
    processed = processed.replace(/\\allowdisplaybreaks(\[.*?\])?/g, "");
    processed = processed.replace(/\\lq\\lq/g, '"').replace(/\\rq\\rq/g, '"').replace(/\\lq/g, '"').replace(/\\rq/g, '"');
    processed = processed.replace(/\\wideparen\{([^}]+)\}/g, '\\overset{\\frown}{$1}');
    processed = processed.replace(/\\(h|v)space\*?\{[^}]+\}/g, '').replace(/\\(no)?indent/g, '');

    // 2. Structure
    processed = convertArrayToMatrix(processed);
    processed = processNestedTikz(processed); 
    processed = processTabular(processed);    
    processed = processLatexLists(processed); 

    // 3. Cleanup Placeholder
    processed = processed.replace(/<div[^>]*class="[^"]*image-placeholder[^"]*"[^>]*>[\s\S]*?<\/div>/g, '');
    processed = processed.replace(/<div[^>]*class="[^"]*group relative[^"]*"[^>]*>[\s\S]*?(<img[^>]+>)[\s\S]*?<\/div>/gi, '<div class="flex justify-center my-3">$1</div>');
    processed = processed.replace(/Click đúp để tải file|hoặc Ctrl \+ V để dán ảnh|ẢNH TỪ IMMINI|VỊ TRÍ HÌNH TIKZ/gi, '');
    processed = processed.replace(/^\s*\}\s*$/gm, '').replace(/\}\s*$/g, '').replace(/Ảnh minh họa \(immini\)/g, '').replace(/Ảnh canh giữa/g, '');

    // 4. FIX LỖI CẮT NGẮN CÔNG THỨC <x
    const tagWhitelist = "script|style|div|span|p|br|img|table|tbody|thead|tr|td|th|ul|ol|li|b|i|u|strong|em|mark|label|input|button|a|h1|h2|h3|h4";
    // Regex: Math ($...$) | Tag HTML (<...>) | Text
    const regex = new RegExp(`(\\$\\$[\\s\\S]*?\\$\\$|\\\\\\[[\\s\\S]*?\\\\\\]|\\\\\\([\\s\\S]*?\\\\\\)|(?:\\$[\\s\\S]*?\\$)|<\\/?(?:${tagWhitelist})[^>]*>)`, 'gi');
    
    const parts = processed.split(regex);
    return parts.map(part => {
        const isMath = part.trim().startsWith('$') || part.trim().startsWith('\\(') || part.trim().startsWith('\\[');
        const isTag = part.startsWith('<') && part.endsWith('>');

        if (isMath) {
            return part.replace(/</g, ' < '); // FIX: Thêm khoảng trắng cứu công thức
        } else if (isTag) {
            return part; // Giữ nguyên tag HTML
        } else {
            let cleanPart = part.replace(/</g, '&lt;'); // FIX: Mã hóa text thường
            cleanPart = cleanPart.replace(/\}/g, '');
            return cleanPart.replace(/\\\\/g, '<br>').replace(/\n/g, '<br>');
        }
    }).join('');
};
