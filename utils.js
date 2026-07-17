/**
 * utils.js - Thư viện dùng chung (Đã tích hợp đầy đủ xử lý Ảnh & TikZ)
 */

/**
 * utils.js - Phiên bản "Strict Timeout"
 */
const TIKZ_API_URL = "https://compile.qmath.io.vn/compile"; 

export const compileTikZToImage = async (tikzCode) => {
    // THỜI GIAN TỐI ĐA CHO PHÉP: 30 Giây
    // Nếu VPS làm xong mà Cloudflare không trả về trong 30s -> CẮT
    const TIMEOUT_MS = 30000;

    const controller = new AbortController();
    
    // 1. Lệnh ngắt kết nối (Bom hẹn giờ)
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            controller.abort(); // Ngắt kết nối vật lý
            reject(new Error("TIMEOUT_FORCE")); // Báo lỗi logic
        }, TIMEOUT_MS);
    });

    // 2. Lệnh gửi đi thực tế
    const requestPromise = async () => {
        try {
            const response = await fetch(TIKZ_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: tikzCode }),
                signal: controller.signal
            });

            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            
            const text = await response.text();
            if (!text || text.trim() === "") throw new Error("Empty Response");

            return JSON.parse(text).url;
        } catch (err) {
            throw err;
        }
    };

    // 3. Cuộc đua: Ai xong trước thì lấy kết quả người đó
    return Promise.race([requestPromise(), timeoutPromise]);
};

// --- CÁC HÀM EXPORT HỖ TRỢ ---

export function cleanTikzCode(code) {
    let cleaned = code.replace(/\\resizebox\{[^}]+\}\{[^}]+\}\{\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\}/g, "$1");
    return cleaned.replace(/\\begin\{center\}/g, "").replace(/\\end\{center\}/g, "");
}

export function extractNextBrace(text) {
    if (!text) return null;
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 1, end = -1;
    for (let i = start + 1; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        if (depth === 0) { end = i; break; }
    }
    if (end === -1) return null;
    return { content: text.substring(start + 1, end), remaining: text.substring(end + 1), fullMatch: text.substring(start, end + 1) };
}

// --- CÁC HÀM XỬ LÝ NỘI BỘ ---

function processNestedTikz(text) {
    if (!text) return "";
    let result = "", remaining = String(text);
    while (true) {
        const startIdx = remaining.indexOf("\\begin{tikzpicture}");
        if (startIdx === -1) { result += remaining; break; }
        
        result += remaining.substring(0, startIdx);
        remaining = remaining.substring(startIdx);
        
        const openTag = "\\begin{tikzpicture}"; 
        const closeTag = "\\end{tikzpicture}";
        let depth = 1, endIdx = -1, searchPos = openTag.length;

        while (depth > 0) {
            const nextOpen = remaining.indexOf(openTag, searchPos);
            const nextClose = remaining.indexOf(closeTag, searchPos);
            if (nextClose === -1) { endIdx = remaining.length; depth = 0; break; }
            if (nextOpen !== -1 && nextOpen < nextClose) { depth++; searchPos = nextOpen + openTag.length; } 
            else { depth--; searchPos = nextClose + closeTag.length; if (depth === 0) endIdx = searchPos; }
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

    processed = processed.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (match, body) => {
        const items = parseItems(body);
        let html = `<ol class="list-decimal pl-8 space-y-1 my-2">`;
        items.forEach(it => { html += `<li class="pl-1">${it.content}</li>`; });
        html += `</ol>`;
        return html;
    });

    processed = processed.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (match, body) => {
        const items = parseItems(body);
        let html = `<ul class="list-disc pl-8 space-y-1 my-2">`;
        items.forEach(it => { html += `<li class="pl-1">${it.content}</li>`; });
        html += `</ul>`;
        return html;
    });
    return processed;
}

// --- CÁC HÀM EXPORT CHO BÊN NGOÀI ---

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
        if (table.scrollWidth > wrap.offsetWidth) {
            const scale = wrap.offsetWidth / table.scrollWidth;
            table.style.transform = `scale(${scale})`;
            wrap.style.height = `${table.scrollHeight * scale}px`;
            wrap.style.overflow = 'hidden'; 
        }
    });
};

/**
 * HÀM FORMAT CONTENT (FIX: EQNARRAY, <x, PLACEHOLDERS)
 */
