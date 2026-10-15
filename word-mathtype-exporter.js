/**
 * word-mathtype-exporter.js
 * Module xuất đề thi sang Microsoft Word (.docx) chuẩn MathType OLE / OpenXML Equation
 * Theo tiêu chuẩn BTN Group / Bộ Giáo dục & Đào tạo (BTPRO)
 * Tác giả: Thầy Choang Choang (Phạm Đình Quang) - https://www.qmath.io.vn
 *
 * Tính năng chính:
 * 1. Chuyển đổi 100% công thức LaTeX sang MathType / OpenXML Math (<m:oMath>) hiển thị trực quan trong Word.
 *    Tương thích hoàn hảo với MathType 6.x/7.x (nhấn Alt+\ hoặc Convert Equations để chuyển sang OLE).
 * 2. Tự động trích xuất và nhúng hình ảnh (PNG, JPG, base64, ảnh URL, TikZ render) trực tiếp vào file Word.
 * 3. Đa dạng mẫu tiêu đề (Chuẩn Bộ GD 2 cột, Mẫu Trung tâm/Thương hiệu, Mẫu Rút gọn, Không tiêu đề) & Cho phép sửa mọi thông tin.
 * 4. Tùy chọn chèn dòng kẻ chấm (Dotted Lines) với số dòng tùy ý cho học sinh trình bày bài giải / nháp trên đề.
 * 5. Chuẩn hóa bố cục BTPRO: Căn lề A4 2.0-1.0-1.0-1.0 cm, Font Times New Roman 12pt, thụt lề treo 1.75cm,
 *    tự động chia 4 cột, 2 cột hoặc 1 dòng cho phương án A, B, C, D.
 * 6. Hỗ trợ đầy đủ 4 phần thi theo cấu trúc đề mới của Bộ GD&ĐT: Phần I (4 lựa chọn), Phần II (Đúng/Sai), Phần III (Trả lời ngắn), Phần IV (Tự luận).
 */