export const formatContent = (text) => {
    if (text === null || text === undefined) return "";
    let processed = text;

    // 1. Clean Text
    processed = processed.replace(/\\centering/g, "");
    processed = processed.replace(/\\%/g, "%");
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

    // 3. Placeholder & Clean Rác
    processed = processed.replace(/<div[^>]*class="[^"]*image-placeholder[^"]*"[^>]*>[\s\S]*?<\/div>/g, '');
    processed = processed.replace(/<div[^>]*class="[^"]*group relative[^"]*"[^>]*>(?!<img)([\s\S]*?)<\/div>/gi, ''); 
    processed = processed.replace(/Click đúp để tải file|hoặc Ctrl \+ V để dán ảnh|ẢNH TỪ IMMINI|VỊ TRÍ HÌNH TIKZ/gi, '');
    processed = processed.replace(/^\s*\}\s*$/gm, '').replace(/\}\s*$/g, '').replace(/Ảnh minh họa \(immini\)/g, '').replace(/Ảnh canh giữa/g, '');

    // 4. Regex Bảo Vệ MathJax & HTML
    const tagWhitelist = "script|style|div|span|p|br|img|table|tbody|thead|tr|td|th|ul|ol|li|b|i|u|strong|em|mark|label|input|button|a|h1|h2|h3|h4";
    const regex = new RegExp(`(\\\\begin\\{[a-zA-Z*]+\\}[\\s\\S]*?\\\\end\\{[a-zA-Z*]+\\}|\\$\\$[\\s\\S]*?\\$\\$|\\\\\\[[\\s\\S]*?\\\\\\]|\\\\\\([\\s\\S]*?\\\\\\)|(?:\\$[\\s\\S]*?\\$)|<\\/?(?:${tagWhitelist})[^>]*>)`, 'gi');
    
    const parts = processed.split(regex);
    
    return parts.map(part => {
        const trimmed = part.trim();
        const isMath = trimmed.startsWith('$') || trimmed.startsWith('\\(') || trimmed.startsWith('\\[') || trimmed.startsWith('\\begin');
        const isTag = part.startsWith('<') && part.endsWith('>');

        if (isMath) {
            return part.replace(/</g, ' < '); // Fix lỗi <x
        } else if (isTag) {
            return part; // Giữ nguyên tag HTML
        } else {
            let cleanPart = part.replace(/</g, '&lt;'); // Mã hóa text thường
            cleanPart = cleanPart.replace(/\}/g, '');
            return cleanPart.replace(/\\\\/g, '<br>').replace(/\n/g, '<br>');
        }
    }).join('');
};

// ============================================================================
// 5. CÁC HÀM BỔ SUNG CHO EXAM (RENDER TIKZ, XỬ LÝ ẢNH, WATERMARK)
// ============================================================================

export const renderTikz = () => {
    const scripts = document.querySelectorAll('script[type="text/tikz"]');
    if (scripts.length === 0) return;
    const oldScript = document.querySelector('script[src*="tikzjax.js"]');
    if (oldScript) oldScript.remove();
    const newScript = document.createElement('script');
    newScript.src = "https://tikzjax.com/v1/tikzjax.js?v=" + Date.now();
    document.head.appendChild(newScript);
};

export const compressImage = (file, quality = 0.7, maxWidth = 1000) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

export const watermarkImage = (file, text) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;

                // Vẽ ảnh gốc
                ctx.drawImage(img, 0, 0);

                // Cấu hình đóng dấu (Góc trên phải, màu đỏ nổi bật)
                const fontSize = Math.max(20, Math.floor(img.width / 25));
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.textAlign = "right";
                ctx.textBaseline = "top";
                
                const textWidth = ctx.measureText(text).width;
                // Nền trắng mờ
                ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
                ctx.fillRect(canvas.width - textWidth - 20, 10, textWidth + 10, fontSize + 10);

                // Chữ đỏ
                ctx.fillStyle = "red";
                ctx.fillText(text, canvas.width - 15, 15);

                canvas.toBlob((blob) => {
                    const newFile = new File([blob], file.name, { type: 'image/jpeg' });
                    resolve(newFile);
                }, 'image/jpeg', 0.8);
            };
            img.onerror = (err) => reject(err);
        };
    });
};