(function(window) {
    'use strict';

    // ==========================================
    // 1. TIỆN ÍCH MÃ HÓA XML & BẢNG KÝ HIỆU TOÁN
    // ==========================================
    function escapeXml(unsafe) {
        if (unsafe === undefined || unsafe === null) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    const SYMBOL_MAP = {
        'pm': '\u00B1', 'mp': '\u2213', 'times': '\u00D7', 'div': '\u00F7', 'cdot': '\u22C5', 'ast': '\u2217',
        'leq': '\u2264', 'le': '\u2264', 'leqslant': '\u2264',
        'geq': '\u2265', 'ge': '\u2265', 'geqslant': '\u2265',
        'neq': '\u2260', 'ne': '\u2260', 'approx': '\u2248', 'equiv': '\u2261', 'sim': '\u223C', 'cong': '\u2245',
        'in': '\u2208', 'notin': '\u2209', 'subset': '\u2282', 'subseteq': '\u2286', 'supset': '\u2283', 'supseteq': '\u2287',
        'cup': '\u222A', 'cap': '\u2229', 'setminus': '\u2216', 'emptyset': '\u2205', 'varnothing': '\u2205',
        'forall': '\u2200', 'exists': '\u2203', 'infty': '\u221E', 'to': '\u2192', 'rightarrow': '\u2192',
        'leftarrow': '\u2190', 'Rightarrow': '\u21D2', 'Leftarrow': '\u21D0', 'Leftrightarrow': '\u21D4', 'iff': '\u21D4',
        'perp': '\u22A5', 'parallel': '\u2225', 'angle': '\u2220', 'circ': '\u00B0', 'degree': '\u00B0',
        'alpha': '\u03B1', 'beta': '\u03B2', 'gamma': '\u03B3', 'delta': '\u03B4', 'epsilon': '\u03B5', 'varepsilon': '\u03B5',
        'zeta': '\u03B6', 'eta': '\u03B7', 'theta': '\u03B8', 'vartheta': '\u03D1', 'iota': '\u03B9', 'kappa': '\u03BA',
        'lambda': '\u03BB', 'mu': '\u03BC', 'nu': '\u03BD', 'xi': '\u03BE', 'pi': '\u03C0', 'varpi': '\u03D6',
        'rho': '\u03C1', 'varrho': '\u03F1', 'sigma': '\u03C3', 'varsigma': '\u03C2', 'tau': '\u03C4', 'upsilon': '\u03C5',
        'phi': '\u03C6', 'varphi': '\u03D5', 'chi': '\u03C7', 'psi': '\u03C8', 'omega': '\u03C9',
        'Gamma': '\u0393', 'Delta': '\u0394', 'Theta': '\u0398', 'Lambda': '\u039B', 'Xi': '\u039E',
        'Pi': '\u03A0', 'Sigma': '\u03A3', 'Upsilon': '\u03A5', 'Phi': '\u03A6', 'Psi': '\u03A8', 'Omega': '\u03A9'
    };

    const MATH_FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'arcsin', 'arccos', 'arctan', 'ln', 'log', 'lg', 'exp', 'lim', 'max', 'min', 'det']);

    function extractGroup(str, startIdx, openChar = '{', closeChar = '}') {
        let idx = startIdx;
        while (idx < str.length && /\s/.test(str[idx])) idx++;
        if (idx >= str.length) return { content: '', nextIdx: idx };
        if (str[idx] === openChar) {
            let depth = 1;
            const s = idx + 1;
            idx++;
            while (idx < str.length && depth > 0) {
                if (str[idx] === openChar && str[idx - 1] !== '\\') depth++;
                else if (str[idx] === closeChar && str[idx - 1] !== '\\') depth--;
                idx++;
            }
            return { content: str.substring(s, idx - 1), nextIdx: idx };
        } else {
            if (str[idx] === '\\') {
                let end = idx + 1;
                while (end < str.length && /[a-zA-Z]/.test(str[end])) end++;
                return { content: str.substring(idx, end), nextIdx: end };
            } else {
                return { content: str[idx], nextIdx: idx + 1 };
            }
        }
    }

    // ==========================================
    // 2. BỘ CHUYỂN ĐỔI LATEX SANG OPENXML OMML
    // ==========================================
    function parseLatexToOmml(latex) {
        if (!latex) return '';
        let text = String(latex).trim();
        text = text.replace(/^\$\$([\s\S]*)\$\$$/, '$1')
                   .replace(/^\$([\s\S]*)\$$/, '$1')
                   .replace(/^\\\[([\s\S]*)\\\]$/, '$1')
                   .replace(/^\\\(([\s\S]*)\\\)$/, '$1')
                   .trim();

        text = text.replace(/\\(dfrac|tfrac|cfrac)\b/g, '\\frac');
        text = text.replace(/\\mathbb\{R\}/g, '\u211D').replace(/\\mathbb\{N\}/g, '\u2115').replace(/\\mathbb\{Z\}/g, '\u2124').replace(/\\mathbb\{Q\}/g, '\u211A').replace(/\\mathbb\{C\}/g, '\u2102');
        text = text.replace(/\\mathbb\s*R\b/g, '\u211D').replace(/\\mathbb\s*N\b/g, '\u2115').replace(/\\mathbb\s*Z\b/g, '\u2124');

        // Chuẩn hóa \heva và \hoac
        let changed = true;
        while (changed) {
            changed = false;
            const m = text.match(/\\(heva|hoac)\s*\{/);
            if (m) {
                const grp = extractGroup(text, m.index + m[0].length - 1);
                const inside = grp.content;
                if (m[1] === 'heva') {
                    text = text.substring(0, m.index) + `\\begin{cases}${inside}\\end{cases}` + text.substring(grp.nextIdx);
                } else {
                    text = text.substring(0, m.index) + `\\left[\\begin{array}{l}${inside}\\end{array}\\right.` + text.substring(grp.nextIdx);
                }
                changed = true;
            }
        }

        const innerXml = parseTokens(text);
        return `<m:oMath>${innerXml}</m:oMath>`;
    }

    function parseTokens(tex) {
        let out = '';
        let i = 0;
        const len = tex.length;

        while (i < len) {
            if (/\s/.test(tex[i])) { i++; continue; }

            // 1. Hệ phương trình / Cases
            if (tex.startsWith('\\begin{cases}', i)) {
                const endIdx = tex.indexOf('\\end{cases}', i);
                if (endIdx !== -1) {
                    const body = tex.substring(i + 13, endIdx);
                    const rows = body.split(/\\\\/).map(r => r.trim()).filter(Boolean);
                    out += `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr>${rows.map(r => `<m:e>${parseTokens(r)}</m:e>`).join('')}</m:eqArr></m:e></m:d>`;
                    i = endIdx + 11;
                    continue;
                }
            }

            // Tuyển nghiệm \left[\begin{array}...\end{array}\right.
            if (tex.startsWith('\\left[\\begin{array}', i) || tex.startsWith('\\left[ \\begin{array}', i)) {
                const endIdx = tex.indexOf('\\end{array}\\right.', i);
                if (endIdx !== -1) {
                    const bodyStart = tex.indexOf('}', i + 14) + 1;
                    const body = tex.substring(bodyStart, endIdx);
                    const rows = body.split(/\\\\/).map(r => r.trim()).filter(Boolean);
                    out += `<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr>${rows.map(r => `<m:e>${parseTokens(r)}</m:e>`).join('')}</m:eqArr></m:e></m:d>`;
                    i = endIdx + 18;
                    continue;
                }
            }

            // 2. Ma trận (pmatrix, bmatrix, matrix, vmatrix)
            const matrixMatch = tex.substring(i).match(/^\\begin\{(pmatrix|bmatrix|matrix|vmatrix)\}([\s\S]*?)\\end\{\1\}/);
            if (matrixMatch) {
                const env = matrixMatch[1];
                const body = matrixMatch[2];
                let begChr = '';
                let endChr = '';
                if (env === 'pmatrix') { begChr = '('; endChr = ')'; }
                else if (env === 'bmatrix') { begChr = '['; endChr = ']'; }
                else if (env === 'vmatrix') { begChr = '|'; endChr = '|'; }
                const rows = body.split(/\\\\/).map(r => r.trim()).filter(Boolean);
                let mXml = `<m:m><m:mPr/>`;
                for (const r of rows) {
                    const cols = r.split('&').map(c => c.trim());
                    mXml += `<m:mr>${cols.map(c => `<m:e>${parseTokens(c)}</m:e>`).join('')}</m:mr>`;
                }
                mXml += `</m:m>`;
                if (begChr) {
                    out += `<m:d><m:dPr><m:begChr m:val="${begChr}"/><m:endChr m:val="${endChr}"/></m:dPr><m:e>${mXml}</m:e></m:d>`;
                } else {
                    out += mXml;
                }
                i += matrixMatch[0].length;
                continue;
            }

            // 3. Ngoặc có độ co dãn \left( ... \right), \left[ ... \right], \left| ... \right|
            if (tex.startsWith('\\left', i)) {
                const delimChar = tex[i + 5];
                const closePattern = /\\right([)\]\}|.\\])/;
                const rest = tex.substring(i + 6);
                const cm = rest.match(closePattern);
                if (cm) {
                    const inside = rest.substring(0, cm.index);
                    let beg = delimChar;
                    let end = cm[1];
                    if (beg === '\\' && rest.startsWith('{')) beg = '{';
                    if (end === '.' || end === '') end = '';
                    if (beg === '.') beg = '';
                    out += `<m:d><m:dPr><m:begChr m:val="${escapeXml(beg)}"/><m:endChr m:val="${escapeXml(end)}"/></m:dPr><m:e>${parseTokens(inside)}</m:e></m:d>`;
                    i += 6 + cm.index + cm[0].length;
                    continue;
                }
            }

            // 4. Phân số \frac{A}{B}
            if (tex.startsWith('\\frac', i)) {
                const grp1 = extractGroup(tex, i + 5);
                const grp2 = extractGroup(tex, grp1.nextIdx);
                out += `<m:f><m:fPr/><m:num>${parseTokens(grp1.content)}</m:num><m:den>${parseTokens(grp2.content)}</m:den></m:f>`;
                i = grp2.nextIdx;
                out = handlePostScript(tex, grp2.nextIdx, out, (nextI) => { i = nextI; });
                continue;
            }

            // 5. Căn thức \sqrt{A} hoặc \sqrt[n]{A}
            if (tex.startsWith('\\sqrt', i)) {
                let nextI = i + 5;
                while (nextI < len && /\s/.test(tex[nextI])) nextI++;
                let degXml = '';
                let isNth = false;
                if (tex[nextI] === '[') {
                    const endBracket = tex.indexOf(']', nextI);
                    if (endBracket !== -1) {
                        const degText = tex.substring(nextI + 1, endBracket);
                        degXml = `<m:deg>${parseTokens(degText)}</m:deg>`;
                        isNth = true;
                        nextI = endBracket + 1;
                    }
                }
                const grp = extractGroup(tex, nextI);
                if (isNth) {
                    out += `<m:rad><m:radPr/>${degXml}<m:e>${parseTokens(grp.content)}</m:e></m:rad>`;
                } else {
                    out += `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${parseTokens(grp.content)}</m:e></m:rad>`;
                }
                i = grp.nextIdx;
                out = handlePostScript(tex, grp.nextIdx, out, (nI) => { i = nI; });
                continue;
            }

            // 6. Giới hạn \lim_{x \to 0}
            if (tex.startsWith('\\lim', i)) {
                let nextI = i + 4;
                while (nextI < len && (/\s/.test(tex[nextI]) || tex.startsWith('\\limits', nextI))) {
                    if (tex.startsWith('\\limits', nextI)) nextI += 7;
                    else nextI++;
                }
                if (tex[nextI] === '_') {
                    const grp = extractGroup(tex, nextI + 1);
                    out += `<m:limLow><m:limLowPr/><m:e><m:r><m:rPr><m:nor/></m:rPr><m:t>lim</m:t></m:r></m:e><m:lim>${parseTokens(grp.content)}</m:lim></m:limLow>`;
                    i = grp.nextIdx;
                    continue;
                } else {
                    out += `<m:r><m:rPr><m:nor/></m:rPr><m:t>lim</m:t></m:r>`;
                    i = nextI;
                    continue;
                }
            }

            // 7. Tích phân \int_{a}^{b}
            if (tex.startsWith('\\int', i) || tex.startsWith('\\iint', i)) {
                const isIint = tex.startsWith('\\iint', i);
                let nextI = i + (isIint ? 5 : 4);
                const chr = isIint ? '\u222C' : '\u222B';
                let subText = null;
                let supText = null;
                while (nextI < len && (tex[nextI] === '_' || tex[nextI] === '^' || /\s/.test(tex[nextI]))) {
                    if (/\s/.test(tex[nextI])) { nextI++; continue; }
                    if (tex[nextI] === '_') {
                        const g = extractGroup(tex, nextI + 1);
                        subText = g.content;
                        nextI = g.nextIdx;
                    } else if (tex[nextI] === '^') {
                        const g = extractGroup(tex, nextI + 1);
                        supText = g.content;
                        nextI = g.nextIdx;
                    }
                }
                if (subText !== null || supText !== null) {
                    out += `<m:nary><m:naryPr><m:chr m:val="${chr}"/><m:limLoc m:val="subSup"/></m:naryPr><m:sub>${subText ? parseTokens(subText) : ''}</m:sub><m:sup>${supText ? parseTokens(supText) : ''}</m:sup><m:e/></m:nary>`;
                } else {
                    out += `<m:r><m:t>${chr}</m:t></m:r>`;
                }
                i = nextI;
                continue;
            }

            // 8. Tổng xích ma \sum_{i=1}^{n}
            if (tex.startsWith('\\sum', i) || tex.startsWith('\\prod', i)) {
                const isSum = tex.startsWith('\\sum', i);
                let nextI = i + (isSum ? 4 : 5);
                const chr = isSum ? '\u2211' : '\u220F';
                let subText = null;
                let supText = null;
                while (nextI < len && (tex[nextI] === '_' || tex[nextI] === '^' || /\s/.test(tex[nextI]) || tex.startsWith('\\limits', nextI))) {
                    if (tex.startsWith('\\limits', nextI)) { nextI += 7; continue; }
                    if (/\s/.test(tex[nextI])) { nextI++; continue; }
                    if (tex[nextI] === '_') {
                        const g = extractGroup(tex, nextI + 1);
                        subText = g.content;
                        nextI = g.nextIdx;
                    } else if (tex[nextI] === '^') {
                        const g = extractGroup(tex, nextI + 1);
                        supText = g.content;
                        nextI = g.nextIdx;
                    }
                }
                if (subText !== null || supText !== null) {
                    out += `<m:nary><m:naryPr><m:chr m:val="${chr}"/><m:limLoc m:val="undOvr"/></m:naryPr><m:sub>${subText ? parseTokens(subText) : ''}</m:sub><m:sup>${supText ? parseTokens(supText) : ''}</m:sup><m:e/></m:nary>`;
                } else {
                    out += `<m:r><m:t>${chr}</m:t></m:r>`;
                }
                i = nextI;
                continue;
            }

            // 9. Véc tơ \vec{AB}, \overrightarrow{AB}
            const vecMatch = tex.substring(i).match(/^\\(vec|overrightarrow|vectors)\b/);
            if (vecMatch) {
                const grp = extractGroup(tex, i + vecMatch[0].length);
                out += `<m:acc><m:accPr><m:chr m:val="&#x20D7;"/></m:accPr><m:e>${parseTokens(grp.content)}</m:e></m:acc>`;
                i = grp.nextIdx;
                out = handlePostScript(tex, grp.nextIdx, out, (nI) => { i = nI; });
                continue;
            }

            // 10. Số phức liên hợp / Đoạn thẳng \overline{AB}, \bar{z}
            const barMatch = tex.substring(i).match(/^\\(overline|bar)\b/);
            if (barMatch) {
                const grp = extractGroup(tex, i + barMatch[0].length);
                out += `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${parseTokens(grp.content)}</m:e></m:bar>`;
                i = grp.nextIdx;
                out = handlePostScript(tex, grp.nextIdx, out, (nI) => { i = nI; });
                continue;
            }

            // 11. Cung tròn, góc \widehat{ABC}, \wideparen{AB}, \overparen{AB}
            const accMatch = tex.substring(i).match(/^\\(widehat|wideparen|overparen|cung|widearc|hat)\b/);
            if (accMatch) {
                const cmd = accMatch[1];
                const grp = extractGroup(tex, i + accMatch[0].length);
                let chr = '^';
                if (cmd === 'wideparen' || cmd === 'overparen' || cmd === 'cung' || cmd === 'widearc') {
                    chr = '&#x23DC;';
                }
                out += `<m:acc><m:accPr><m:chr m:val="${chr}"/></m:accPr><m:e>${parseTokens(grp.content)}</m:e></m:acc>`;
                i = grp.nextIdx;
                out = handlePostScript(tex, grp.nextIdx, out, (nI) => { i = nI; });
                continue;
            }

            // 12. Khối văn bản trong công thức \text{...}, \mathrm{...}
            const textMatch = tex.substring(i).match(/^\\(text|mathrm|mathbf|mathit)\b/);
            if (textMatch) {
                const grp = extractGroup(tex, i + textMatch[0].length);
                out += `<m:r><m:rPr><m:nor/></m:rPr><m:t>${escapeXml(grp.content)}</m:t></m:r>`;
                i = grp.nextIdx;
                continue;
            }

            // 13. Lệnh / Macro \name
            if (tex[i] === '\\') {
                let end = i + 1;
                while (end < len && /[a-zA-Z]/.test(tex[end])) end++;
                const cmd = tex.substring(i + 1, end);

                if (MATH_FUNCS.has(cmd)) {
                    let atom = `<m:r><m:rPr><m:nor/></m:rPr><m:t>${cmd}</m:t></m:r>`;
                    i = end;
                    atom = handlePostScript(tex, end, atom, (nI) => { i = nI; });
                    out += atom;
                    continue;
                }

                if (SYMBOL_MAP[cmd]) {
                    const sym = SYMBOL_MAP[cmd];
                    let atom = `<m:r><m:t>${escapeXml(sym)}</m:t></m:r>`;
                    i = end;
                    atom = handlePostScript(tex, end, atom, (nI) => { i = nI; });
                    out += atom;
                    continue;
                }

                if (cmd === 'quad' || cmd === 'qquad') {
                    out += `<m:r><m:t>  </m:t></m:r>`;
                } else if (cmd === ',' || cmd === ';') {
                    out += `<m:r><m:t> </m:t></m:r>`;
                } else if (cmd) {
                    out += `<m:r><m:t>${escapeXml(cmd)}</m:t></m:r>`;
                }
                i = end;
                continue;
            }

            // 14. Ký tự thông thường (biến, số, phép tính)
            const char = tex[i];
            i++;

            let atom = '';
            if (/[a-zA-Z]/.test(char)) {
                atom = `<m:r><m:rPr><m:sty m:val="i"/></m:rPr><m:t>${char}</m:t></m:r>`;
            } else if (/[0-9]/.test(char)) {
                let numStr = char;
                while (i < len && /[0-9\.]/.test(tex[i])) {
                    numStr += tex[i];
                    i++;
                }
                atom = `<m:r><m:t>${numStr}</m:t></m:r>`;
            } else {
                let opChar = char;
                if (char === '<') opChar = '&lt;';
                else if (char === '>') opChar = '&gt;';
                else if (char === '&') opChar = '&amp;';
                atom = `<m:r><m:t>${opChar}</m:t></m:r>`;
            }

            atom = handlePostScript(tex, i, atom, (nI) => { i = nI; });
            out += atom;
        }

        return out;
    }

    function handlePostScript(tex, currentIdx, baseXml, setNextIdx) {
        let i = currentIdx;
        const len = tex.length;
        let sub = null;
        let sup = null;

        while (i < len && (tex[i] === '^' || tex[i] === '_' || /\s/.test(tex[i]))) {
            if (/\s/.test(tex[i])) { i++; continue; }
            if (tex[i] === '^') {
                const g = extractGroup(tex, i + 1);
                sup = g.content;
                i = g.nextIdx;
            } else if (tex[i] === '_') {
                const g = extractGroup(tex, i + 1);
                sub = g.content;
                i = g.nextIdx;
            }
        }

        if (sub !== null && sup !== null) {
            setNextIdx(i);
            return `<m:sSubSup><m:sSubSupPr/><m:e>${baseXml}</m:e><m:sub>${parseTokens(sub)}</m:sub><m:sup>${parseTokens(sup)}</m:sup></m:sSubSup>`;
        } else if (sup !== null) {
            setNextIdx(i);
            return `<m:sSup><m:sSupPr/><m:e>${baseXml}</m:e><m:sup>${parseTokens(sup)}</m:sup></m:sSup>`;
        } else if (sub !== null) {
            setNextIdx(i);
            return `<m:sSub><m:sSubPr/><m:e>${baseXml}</m:e><m:sub>${parseTokens(sub)}</m:sub></m:sSub>`;
        }

        setNextIdx(currentIdx);
        return baseXml;
    }

    // ==========================================
    // 3. TÁCH NỘI DUNG THÀNH TEXT, FORMULA, IMAGE
    // ==========================================
    function cleanHtmlToWordText(text) {
        if (!text) return '';
        let s = String(text);
        s = s.replace(/<br\s*\/?>/gi, '\n');
        s = s.replace(/<\/p>/gi, '\n');
        s = s.replace(/<p[^>]*>/gi, '');
        s = s.replace(/&nbsp;/g, ' ');
        s = s.replace(/&lt;/g, '<');
        s = s.replace(/&gt;/g, '>');
        s = s.replace(/&amp;/g, '&');
        s = s.replace(/<\/?(?:div|span|strong|b|em|i|u|script)[^>]*>/gi, '');
        return s.trim();
    }

    // Tách văn bản thành các token
    function parseRunsFromText(rawText, baseBold = false, baseItalic = false) {
        if (!rawText) return [];
        const text = String(rawText);
        const tokens = text.split(/(\\textbf\{[^{}]*\}|\\textit\{[^{}]*\}|\\underline\{[^{}]*\}|\$\$.*?\$\$|\$[^\$]+?\$|\\\[.*?\\\]|\\\(.*?\\\)|<img\s+[^>]*src=["'][^"']+["'][^>]*>|\\includegraphics(?:\[.*?\])?\{[^}]+\})/g);
        const runs = [];

        for (const tok of tokens) {
            if (!tok) continue;
            // Image tag
            const mImg = tok.match(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/i) || tok.match(/\\includegraphics(?:\[.*?\])?\{([^}]+)\}/i);
            if (mImg) {
                runs.push({ isImage: true, src: mImg[1] });
                continue;
            }
            // Math formula
            if (tok.startsWith('$') || tok.startsWith('\\[') || tok.startsWith('\\(')) {
                runs.push({ isMath: true, ommlXml: parseLatexToOmml(tok) });
                continue;
            }
            // Bold
            const mB = tok.match(/^\\textbf\{(.*)\}$/);
            if (mB) {
                runs.push({ text: mB[1], bold: true, italic: baseItalic });
                continue;
            }
            // Italic
            const mI = tok.match(/^\\textit\{(.*)\}$/);
            if (mI) {
                runs.push({ text: mI[1], bold: baseBold, italic: true });
                continue;
            }
            // Underline
            const mU = tok.match(/^\\underline\{(.*)\}$/);
            if (mU) {
                runs.push({ text: mU[1], bold: baseBold, italic: baseItalic, underline: true });
                continue;
            }
            // Plain text
            runs.push({ text: tok, bold: baseBold, italic: baseItalic });
        }
        return runs;
    }

    function renderRunsToXml(runs, imageMap = {}) {
        return runs.map(r => {
            if (r.isMath) {
                return r.ommlXml;
            }
            if (r.isImage) {
                const imgInfo = imageMap[r.src];
                if (imgInfo) {
                    return buildDrawingXml(imgInfo.id, imgInfo.rId, imgInfo.cx, imgInfo.cy);
                }
                return '';
            }
            const bTag = r.bold ? '<w:b/>' : '';
            const iTag = r.italic ? '<w:i/>' : '';
            const uTag = r.underline ? '<w:u w:val="single"/>' : '';
            const colTag = r.color ? `<w:color w:val="${r.color}"/>` : '';
            return `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${bTag}${iTag}${uTag}${colTag}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(r.text)}</w:t></w:r>`;
        }).join('');
    }

    function buildDrawingXml(id, rId, cx = 2520000, cy = 1800000) {
        return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image_${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }

    // ==========================================
    // 4. TIỆN ÍCH DÒNG KẺ CHẤM & HEADER WORD
    // ==========================================
    function buildDottedLinesXml(count = 4) {
        let res = '';
        for (let i = 0; i < count; i++) {
            res += `
            <w:p>
                <w:pPr>
                    <w:tabs><w:tab w:val="right" w:leader="dot" w:pos="10773"/></w:tabs>
                    <w:spacing w:line="360" w:lineRule="auto" w:after="80"/>
                </w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:color w:val="888888"/></w:rPr><w:tab/></w:r>
            </w:p>`;
        }
        return res;
    }

    function buildCandidateInfoXml() {
        return `
        <w:p>
            <w:pPr><w:spacing w:before="120" w:after="200"/><w:jc w:val="both"/></w:pPr>
            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Họ và tên thí sinh: ............................................................................ Số báo danh: ............................ Lớp: ........................</w:t></w:r>
        </w:p>`;
    }

    // ==========================================
    // 5. XÂY DỰNG TOÀN BỘ FILE WORD XML (BTPRO)
    // ==========================================
    function buildDocumentXml({ title, questions, mode = 'questions', options = {}, imageMap = {} }) {
        const {
            headerStyle = 'standard_gov', // 'standard_gov', 'brand_center', 'compact', 'none'
            schoolName = 'SỞ GD&ĐT HÀ NỘI / TRƯỜNG THPT',
            examSubtitle = 'ĐỀ KHẢO SÁT CHẤT LƯỢNG HỌC KỲ',
            subject = 'Toán học',
            grade = '12',
            examCode = '101',
            duration = 90,
            includeCandidateInfo = true,
            includeDottedLines = false,
            dottedLinesCount = 4,
            dottedLinesScope = 'essay_short', // 'essay_short' hoặc 'all'
            includeAnswerTable = true,
            includeCccd = false
        } = options;

        let bodyXml = '';

        // 1. TẠO TIÊU ĐỀ THEO MẪU ĐƯỢC CHỌN
        if (headerStyle === 'standard_gov') {
            bodyXml += `
            <w:tbl>
                <w:tblPr>
                    <w:tblW w:w="10773" w:type="dxa"/>
                    <w:tblBorders>
                        <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
                        <w:insideH w:val="none"/><w:insideV w:val="none"/>
                    </w:tblBorders>
                </w:tblPr>
                <w:tblGrid>
                    <w:gridCol w:w="5386"/>
                    <w:gridCol w:w="5387"/>
                </w:tblGrid>
                <w:tr>
                    <w:tc>
                        <w:tcPr><w:tcW w:w="5386" w:type="dxa"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(schoolName.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(examSubtitle.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>(Đề thi có ${questions.length} câu hỏi)</w:t></w:r>
                        </w:p>
                    </w:tc>
                    <w:tc>
                        <w:tcPr><w:tcW w:w="5387" w:type="dxa"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(title.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>MÔN: ${escapeXml(subject.toUpperCase())} ${grade ? '- KHỐI ' + escapeXml(grade) : ''}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>Thời gian làm bài: ${duration} phút (Mã đề: ${escapeXml(examCode)})</w:t></w:r>
                        </w:p>
                    </w:tc>
                </w:tr>
            </w:tbl>`;
            if (includeCandidateInfo) {
                bodyXml += buildCandidateInfoXml();
            }
        } else if (headerStyle === 'brand_center') {
            bodyXml += `
            <w:p>
                <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="1E40AF"/></w:rPr><w:t>${escapeXml(schoolName.toUpperCase())}</w:t></w:r>
            </w:p>
            <w:p>
                <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>${escapeXml(title.toUpperCase())}</w:t></w:r>
            </w:p>
            <w:p>
                <w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Môn: ${escapeXml(subject)} | Khối ${escapeXml(grade)} | Thời gian làm bài: ${duration} phút | Mã đề: ${escapeXml(examCode)}</w:t></w:r>
            </w:p>`;
            if (includeCandidateInfo) {
                bodyXml += buildCandidateInfoXml();
            }
        } else if (headerStyle === 'compact') {
            bodyXml += `
            <w:p>
                <w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>${escapeXml(title.toUpperCase())}</w:t></w:r>
            </w:p>
            <w:p>
                <w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Môn: ${escapeXml(subject)} - Thời gian: ${duration} phút - Mã đề: ${escapeXml(examCode)}</w:t></w:r>
            </w:p>`;
            if (includeCandidateInfo) {
                bodyXml += buildCandidateInfoXml();
            }
        }

        // 2. PHÂN LOẠI CÂU HỎI THEO 4 PHẦN CHUẨN BỘ
        const part1 = [];
        const part2 = [];
        const part3 = [];
        const part4 = [];

        (questions || []).forEach((q, idx) => {
            const type = (q.type || '').toLowerCase();
            if (type === 'tf' || (Array.isArray(q.statements) && q.statements.length > 0)) {
                part2.push({ ...q, globalIdx: idx + 1 });
            } else if (type === 'short' || type === 'tl_short' || (q.answer !== undefined && q.answer !== null && !Array.isArray(q.options) && String(q.answer).trim() !== '')) {
                part3.push({ ...q, globalIdx: idx + 1 });
            } else if (type === 'essay' || type === 'tl') {
                part4.push({ ...q, globalIdx: idx + 1 });
            } else {
                part1.push({ ...q, globalIdx: idx + 1 });
            }
        });

        const renderSectionHeader = (roman, titleText, descText) => `
        <w:p>
          <w:pPr><w:spacing w:before="240" w:after="60"/></w:pPr>
          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="1E40AF"/></w:rPr><w:t>PHẦN ${roman}. ${escapeXml(titleText.toUpperCase())}</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:spacing w:after="120"/></w:pPr>
          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(descText)}</w:t></w:r>
        </w:p>`;

        let currentRoman = 1;
        const romanNumerals = ['I', 'II', 'III', 'IV'];

        // ================= PHẦN I: TRẮC NGHIỆM 4 PHƯƠNG ÁN =================
        if (part1.length > 0) {
            bodyXml += renderSectionHeader(
                romanNumerals[currentRoman - 1],
                'CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN',
                `Thí sinh trả lời từ câu 1 đến câu ${part1.length}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`
            );
            currentRoman++;

            part1.forEach((q, pIdx) => {
                const qNum = pIdx + 1;
                const cccdTag = (includeCccd && (q.cccd || q.bankId || q.id)) ? `[${q.cccd || q.bankId || q.id}] ` : '';
                const qContent = cleanHtmlToWordText(q.content);
                const runs = parseRunsFromText(qContent);

                bodyXml += `
                <w:p>
                  <w:pPr>
                    <w:ind w:left="992" w:hanging="992"/>
                    <w:spacing w:before="80" w:after="40" w:line="276" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                    <w:t xml:space="preserve">${escapeXml(cccdTag)}Câu ${qNum}. </w:t>
                  </w:r>
                  ${renderRunsToXml(runs, imageMap)}
                </w:p>`;

                // Chèn ảnh đính kèm câu hỏi nếu có
                if (q.image && imageMap[q.image]) {
                    const imgInfo = imageMap[q.image];
                    bodyXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>${buildDrawingXml(imgInfo.id, imgInfo.rId, imgInfo.cx, imgInfo.cy)}</w:p>`;
                }

                // Options
                const options = Array.isArray(q.options) ? q.options : [];
                if (options.length > 0) {
                    const letters = ['A', 'B', 'C', 'D'];
                    const cleanOpts = options.map(o => cleanHtmlToWordText(typeof o === 'object' ? (o.text || '') : o));
                    const maxLen = Math.max(...cleanOpts.map(o => o.length));
                    const correctIdx = typeof q.correct === 'number' ? q.correct : (q.correctAnswer ? ['A','B','C','D'].indexOf(String(q.correctAnswer).trim().toUpperCase()) : -1);

                    if (cleanOpts.length === 4 && maxLen <= 24) {
                        bodyXml += `
                        <w:p>
                          <w:pPr>
                            <w:tabs>
                              <w:tab w:val="left" w:pos="3401"/>
                              <w:tab w:val="left" w:pos="5669"/>
                              <w:tab w:val="left" w:pos="7937"/>
                            </w:tabs>
                            <w:ind w:left="992"/>
                            <w:spacing w:after="40" w:line="276" w:lineRule="auto"/>
                          </w:pPr>`;
                        cleanOpts.forEach((optText, oIdx) => {
                            if (oIdx > 0) bodyXml += `<w:r><w:tab/></w:r>`;
                            const isCorrect = (oIdx === correctIdx);
                            const isTeacherMode = (mode === 'full');
                            const bTag = isTeacherMode && isCorrect ? '<w:b/><w:u w:val="single"/>' : '<w:b/>';
                            bodyXml += `
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${bTag}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${letters[oIdx]}. </w:t></w:r>
                            ${renderRunsToXml(parseRunsFromText(optText), imageMap)}`;
                        });
                        bodyXml += `</w:p>`;
                    } else if (cleanOpts.length === 4 && maxLen <= 45) {
                        for (let row = 0; row < 2; row++) {
                            bodyXml += `
                            <w:p>
                              <w:pPr>
                                <w:tabs><w:tab w:val="left" w:pos="5669"/></w:tabs>
                                <w:ind w:left="992"/>
                                <w:spacing w:after="40" w:line="276" w:lineRule="auto"/>
                              </w:pPr>`;
                            for (let col = 0; col < 2; col++) {
                                const oIdx = row * 2 + col;
                                if (col > 0) bodyXml += `<w:r><w:tab/></w:r>`;
                                const isCorrect = (oIdx === correctIdx);
                                const isTeacherMode = (mode === 'full');
                                const bTag = isTeacherMode && isCorrect ? '<w:b/><w:u w:val="single"/>' : '<w:b/>';
                                bodyXml += `
                                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${bTag}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${letters[oIdx]}. </w:t></w:r>
                                ${renderRunsToXml(parseRunsFromText(cleanOpts[oIdx]), imageMap)}`;
                            }
                            bodyXml += `</w:p>`;
                        }
                    } else {
                        cleanOpts.forEach((optText, oIdx) => {
                            const isCorrect = (oIdx === correctIdx);
                            const isTeacherMode = (mode === 'full');
                            const bTag = isTeacherMode && isCorrect ? '<w:b/><w:u w:val="single"/>' : '<w:b/>';
                            bodyXml += `
                            <w:p>
                              <w:pPr><w:ind w:left="992"/><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr>
                              <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${bTag}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${letters[oIdx] || ''}. </w:t></w:r>
                              ${renderRunsToXml(parseRunsFromText(optText), imageMap)}
                            </w:p>`;
                        });
                    }
                }

                // Dòng kẻ chấm nếu được chọn cho tất cả các câu
                if (mode === 'questions' && includeDottedLines && dottedLinesScope === 'all') {
                    bodyXml += buildDottedLinesXml(dottedLinesCount);
                }

                // Lời giải chi tiết
                if (mode === 'full' && (q.solution || q.explain)) {
                    const solText = cleanHtmlToWordText(q.solution || q.explain);
                    bodyXml += `
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:before="60" w:after="40"/><w:jc w:val="both"/></w:pPr>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:i/><w:color w:val="1E40AF"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Lời giải:</w:t></w:r>
                    </w:p>
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>
                      ${renderRunsToXml(parseRunsFromText(solText), imageMap)}
                    </w:p>`;
                }
            });
        }

        // ================= PHẦN II: TRẮC NGHIỆM ĐÚNG / SAI =================
        if (part2.length > 0) {
            bodyXml += renderSectionHeader(
                romanNumerals[currentRoman - 1],
                'CÂU TRẮC NGHIỆM ĐÚNG SAI',
                `Thí sinh trả lời từ câu 1 đến câu ${part2.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`
            );
            currentRoman++;

            part2.forEach((q, pIdx) => {
                const qNum = pIdx + 1;
                const cccdTag = (includeCccd && (q.cccd || q.bankId || q.id)) ? `[${q.cccd || q.bankId || q.id}] ` : '';
                const qContent = cleanHtmlToWordText(q.content);

                bodyXml += `
                <w:p>
                  <w:pPr>
                    <w:ind w:left="992" w:hanging="992"/>
                    <w:spacing w:before="100" w:after="40" w:line="276" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                    <w:t xml:space="preserve">${escapeXml(cccdTag)}Câu ${qNum}. </w:t>
                  </w:r>
                  ${renderRunsToXml(parseRunsFromText(qContent), imageMap)}
                </w:p>`;

                if (q.image && imageMap[q.image]) {
                    const imgInfo = imageMap[q.image];
                    bodyXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>${buildDrawingXml(imgInfo.id, imgInfo.rId, imgInfo.cx, imgInfo.cy)}</w:p>`;
                }

                const statements = Array.isArray(q.statements) ? q.statements : [];
                const subLabels = ['a', 'b', 'c', 'd'];
                statements.forEach((st, sIdx) => {
                    const stText = cleanHtmlToWordText(typeof st === 'object' ? (st.content || st.text || '') : st);
                    const isTrue = typeof st === 'object' ? (st.correct === true || st.isCorrect === true || st.answer === 'Đ' || st.answer === true) : false;
                    const ansLabel = (mode === 'full') ? (isTrue ? ' [ĐÚNG]' : ' [SAI]') : '';
                    const ansColor = isTrue ? '059669' : 'DC2626';

                    bodyXml += `
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:after="40" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${subLabels[sIdx]}) </w:t></w:r>
                      ${renderRunsToXml(parseRunsFromText(stText), imageMap)}
                      ${ansLabel ? `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${ansColor}"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${ansLabel}</w:t></w:r>` : ''}
                    </w:p>`;
                });

                if (mode === 'questions' && includeDottedLines && dottedLinesScope === 'all') {
                    bodyXml += buildDottedLinesXml(dottedLinesCount);
                }

                if (mode === 'full' && (q.solution || q.explain)) {
                    const solText = cleanHtmlToWordText(q.solution || q.explain);
                    bodyXml += `
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:before="60" w:after="40"/><w:jc w:val="both"/></w:pPr>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:i/><w:color w:val="1E40AF"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Lời giải:</w:t></w:r>
                    </w:p>
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>
                      ${renderRunsToXml(parseRunsFromText(solText), imageMap)}
                    </w:p>`;
                }
            });
        }

        // ================= PHẦN III: TRẢ LỜI NGẮN =================
        if (part3.length > 0) {
            bodyXml += renderSectionHeader(
                romanNumerals[currentRoman - 1],
                'CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN',
                `Thí sinh trả lời từ câu 1 đến câu ${part3.length}. Thí sinh điền kết quả vào ô tương ứng trên đề thi.`
            );
            currentRoman++;

            part3.forEach((q, pIdx) => {
                const qNum = pIdx + 1;
                const cccdTag = (includeCccd && (q.cccd || q.bankId || q.id)) ? `[${q.cccd || q.bankId || q.id}] ` : '';
                const qContent = cleanHtmlToWordText(q.content);

                bodyXml += `
                <w:p>
                  <w:pPr>
                    <w:ind w:left="992" w:hanging="992"/>
                    <w:spacing w:before="100" w:after="40" w:line="276" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                    <w:t xml:space="preserve">${escapeXml(cccdTag)}Câu ${qNum}. </w:t>
                  </w:r>
                  ${renderRunsToXml(parseRunsFromText(qContent), imageMap)}
                </w:p>`;

                if (q.image && imageMap[q.image]) {
                    const imgInfo = imageMap[q.image];
                    bodyXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>${buildDrawingXml(imgInfo.id, imgInfo.rId, imgInfo.cx, imgInfo.cy)}</w:p>`;
                }

                // Dòng kẻ chấm cho trả lời ngắn trong đề bài
                if (mode === 'questions') {
                    if (includeDottedLines) {
                        bodyXml += `<w:p><w:pPr><w:ind w:left="992"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:color w:val="666666"/></w:rPr><w:t>Đáp số: ....................................................................................................................................</w:t></w:r></w:p>`;
                        bodyXml += buildDottedLinesXml(dottedLinesCount);
                    } else {
                        bodyXml += `
                        <w:p>
                          <w:pPr><w:ind w:left="992"/><w:spacing w:before="40" w:after="60"/></w:pPr>
                          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/></w:rPr><w:t>Đáp số: </w:t></w:r>
                          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:u w:val="single"/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">                          </w:t></w:r>
                        </w:p>`;
                    }
                }

                if (mode === 'full') {
                    const ansVal = q.answer || q.shortAnswer || q.correctAnswer || '';
                    bodyXml += `
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:before="40" w:after="40"/></w:pPr>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="059669"/><w:sz w:val="24"/></w:rPr><w:t>Đáp số: </w:t></w:r>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:u w:val="single"/><w:color w:val="059669"/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(ansVal)}</w:t></w:r>
                    </w:p>`;
                    if (q.solution || q.explain) {
                        const solText = cleanHtmlToWordText(q.solution || q.explain);
                        bodyXml += `
                        <w:p>
                          <w:pPr><w:ind w:left="992"/><w:spacing w:before="40" w:after="40"/><w:jc w:val="both"/></w:pPr>
                          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:i/><w:color w:val="1E40AF"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Lời giải:</w:t></w:r>
                        </w:p>
                        <w:p>
                          <w:pPr><w:ind w:left="992"/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>
                          ${renderRunsToXml(parseRunsFromText(solText), imageMap)}
                        </w:p>`;
                    }
                }
            });
        }

        // ================= PHẦN IV: TỰ LUẬN =================
        if (part4.length > 0) {
            bodyXml += renderSectionHeader(
                romanNumerals[currentRoman - 1],
                'TỰ LUẬN',
                `Thí sinh trình bày chi tiết lời giải từ câu 1 đến câu ${part4.length}.`
            );
            currentRoman++;

            part4.forEach((q, pIdx) => {
                const qNum = pIdx + 1;
                const cccdTag = (includeCccd && (q.cccd || q.bankId || q.id)) ? `[${q.cccd || q.bankId || q.id}] ` : '';
                const qContent = cleanHtmlToWordText(q.content);

                bodyXml += `
                <w:p>
                  <w:pPr>
                    <w:ind w:left="992" w:hanging="992"/>
                    <w:spacing w:before="100" w:after="40" w:line="276" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                    <w:t xml:space="preserve">${escapeXml(cccdTag)}Câu ${qNum}. </w:t>
                  </w:r>
                  ${renderRunsToXml(parseRunsFromText(qContent), imageMap)}
                </w:p>`;

                if (q.image && imageMap[q.image]) {
                    const imgInfo = imageMap[q.image];
                    bodyXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>${buildDrawingXml(imgInfo.id, imgInfo.rId, imgInfo.cx, imgInfo.cy)}</w:p>`;
                }

                // Dòng kẻ chấm cho tự luận trong đề bài
                if (mode === 'questions' && includeDottedLines) {
                    bodyXml += `<w:p><w:pPr><w:ind w:left="992"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:color w:val="555555"/></w:rPr><w:t>Bài làm của thí sinh:</w:t></w:r></w:p>`;
                    bodyXml += buildDottedLinesXml(dottedLinesCount);
                }

                if (mode === 'full' && (q.solution || q.explain)) {
                    const solText = cleanHtmlToWordText(q.solution || q.explain);
                    bodyXml += `
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:before="60" w:after="40"/><w:jc w:val="both"/></w:pPr>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:i/><w:color w:val="1E40AF"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Lời giải chi tiết:</w:t></w:r>
                    </w:p>
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>
                      ${renderRunsToXml(parseRunsFromText(solText), imageMap)}
                    </w:p>`;
                }
            });
        }

        // ================= BẢNG ĐÁP ÁN TỔNG HỢP Ở CUỐI =================
        if (includeAnswerTable && (part1.length > 0 || part2.length > 0 || part3.length > 0)) {
            bodyXml += `
            <w:p>
              <w:pPr><w:spacing w:before="360" w:after="100"/><w:jc w:val="center"/></w:pPr>
              <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="1E40AF"/></w:rPr><w:t>BẢNG ĐÁP ÁN TỔNG HỢP</w:t></w:r>
            </w:p>`;

            // Bảng đáp án Phần I (mỗi hàng 10 câu)
            if (part1.length > 0) {
                const totalP1 = part1.length;
                const colsPerRow = 10;
                const rowsCount = Math.ceil(totalP1 / colsPerRow);

                bodyXml += `
                <w:p><w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Phần I: Trắc nghiệm 4 phương án</w:t></w:r></w:p>
                <w:tbl>
                  <w:tblPr>
                    <w:tblW w:w="10773" w:type="dxa"/>
                    <w:jc w:val="center"/>
                    <w:tblBorders>
                      <w:top w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/>
                      <w:left w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/>
                      <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/>
                      <w:right w:val="single" w:sz="6" w:space="0" w:color="CCCCCC"/>
                      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>
                      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>
                    </w:tblBorders>
                  </w:tblPr>
                  <w:tblGrid>
                    ${Array.from({ length: colsPerRow }).map(() => '<w:gridCol w:w="1077"/>').join('')}
                  </w:tblGrid>`;

                for (let r = 0; r < rowsCount; r++) {
                    // Header row: Câu 1, Câu 2...
                    bodyXml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>`;
                    for (let c = 0; c < colsPerRow; c++) {
                        const qIdx = r * colsPerRow + c;
                        const label = qIdx < totalP1 ? `Câu ${qIdx + 1}` : '';
                        bodyXml += `<w:tc><w:tcPr><w:tcW w:w="1077" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>${label}</w:t></w:r></w:p></w:tc>`;
                    }
                    bodyXml += `</w:tr>`;

                    // Answer row: A, B, C...
                    bodyXml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>`;
                    for (let c = 0; c < colsPerRow; c++) {
                        const qIdx = r * colsPerRow + c;
                        let ansChar = '';
                        if (qIdx < totalP1) {
                            const q = part1[qIdx];
                            const correctIdx = typeof q.correct === 'number' ? q.correct : (q.correctAnswer ? ['A','B','C','D'].indexOf(String(q.correctAnswer).trim().toUpperCase()) : -1);
                            ansChar = correctIdx >= 0 ? ['A','B','C','D'][correctIdx] : '';
                        }
                        bodyXml += `<w:tc><w:tcPr><w:tcW w:w="1077" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1E40AF"/><w:sz w:val="24"/></w:rPr><w:t>${ansChar}</w:t></w:r></w:p></w:tc>`;
                    }
                    bodyXml += `</w:tr>`;
                }
                bodyXml += `</w:tbl>`;
            }

            // Đáp án Phần II (Đúng/Sai)
            if (part2.length > 0) {
                bodyXml += `<w:p><w:pPr><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Phần II: Đáp án Đúng/Sai</w:t></w:r></w:p>`;
                bodyXml += `
                <w:tbl>
                  <w:tblPr>
                    <w:tblW w:w="10773" w:type="dxa"/>
                    <w:jc w:val="center"/>
                    <w:tblBorders>
                      <w:top w:val="single" w:sz="6" w:color="CCCCCC"/>
                      <w:left w:val="single" w:sz="6" w:color="CCCCCC"/>
                      <w:bottom w:val="single" w:sz="6" w:color="CCCCCC"/>
                      <w:right w:val="single" w:sz="6" w:color="CCCCCC"/>
                      <w:insideH w:val="single" w:sz="4" w:color="E5E7EB"/>
                      <w:insideV w:val="single" w:sz="4" w:color="E5E7EB"/>
                    </w:tblBorders>
                  </w:tblPr>
                  <w:tblGrid>
                    <w:gridCol w:w="2154"/>
                    <w:gridCol w:w="2154"/>
                    <w:gridCol w:w="2155"/>
                    <w:gridCol w:w="2155"/>
                    <w:gridCol w:w="2155"/>
                  </w:tblGrid>
                  <w:tr>
                    <w:tc><w:tcPr><w:tcW w:w="2154"/><w:shd w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Câu</w:t></w:r></w:p></w:tc>
                    <w:tc><w:tcPr><w:tcW w:w="2154"/><w:shd w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Ý a)</w:t></w:r></w:p></w:tc>
                    <w:tc><w:tcPr><w:tcW w:w="2155"/><w:shd w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Ý b)</w:t></w:r></w:p></w:tc>
                    <w:tc><w:tcPr><w:tcW w:w="2155"/><w:shd w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Ý c)</w:t></w:r></w:p></w:tc>
                    <w:tc><w:tcPr><w:tcW w:w="2155"/><w:shd w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Ý d)</w:t></w:r></w:p></w:tc>
                  </w:tr>`;

                part2.forEach((q, pIdx) => {
                    const statements = Array.isArray(q.statements) ? q.statements : [];
                    bodyXml += `<w:tr><w:tc><w:tcPr><w:tcW w:w="2154"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Câu ${pIdx + 1}</w:t></w:r></w:p></w:tc>`;
                    for (let sIdx = 0; sIdx < 4; sIdx++) {
                        const st = statements[sIdx];
                        let val = '-';
                        if (st) {
                            const isTrue = typeof st === 'object' ? (st.correct === true || st.isCorrect === true || st.answer === 'Đ' || st.answer === true) : false;
                            val = isTrue ? 'Đ' : 'S';
                        }
                        const col = val === 'Đ' ? '059669' : (val === 'S' ? 'DC2626' : '666666');
                        bodyXml += `<w:tc><w:tcPr><w:tcW w:w="2155"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${col}"/><w:sz w:val="22"/></w:rPr><w:t>${val}</w:t></w:r></w:p></w:tc>`;
                    }
                    bodyXml += `</w:tr>`;
                });
                bodyXml += `</w:tbl>`;
            }

            // Đáp án Phần III (Trả lời ngắn)
            if (part3.length > 0) {
                bodyXml += `<w:p><w:pPr><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Phần III: Đáp số câu hỏi trả lời ngắn</w:t></w:r></w:p>`;
                bodyXml += `
                <w:tbl>
                  <w:tblPr>
                    <w:tblW w:w="10773" w:type="dxa"/>
                    <w:jc w:val="center"/>
                    <w:tblBorders>
                      <w:top w:val="single" w:sz="6" w:color="CCCCCC"/>
                      <w:left w:val="single" w:sz="6" w:color="CCCCCC"/>
                      <w:bottom w:val="single" w:sz="6" w:color="CCCCCC"/>
                      <w:right w:val="single" w:sz="6" w:color="CCCCCC"/>
                      <w:insideH w:val="single" w:sz="4" w:color="E5E7EB"/>
                      <w:insideV w:val="single" w:sz="4" w:color="E5E7EB"/>
                    </w:tblBorders>
                  </w:tblPr>
                  <w:tblGrid>
                    <w:gridCol w:w="3000"/>
                    <w:gridCol w:w="7773"/>
                  </w:tblGrid>
                  <w:tr>
                    <w:tc><w:tcPr><w:tcW w:w="3000"/><w:shd w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Câu</w:t></w:r></w:p></w:tc>
                    <w:tc><w:tcPr><w:tcW w:w="7773"/><w:shd w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Đáp số</w:t></w:r></w:p></w:tc>
                  </w:tr>`;
                part3.forEach((q, pIdx) => {
                    const ans = q.answer || q.shortAnswer || q.correctAnswer || '';
                    bodyXml += `
                    <w:tr>
                      <w:tc><w:tcPr><w:tcW w:w="3000"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Câu ${pIdx + 1}</w:t></w:r></w:p></w:tc>
                      <w:tc><w:tcPr><w:tcW w:w="7773"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="059669"/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(ans)}</w:t></w:r></w:p></w:tc>
                    </w:tr>`;
                });
                bodyXml += `</w:tbl>`;
            }
        }

        // FOOTER TÀI LIỆU
        bodyXml += `
        <w:p>
          <w:pPr><w:spacing w:before="360" w:after="120"/><w:jc w:val="center"/></w:pPr>
          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="666666"/></w:rPr><w:t>---------- HẾT ----------</w:t></w:r>
        </w:p>`;

        // SECTION PROPERTIES: Khổ A4 (11906 x 16838 twips)
        // Căn lề chuẩn BTN Group: Trái 2.0cm (1134 twips), Phải 1.0cm (567 twips), Trên 1.0cm (567 twips), Dưới 1.0cm (567 twips)
        const sectPr = `
        <w:sectPr>
          <w:pgSz w:w="11906" w:h="16838"/>
          <w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/>
          <w:cols w:space="720"/>
          <w:docGrid w:linePitch="360"/>
        </w:sectPr>`;

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml}
    ${sectPr}
  </w:body>
</w:document>`;
    }

    // ==========================================
    // 6. TIỀN XỬ LÝ HÌNH ẢNH TRONG ĐỀ THI
    // ==========================================
    async function collectAndPrepareImages(questions, zip) {
        const imageMap = {};
        let imgCounter = 0;

        const scanTextForImages = (text) => {
            if (!text) return [];
            const matches = [];
            const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
            let m;
            while ((m = imgRegex.exec(text)) !== null) {
                matches.push(m[1]);
            }
            const texImgRegex = /\\includegraphics(?:\[.*?\])?\{([^}]+)\}/gi;
            while ((m = texImgRegex.exec(text)) !== null) {
                matches.push(m[1]);
            }
            return matches;
        };

        const allSources = [];
        (questions || []).forEach(q => {
            if (q.image) allSources.push(q.image);
            if (Array.isArray(q.images)) allSources.push(...q.images);
            allSources.push(...scanTextForImages(q.content));
            allSources.push(...scanTextForImages(q.solution || q.explain));
            (q.options || []).forEach(opt => {
                const optText = typeof opt === 'object' ? (opt.text || '') : opt;
                allSources.push(...scanTextForImages(optText));
            });
            (q.statements || []).forEach(st => {
                const stText = typeof st === 'object' ? (st.content || st.text || '') : st;
                allSources.push(...scanTextForImages(stText));
            });
        });

        const uniqueSources = Array.from(new Set(allSources.filter(Boolean)));

        for (const src of uniqueSources) {
            try {
                imgCounter++;
                const imgId = imgCounter;
                const rId = `rIdImg_${imgId}`;
                let bytes = null;

                if (src.startsWith('data:image')) {
                    const base64 = src.split(',')[1];
                    const binStr = atob(base64);
                    const arr = new Uint8Array(binStr.length);
                    for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i);
                    bytes = arr;
                } else if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) {
                    const resp = await fetch(src, { mode: 'cors' });
                    if (resp.ok) {
                        const blob = await resp.blob();
                        bytes = new Uint8Array(await blob.arrayBuffer());
                    }
                }

                if (bytes) {
                    zip.file(`word/media/image_${imgId}.png`, bytes);
                    imageMap[src] = {
                        id: imgId,
                        rId: rId,
                        cx: 2520000, // ~7.0 cm chuẩn trang Word
                        cy: 1800000  // ~5.0 cm
                    };
                }
            } catch (err) {
                console.warn('Không thể nạp hình ảnh:', src, err);
            }
        }

        return imageMap;
    }

    // ==========================================
    // 7. TẠO FILE DOCX BLOB HOÀN CHỈNH
    // ==========================================
    async function createDocxBlob({ title, questions, mode = 'questions', options = {} }) {
        if (typeof JSZip === 'undefined') {
            throw new Error('Thư viện JSZip chưa được tải!');
        }

        const zip = new JSZip();

        // 1. Nạp và xử lý toàn bộ hình ảnh
        const imageMap = await collectAndPrepareImages(questions, zip);

        // 2. [Content_Types].xml
        zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
</Types>`);

        // 3. _rels/.rels
        zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

        // 4. word/_rels/document.xml.rels
        let relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rIdFontTable" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>`;

        Object.values(imageMap).forEach(img => {
            relsXml += `\n  <Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image_${img.id}.png"/>`;
        });
        relsXml += `\n</Relationships>`;
        zip.file('word/_rels/document.xml.rels', relsXml);

        // 5. word/styles.xml
        zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="vi-VN"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:line="276" w:lineRule="auto" w:after="0"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`);

        // 6. word/settings.xml
        zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <m:mathPr>
    <m:mathFont m:val="Cambria Math"/>
    <m:brkBin m:val="before"/>
    <m:brkBinSub m:val="--"/>
    <m:smallFrac m:val="0"/>
    <m:dispDef/>
    <m:lMargin m:val="0"/>
    <m:rMargin m:val="0"/>
    <m:defJc m:val="center"/>
    <m:wrapIndent m:val="1440"/>
    <m:intLim m:val="subSup"/>
    <m:naryLim m:val="undOvr"/>
  </m:mathPr>
</w:settings>`);

        // 7. word/fontTable.xml
        zip.file('word/fontTable.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fontTable xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Times New Roman"/>
  <w:font w:name="Cambria Math"/>
</w:fontTable>`);

        // 8. word/document.xml
        const docXml = buildDocumentXml({ title, questions, mode, options, imageMap });
        zip.file('word/document.xml', docXml);

        return await zip.generateAsync({ type: 'blob' });
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function sanitizeFilename(name) {
        return (name || 'De_Thi')
            .replace(/[/\\?%*:|"<>]/g, '_')
            .replace(/\s+/g, '_')
            .trim();
    }

    // ==========================================
    // 8. HÀM XUẤT ĐỀ THI RA FILE WORD
    // ==========================================
    async function exportExamToWord(exam, customOptions = {}) {
        if (!exam) throw new Error('Không có dữ liệu đề thi');
        const questions = exam.questions || [];
        const baseName = sanitizeFilename(exam.title || 'De_Thi');
        const mode = customOptions.mode || 'questions';

        if (mode === 'both') {
            const blobQ = await createDocxBlob({
                title: exam.title || 'Đề thi',
                questions: questions,
                mode: 'questions',
                options: customOptions
            });
            triggerDownload(blobQ, `${baseName}_De_Bai.docx`);

            await new Promise(r => setTimeout(r, 600));

            const blobF = await createDocxBlob({
                title: exam.title || 'Đề thi',
                questions: questions,
                mode: 'full',
                options: customOptions
            });
            triggerDownload(blobF, `${baseName}_De_Va_Loi_Giai.docx`);
        } else if (mode === 'full') {
            const blob = await createDocxBlob({
                title: exam.title || 'Đề thi',
                questions: questions,
                mode: 'full',
                options: customOptions
            });
            triggerDownload(blob, `${baseName}_De_Va_Loi_Giai.docx`);
        } else {
            const blob = await createDocxBlob({
                title: exam.title || 'Đề thi',
                questions: questions,
                mode: 'questions',
                options: customOptions
            });
            triggerDownload(blob, `${baseName}_De_Bai.docx`);
        }
    }

    // ==========================================
    // 9. GIAO DIỆN MODAL TÙY CHỌN XUẤT WORD
    // ==========================================
    function openExportWordModal(examOrId, preloadedQuestions = null) {
        let modal = document.getElementById('exportWordModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'exportWordModal';
            modal.className = 'fixed inset-0 z-[160] bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 transition-opacity';
            modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-xl w-full p-4 sm:p-6 border border-gray-100 dark:border-gray-700 max-h-[92vh] flex flex-col">
                <!-- Header Modal -->
                <div class="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
                    <div class="flex items-center gap-2.5">
                        <span class="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg">
                            <i class="fa-solid fa-file-word"></i>
                        </span>
                        <div>
                            <h3 class="font-bold text-gray-800 dark:text-gray-100 text-sm sm:text-base">Xuất Word MathType (Chuẩn BTPRO)</h3>
                            <p class="text-[11px] text-gray-400">Công thức MathType / OMML, Căn lề chuẩn A4, Hỗ trợ hình ảnh & Dòng kẻ chấm</p>
                        </div>
                    </div>
                    <button type="button" onclick="window.closeExportWordModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg text-lg">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Body Modal (Scrollable) -->
                <div class="py-3.5 space-y-4 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                    
                    <!-- 1. Chế độ xuất file -->
                    <div>
                        <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">1. Chế độ xuất file</label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <label class="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 cursor-pointer transition">
                                <input type="radio" name="exportWordMode" value="questions" checked class="text-blue-600 focus:ring-blue-500">
                                <div>
                                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">📝 Chỉ Đề bài</p>
                                    <p class="text-[10px] text-gray-400">Cho học sinh làm</p>
                                </div>
                            </label>
                            <label class="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 cursor-pointer transition">
                                <input type="radio" name="exportWordMode" value="full" class="text-blue-600 focus:ring-blue-500">
                                <div>
                                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">📘 Có lời giải</p>
                                    <p class="text-[10px] text-gray-400">Gạch chân ĐA đúng</p>
                                </div>
                            </label>
                            <label class="flex items-center gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 cursor-pointer transition">
                                <input type="radio" name="exportWordMode" value="both" class="text-blue-600 focus:ring-blue-500">
                                <div>
                                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">📦 Xuất cả 2 bản</p>
                                    <p class="text-[10px] text-gray-400">Tải cả 2 file</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- 2. Tùy chọn Mẫu Tiêu đề (Header) -->
                    <div class="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                        <div class="flex items-center justify-between">
                            <label class="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                <i class="fa-solid fa-heading text-blue-600"></i> 2. Mẫu tiêu đề đề thi (Header)
                            </label>
                            <select id="exportWordHeaderStyle" class="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none cursor-pointer">
                                <option value="standard_gov" selected>🏛️ Mẫu 1: Chuẩn Trường học / Bộ GD (2 cột)</option>
                                <option value="brand_center">⭐ Mẫu 2: Trung tâm / QMath (Trang trọng)</option>
                                <option value="compact">📄 Mẫu 3: Tiêu đề Rút gọn (Đơn giản)</option>
                                <option value="none">🚫 Mẫu 4: Không tiêu đề (Bắt đầu từ Câu 1)</option>
                            </select>
                        </div>

                        <!-- Các trường thông tin cho phép chỉnh sửa -->
                        <div id="exportWordHeaderFieldsArea" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-gray-200 dark:border-gray-700">
                            <div>
                                <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Tên trường / Sở / Đơn vị</label>
                                <input type="text" id="exportWordSchoolName" value="SỞ GD&ĐT HÀ NỘI / TRƯỜNG THPT" class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                            </div>
                            <div>
                                <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Tên kỳ thi / Phụ đề</label>
                                <input type="text" id="exportWordExamSubtitle" value="ĐỀ KHẢO SÁT CHẤT LƯỢNG HỌC KỲ" class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                            </div>
                            <div>
                                <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Tên đề thi</label>
                                <input type="text" id="exportWordTitleInput" class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                            </div>
                            <div class="grid grid-cols-3 gap-1.5">
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Môn thi</label>
                                    <input type="text" id="exportWordSubject" value="Toán" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Khối</label>
                                    <input type="text" id="exportWordGrade" value="12" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Mã đề</label>
                                    <input type="text" id="exportWordExamCode" value="101" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                                </div>
                            </div>
                            <div class="sm:col-span-2 flex items-center justify-between pt-1">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="exportWordCandidateInfo" checked class="rounded text-blue-600 focus:ring-blue-500">
                                    <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">Khung thông tin học sinh (Họ tên, SBD, Lớp)</span>
                                </label>
                                <div class="flex items-center gap-1.5">
                                    <span class="text-[11px] text-gray-500">Thời gian:</span>
                                    <input type="number" id="exportWordDuration" value="90" class="w-16 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-center font-bold">
                                    <span class="text-[11px] text-gray-500">phút</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 3. Tùy chọn Dòng kẻ chấm (Dotted Lines) -->
                    <div class="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/80 dark:border-amber-900/50 space-y-2.5">
                        <div class="flex items-center justify-between">
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" id="exportWordIncludeDottedLines" class="rounded text-amber-600 focus:ring-amber-500">
                                <span class="text-xs font-bold text-amber-900 dark:text-amber-200">
                                    ✍️ 3. Thêm dòng kẻ chấm để học sinh làm bài / nháp trên đề
                                </span>
                            </label>
                        </div>
                        <div id="exportWordDottedOptions" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-gray-700 dark:text-gray-300">Số dòng chấm mỗi câu:</span>
                                <input type="number" id="exportWordDottedCount" value="4" min="1" max="25" class="w-16 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 font-bold text-center">
                            </div>
                            <div>
                                <select id="exportWordDottedScope" class="w-full text-xs px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none">
                                    <option value="essay_short" selected>Chỉ câu Trả lời ngắn & Tự luận (Khuyên dùng)</option>
                                    <option value="all">Tất cả các câu hỏi</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- 4. Tùy chọn bổ sung khác -->
                    <div class="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-700">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="exportWordIncludeAnswerTable" checked class="rounded text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">Bổ sung Bảng đáp án tổng hợp ở cuối tài liệu</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" id="exportWordIncludeCccd" class="rounded text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">Hiển thị mã định danh CCCD / ID câu hỏi</span>
                        </label>
                    </div>

                    <!-- Lời khuyên MathType -->
                    <div class="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900/50 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                        <i class="fa-solid fa-circle-check mt-0.5 text-blue-600"></i>
                        <span>Mọi công thức toán đều hiển thị trực quan trong Word. Nếu có cài MathType, bạn có thể bấm <b>Alt+\\</b> hoặc chọn MathType ➔ Convert Equations để chuyển thành MathType OLE bất cứ lúc nào!</span>
                    </div>
                </div>

                <!-- Footer Modal -->
                <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-700 shrink-0">
                    <button type="button" onclick="window.closeExportWordModal()" class="px-3.5 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition cursor-pointer">Hủy</button>
                    <button type="button" id="btnConfirmExportWord" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer">
                        <i class="fa-solid fa-download"></i> Tải file Word (.docx)
                    </button>
                </div>
            </div>`;
            document.body.appendChild(modal);

            // Xử lý ẩn hiện ô dòng kẻ chấm
            const dottedCheck = document.getElementById('exportWordIncludeDottedLines');
            const dottedArea = document.getElementById('exportWordDottedOptions');
            if (dottedCheck && dottedArea) {
                dottedCheck.onchange = () => {
                    if (dottedCheck.checked) dottedArea.classList.remove('hidden');
                    else dottedArea.classList.add('hidden');
                };
            }

            // Xử lý ẩn hiện ô Header fields khi chọn "none"
            const headerSelect = document.getElementById('exportWordHeaderStyle');
            const headerFields = document.getElementById('exportWordHeaderFieldsArea');
            if (headerSelect && headerFields) {
                headerSelect.onchange = () => {
                    if (headerSelect.value === 'none') headerFields.classList.add('hidden');
                    else headerFields.classList.remove('hidden');
                };
            }
        }

        // Tìm nạp dữ liệu đề thi
        let examObj = typeof examOrId === 'object' ? examOrId : null;
        if (!examObj && typeof examData !== 'undefined' && Array.isArray(examData)) {
            examObj = examData.find(e => e.id === examOrId);
        }
        if (!examObj && window.currentExamData) {
            examObj = window.currentExamData;
        }

        const titleInput = document.getElementById('exportWordTitleInput');
        if (titleInput) {
            titleInput.value = examObj ? (examObj.title || 'Đề thi') : 'Đề thi';
        }
        const schoolInput = document.getElementById('exportWordSchoolName');
        if (schoolInput && examObj && examObj.schoolName) {
            schoolInput.value = examObj.schoolName;
        }
        const subjectInput = document.getElementById('exportWordSubject');
        if (subjectInput && examObj && examObj.subject) {
            subjectInput.value = examObj.subject;
        }
        const gradeInput = document.getElementById('exportWordGrade');
        if (gradeInput && examObj && examObj.grade) {
            gradeInput.value = examObj.grade;
        }
        const durInput = document.getElementById('exportWordDuration');
        if (durInput && examObj && examObj.duration) {
            durInput.value = examObj.duration;
        }
        const codeInput = document.getElementById('exportWordExamCode');
        if (codeInput && examObj && examObj.examCode) {
            codeInput.value = examObj.examCode;
        }

        const btnConfirm = document.getElementById('btnConfirmExportWord');
        if (btnConfirm) {
            btnConfirm.onclick = async () => {
                try {
                    btnConfirm.disabled = true;
                    btnConfirm.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang tạo file Word...';

                    let fullExam = examObj;
                    if ((!fullExam || !Array.isArray(fullExam.questions) || fullExam.questions.length === 0) && typeof fetchFullExamDoc === 'function' && typeof examOrId === 'string') {
                        fullExam = await fetchFullExamDoc(examOrId);
                    }
                    if (preloadedQuestions && Array.isArray(preloadedQuestions)) {
                        fullExam = fullExam ? { ...fullExam, questions: preloadedQuestions } : { title: titleInput.value, questions: preloadedQuestions };
                    }
                    if (!fullExam && typeof window.questions !== 'undefined' && Array.isArray(window.questions)) {
                        fullExam = {
                            title: titleInput.value || (document.getElementById('examTitle') ? document.getElementById('examTitle').value : 'Đề thi'),
                            questions: window.questions
                        };
                    }

                    if (!fullExam || !Array.isArray(fullExam.questions) || fullExam.questions.length === 0) {
                        alert('Không tìm thấy danh sách câu hỏi của đề thi!');
                        return;
                    }

                    const selectedMode = document.querySelector('input[name="exportWordMode"]:checked')?.value || 'questions';
                    const hStyle = document.getElementById('exportWordHeaderStyle')?.value || 'standard_gov';
                    const sName = document.getElementById('exportWordSchoolName')?.value || 'SỞ GD&ĐT HÀ NỘI / TRƯỜNG THPT';
                    const eSub = document.getElementById('exportWordExamSubtitle')?.value || 'ĐỀ KHẢO SÁT CHẤT LƯỢNG HỌC KỲ';
                    const eTitle = document.getElementById('exportWordTitleInput')?.value || fullExam.title || 'Đề thi';
                    const subj = document.getElementById('exportWordSubject')?.value || 'Toán học';
                    const grd = document.getElementById('exportWordGrade')?.value || '12';
                    const dur = parseInt(document.getElementById('exportWordDuration')?.value || 90);
                    const code = document.getElementById('exportWordExamCode')?.value || '101';
                    const cInfo = document.getElementById('exportWordCandidateInfo')?.checked !== false;

                    const hasDotted = document.getElementById('exportWordIncludeDottedLines')?.checked === true;
                    const dotCount = parseInt(document.getElementById('exportWordDottedCount')?.value || 4);
                    const dotScope = document.getElementById('exportWordDottedScope')?.value || 'essay_short';

                    const incTable = document.getElementById('exportWordIncludeAnswerTable')?.checked !== false;
                    const incCccd = document.getElementById('exportWordIncludeCccd')?.checked === true;

                    await exportExamToWord(fullExam, {
                        mode: selectedMode,
                        headerStyle: hStyle,
                        schoolName: sName,
                        examSubtitle: eSub,
                        examTitle: eTitle,
                        subject: subj,
                        grade: grd,
                        duration: dur,
                        examCode: code,
                        includeCandidateInfo: cInfo,
                        includeDottedLines: hasDotted,
                        dottedLinesCount: dotCount,
                        dottedLinesScope: dotScope,
                        includeAnswerTable: incTable,
                        includeCccd: incCccd
                    });

                    if (window.showToast) window.showToast('Xuất file Word MathType thành công!', 'success');
                    else if (window.showNotification) window.showNotification('Xuất file Word MathType thành công!', 'success');
                    window.closeExportWordModal();
                } catch (err) {
                    console.error('Lỗi xuất Word MathType:', err);
                    alert('Lỗi xuất file Word: ' + err.message);
                } finally {
                    btnConfirm.disabled = false;
                    btnConfirm.innerHTML = '<i class="fa-solid fa-download"></i> Tải file Word (.docx)';
                }
            };
        }

        modal.classList.remove('hidden');
    }

    function closeExportWordModal() {
        const modal = document.getElementById('exportWordModal');
        if (modal) modal.classList.add('hidden');
    }

    // Xuất nhanh đề thi hiện tại trong trang soạn đề / xem in
    window.exportCurrentExamToWord = function() {
        let currentExam = window.examData || window.currentExamData || null;
        if (!currentExam && typeof window.questions !== 'undefined') {
            const titleEl = document.getElementById('examTitle') || document.getElementById('toolbarTitle');
            currentExam = {
                title: titleEl ? (titleEl.value || titleEl.textContent || 'Đề thi') : 'Đề thi',
                questions: window.questions || window.allQuestions || []
            };
        }
        if (currentExam) {
            openExportWordModal(currentExam, currentExam.questions || window.allQuestions);
        } else {
            alert('Không tìm thấy dữ liệu đề thi hiện tại!');
        }
    };

    // Xuất hàng loạt đề thi sang Word (từng file trong 1 zip)
    window.bulkExportExamsToWord = async function() {
        const selectedIds = Array.from(window.selectedExamIds || []);
        if (selectedIds.length === 0) {
            if (window.showNotification) window.showNotification('Vui lòng tích chọn ít nhất 1 đề thi!', 'warning');
            else alert('Vui lòng tích chọn ít nhất 1 đề thi!');
            return;
        }

        const confirmOk = confirm(`Bạn có chắc muốn xuất ${selectedIds.length} đề thi đã chọn sang Word MathType (.docx)?`);
        if (!confirmOk) return;

        try {
            if (typeof window.showNotification === 'function') {
                window.showNotification(`Đang chuẩn bị xuất ${selectedIds.length} file Word...`, 'info');
            }
            const zip = new JSZip();

            for (let i = 0; i < selectedIds.length; i++) {
                const examId = selectedIds[i];
                let fullDoc = typeof fetchFullExamDoc === 'function' ? await fetchFullExamDoc(examId) : (window.examData || []).find(e => e.id === examId);
                if (fullDoc && Array.isArray(fullDoc.questions) && fullDoc.questions.length > 0) {
                    const blob = await createDocxBlob({
                        title: fullDoc.title || `De_${i+1}`,
                        questions: fullDoc.questions,
                        mode: 'questions',
                        options: {
                            headerStyle: 'standard_gov',
                            schoolName: 'HỆ THỐNG GIÁO DỤC QMATH',
                            duration: fullDoc.duration || 90,
                            includeAnswerTable: true
                        }
                    });
                    const baseName = sanitizeFilename(fullDoc.title || `De_${i+1}`);
                    zip.file(`${baseName}_De_Bai.docx`, blob);
                }
            }

            const finalZip = await zip.generateAsync({ type: 'blob' });
            triggerDownload(finalZip, `Danh_Sach_${selectedIds.length}_De_Thi_Word.zip`);
            if (typeof window.showNotification === 'function') {
                window.showNotification(`Đã xuất thành công ${selectedIds.length} đề thi!`, 'success');
            }
        } catch (err) {
            console.error('Lỗi xuất hàng loạt Word:', err);
            alert('Lỗi xuất hàng loạt Word: ' + err.message);
        }
    };

    // Xuất các API ra window
    window.WordMathTypeExporter = {
        parseLatexToOmml,
        createDocxBlob,
        exportExamToWord,
        openExportWordModal,
        closeExportWordModal
    };

    window.openExportWordModal = openExportWordModal;
    window.closeExportWordModal = closeExportWordModal;
    window.exportExamToWord = exportExamToWord;

})(typeof window !== 'undefined' ? window : this);
