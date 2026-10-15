/**
 * word-mathtype-exporter.js
 * Module xuất đề thi sang Microsoft Word (.docx) chuẩn MathType OLE / OpenXML Equation
 * Theo tiêu chuẩn BTN Group / Bộ Giáo dục & Đào tạo (BTPRO)
 * Tác giả: Thầy Choang Choang (Phạm Đình Quang) - https://www.qmath.io.vn
 *
 * Tính năng chính:
 * 1. Chuyển đổi 100% công thức LaTeX sang MathType OLE (Equation.DSMT4) chuẩn BTPRO hoặc OpenXML Math (<m:oMath>).
 *    Nhúng trực tiếp OLE Compound File (embeddings/oleObject.bin) và WMF preview (media/image.wmf) tương thích
 *    tuyệt đối với MathType 6.x/7.x trên PC & mobile mà không cần chạy Python server!
 * 2. Tự động nhận diện và chuyển đổi bảng LaTeX (\begin{tabular} ... \end{tabular}) sang bảng Word (<w:tbl>)
 *    có kẻ viền, căn giữa, định dạng ô chuẩn sư phạm.
 * 3. Chuẩn hóa số thập phân tiếng Việt (chuyển 2{,}35 thành 2,35) và đơn vị đo lường.
 * 4. Tự động trích xuất và nhúng hình ảnh (PNG, JPG, base64, ảnh URL, TikZ render) trực tiếp vào file Word.
 * 5. Mẫu tiêu đề chuẩn Sở GD&ĐT / Bộ GD&ĐT 2 cột (Left: Sở/Trường/Loại đề/Số câu, Right: Tên đề/Môn-Khối/Thời gian-Mã đề)
 *    kèm khung Họ tên học sinh và ô Phách. Cho phép chỉnh sửa 100% các trường thông tin.
 * 6. Tùy chọn chèn dòng kẻ chấm (Dotted Lines) với số dòng tùy ý (1-30 dòng) cho học sinh làm bài / nháp trên đề.
 * 7. Chuẩn hóa bố cục BTPRO: Căn lề A4 2.0-1.0-1.0-1.0 cm, Font Times New Roman 12pt, thụt lề treo 1.75cm,
 *    tự động chia 4 cột, 2 cột hoặc 1 dòng cho phương án A, B, C, D.
 * 8. Hỗ trợ đầy đủ 4 phần thi theo cấu trúc đề mới của Bộ GD&ĐT: Phần I (4 lựa chọn), Phần II (Đúng/Sai), Phần III (Trả lời ngắn), Phần IV (Tự luận).
 */

(function(window) {
    'use strict';

    // ==========================================
    // 1. TIỆN ÍCH MÃ HÓA XML & HẰNG SỐ OLE/WMF
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

    // Base64 các sector mẫu của OLE Compound Document (MathType 7 Equation.DSMT4)
    const OLE_HEADER_B64 = "0M8R4KGxGuEAAAAAAAAAAAAAAAAAAAAAPgADAP7/CQAGAAAAAAAAAAAAAAABAAAAAQAAAAAAAAAAEAAAAgAAAAEAAAD+////AAAAAAAAAAD///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////8=";
    const DIR_SEC1_B64 = "UgBvAG8AdAAgAEUAbgB0AHIAeQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABYABQD//////////wIAAAADzgIAAAAAAMAAAAAAAABGAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAwAEAAAAAAAABAE8AbABlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgACAf///////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAAAAAAAEAQwBvAG0AcABPAGIAagAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASAAIBAQAAAAMAAAD/////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAGkAAAAAAAAAAwBPAGIAagBJAG4AZgBvAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABIAAgH/////BAAAAP////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAABgAAAAAAAAA=";
    const MINISTREAM_PREFIX_B64 = "AQAAAggAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEA/v8DCgAA/////wPOAgAAAAAAwAAAAAAAAEYWAAAATWF0aFR5cGUgNy4wIEVxdWF0aW9uAAwAAABNYXRoVHlwZSBFRgAPAAAARXF1YXRpb24uRFNNVDQA9DmycQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
    const DIR_SEC4_B64 = "RQBxAHUAYQB0AGkAbwBuACAATgBhAHQAaQB2AGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAgD///////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAhgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    // Header 86 byte chuẩn MTEF v5 (MathType 7 DSMT7)
    const MTEF_HEADER_HEX = "050100070444534d543700011357696e416c6c4261736963436f6465506167657300110554696d6573204e657720526f6d616e00110353796d626f6c001105436f7572696572204e65770011044d5420457874726100";

    function base64ToUint8Array(base64) {
        const binStr = atob(base64);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binStr.charCodeAt(i);
        }
        return bytes;
    }

    function hexToUint8Array(hex) {
        const len = hex.length / 2;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
    }

    const MTEF_HEADER_BYTES = hexToUint8Array(MTEF_HEADER_HEX);

    const KNOWN_MATH_FUNCS = new Set([
        'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'arccot',
        'sinh', 'cosh', 'tanh', 'coth', 'ln', 'log', 'lg', 'exp', 'lim', 'min', 'max',
        'sup', 'inf', 'gcd', 'lcm', 'det', 'deg', 'dim', 'ker', 'hom', 'arg', 'mod'
    ]);

    const LC_GREEK = {
        alpha: [0x03B1, 97], beta: [0x03B2, 98], gamma: [0x03B3, 103], delta: [0x03B4, 100],
        epsilon: [0x03B5, 101], varepsilon: [0x03B5, 101], zeta: [0x03B6, 122], eta: [0x03B7, 104],
        theta: [0x03B8, 113], vartheta: [0x03D1, 74], iota: [0x03B9, 105], kappa: [0x03BA, 107],
        lambda: [0x03BB, 108], mu: [0x03BC, 109], nu: [0x03BD, 110], xi: [0x03BE, 120],
        pi: [0x03C0, 112], varpi: [0x03D6, 118], rho: [0x03C1, 114], varrho: [0x03F1, 114],
        sigma: [0x03C3, 115], varsigma: [0x03C2, 86], tau: [0x03C4, 116], upsilon: [0x03C5, 117],
        phi: [0x03C6, 102], varphi: [0x03D5, 106], chi: [0x03C7, 99], psi: [0x03C8, 121], omega: [0x03C9, 119]
    };

    const UC_GREEK = {
        Gamma: [0x0393, 71], Delta: [0x0394, 68], Theta: [0x0398, 81], Lambda: [0x039B, 76],
        Xi: [0x039E, 88], Pi: [0x03A0, 80], Sigma: [0x03A3, 83], Upsilon: [0x03A5, 161],
        Phi: [0x03A6, 70], Psi: [0x03A8, 89], Omega: [0x03A9, 87]
    };

    const SYMBOL_MAP = {
        '+': [0x86, 0x002B, 43, true],
        '-': [0x86, 0x2212, 45, true],
        '=': [0x86, 0x003D, 61, true],
        '<': [0x86, 0x003C, 60, true],
        '>': [0x86, 0x003E, 62, true],
        le: [0x86, 0x2264, 163, true],
        leq: [0x86, 0x2264, 163, true],
        leqslant: [0x86, 0x2264, 163, true],
        ge: [0x86, 0x2265, 179, true],
        geq: [0x86, 0x2265, 179, true],
        geqslant: [0x86, 0x2265, 179, true],
        ne: [0x86, 0x2260, 185, true],
        neq: [0x86, 0x2260, 185, true],
        approx: [0x86, 0x2248, 187, true],
        equiv: [0x86, 0x2261, 186, true],
        sim: [0x86, 0x223C, 126, true],
        pm: [0x86, 0x00B1, 177, true],
        mp: [0x86, 0x2213, 177, true],
        cdot: [0x86, 0x22C5, 215, true],
        times: [0x86, 0x00D7, 180, true],
        div: [0x86, 0x00F7, 184, true],
        ast: [0x86, 0x2217, 42, true],
        circ: [0x86, 0x00B0, 176, false],
        degree: [0x86, 0x00B0, 176, false],
        in: [0x86, 0x2208, 206, true],
        notin: [0x86, 0x2209, 207, true],
        subset: [0x86, 0x2282, 204, true],
        subseteq: [0x86, 0x2286, 205, true],
        cup: [0x86, 0x222A, 200, true],
        cap: [0x86, 0x2229, 199, true],
        setminus: [0x86, 0x2216, 92, true],
        emptyset: [0x86, 0x2205, 198, false],
        varnothing: [0x86, 0x2205, 198, false],
        infty: [0x86, 0x221E, 165, false],
        forall: [0x86, 0x2200, 34, false],
        exists: [0x86, 0x2203, 36, false],
        perp: [0x86, 0x22A5, 94, true],
        parallel: [0x8B, 0x2225, 80, true],
        Rightarrow: [0x86, 0x21D2, 222, true],
        implies: [0x86, 0x21D2, 222, true],
        Leftarrow: [0x86, 0x21D0, 220, true],
        Leftrightarrow: [0x86, 0x21D4, 219, true],
        iff: [0x86, 0x21D4, 219, true],
        rightarrow: [0x86, 0x2192, 174, true],
        to: [0x86, 0x2192, 174, true],
        leftarrow: [0x86, 0x2190, 172, true],
        dots: [0x86, 0x2026, 188, false],
        ldots: [0x86, 0x2026, 188, false],
        cdots: [0x86, 0x2026, 188, false],
        int: [0x86, 0x222B, 242, false],
        sum: [0x86, 0x2211, 229, false],
        prod: [0x86, 0x220F, 213, false]
    };

    function packMtefChar(opt, tf, mtcode, enc) {
        if ((opt & 0x04) && enc !== undefined && enc !== null) {
            const b = new Uint8Array(6);
            const dv = new DataView(b.buffer);
            dv.setUint8(0, 2);
            dv.setUint8(1, opt);
            dv.setUint8(2, tf);
            dv.setUint16(3, mtcode, true);
            dv.setUint8(5, enc);
            return b;
        } else if ((opt & 0x10) && enc !== undefined && enc !== null) {
            const b = new Uint8Array(7);
            const dv = new DataView(b.buffer);
            dv.setUint8(0, 2);
            dv.setUint8(1, opt);
            dv.setUint8(2, tf);
            dv.setUint16(3, mtcode, true);
            dv.setUint16(5, enc, true);
            return b;
        } else {
            const b = new Uint8Array(5);
            const dv = new DataView(b.buffer);
            dv.setUint8(0, 2);
            dv.setUint8(1, opt);
            dv.setUint8(2, tf);
            dv.setUint16(3, mtcode, true);
            return b;
        }
    }

    function concatUint8Arrays(arrays) {
        let totalLen = 0;
        for (const arr of arrays) totalLen += arr.length;
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }
        return result;
    }

    // ==========================================
    // 2. BỘ PHÂN TÍCH & BIÊN DỊCH LATEX SANG MTEF V5
    // ==========================================
    class LatexMtefCompiler {
        constructor() {
            this.cache = new Map();
        }

        tokenize(s) {
            s = s.replace(/\\allowdisplaybreaks/g, '')
                 .replace(/\\displaystyle/g, '')
                 .replace(/\\textstyle/g, '')
                 .replace(/\\limits/g, '')
                 .replace(/\\nolimits/g, '');
            const tokens = [];
            let i = 0;
            const n = s.length;
            while (i < n) {
                const ch = s[i];
                if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
                    i++;
                } else if (ch === '\\') {
                    if (i + 1 < n && '{},:;! |\\'.includes(s[i + 1])) {
                        tokens.push(s.substring(i, i + 2));
                        i += 2;
                    } else {
                        let j = i + 1;
                        while (j < n && /[a-zA-Z]/.test(s[j])) j++;
                        const cmd = s.substring(i, j);
                        if (['\\text', '\\mathrm', '\\textrm', '\\textbf', '\\textit', '\\mbox'].includes(cmd)) {
                            while (j < n && (s[j] === ' ' || s[j] === '\t')) j++;
                            if (j < n && s[j] === '{') {
                                let depth = 1;
                                let k = j + 1;
                                while (k < n && depth > 0) {
                                    if (s[k] === '{') depth++;
                                    else if (s[k] === '}') depth--;
                                    k++;
                                }
                                const txtContent = s.substring(j + 1, k - 1);
                                tokens.push(`__TEXT__:${txtContent}`);
                                i = k;
                                continue;
                            }
                        }
                        tokens.push(cmd);
                        i = j;
                    }
                } else if ('{}[]()_^+-=<>,.;:/|!\''.includes(ch)) {
                    tokens.push(ch);
                    i++;
                } else {
                    tokens.push(ch);
                    i++;
                }
            }
            return tokens;
        }

        parseExpr(tokens, pos = 0, stopTokens = new Set()) {
            const nodes = [];
            const n = tokens.length;
            while (pos < n) {
                const tok = tokens[pos];
                if (stopTokens.has(tok) || tok === '}' || tok === '\\right' || tok.startsWith('\\end')) {
                    break;
                }
                const res = this.parseAtom(tokens, pos);
                const node = res.node;
                pos = res.pos;
                if (node !== null) {
                    let subAst = null;
                    let supAst = null;
                    let primes = 0;
                    while (pos < n) {
                        const ntok = tokens[pos];
                        if (ntok === '\'') {
                            primes++;
                            pos++;
                        } else if (ntok === '_') {
                            pos++;
                            const sRes = this.parseScriptArg(tokens, pos);
                            subAst = sRes.nodes;
                            pos = sRes.pos;
                        } else if (ntok === '^') {
                            pos++;
                            const sRes = this.parseScriptArg(tokens, pos);
                            supAst = sRes.nodes;
                            pos = sRes.pos;
                        } else {
                            break;
                        }
                    }
                    if (primes > 0) {
                        nodes.push(node);
                        for (let p = 0; p < primes; p++) nodes.push({ type: 'prime' });
                        if (subAst !== null || supAst !== null) {
                            nodes.push({ type: 'script', sub: subAst, sup: supAst });
                        }
                    } else if (subAst !== null || supAst !== null) {
                        if (subAst === null && supAst.length === 1 && supAst[0].type === 'sym' && supAst[0].name === 'circ') {
                            nodes.push(node);
                            nodes.push({ type: 'sym', name: 'circ' });
                        } else {
                            nodes.push(node);
                            nodes.push({ type: 'script', sub: subAst, sup: supAst });
                        }
                    } else {
                        nodes.push(node);
                    }
                }
            }
            return { nodes, pos };
        }

        parseScriptArg(tokens, pos) {
            if (pos >= tokens.length) return { nodes: [], pos };
            if (tokens[pos] === '{') {
                const res = this.parseExpr(tokens, pos + 1, new Set(['}']));
                pos = res.pos;
                if (pos < tokens.length && tokens[pos] === '}') pos++;
                return { nodes: res.nodes, pos };
            }
            const res = this.parseAtom(tokens, pos);
            return { nodes: res.node ? [res.node] : [], pos: res.pos };
        }

        parseAtom(tokens, pos) {
            if (pos >= tokens.length) return { node: null, pos };
            const tok = tokens[pos];
            pos++;

            if (tok === '{') {
                const res = this.parseExpr(tokens, pos, new Set(['}']));
                pos = res.pos;
                if (pos < tokens.length && tokens[pos] === '}') pos++;
                return { node: { type: 'group', body: res.nodes }, pos };
            }

            if (tok.startsWith('__TEXT__:')) {
                return { node: { type: 'text', text: tok.substring(9) }, pos };
            }

            if (['\\frac', '\\dfrac', '\\tfrac', '\\cfrac'].includes(tok)) {
                const nRes = this.parseScriptArg(tokens, pos);
                const dRes = this.parseScriptArg(tokens, nRes.pos);
                return { node: { type: 'frac', num: nRes.nodes, den: dRes.nodes }, pos: dRes.pos };
            }

            if (tok === '\\sqrt') {
                let deg = null;
                if (pos < tokens.length && tokens[pos] === '[') {
                    const degRes = this.parseExpr(tokens, pos + 1, new Set([']']));
                    pos = degRes.pos;
                    if (pos < tokens.length && tokens[pos] === ']') pos++;
                    deg = degRes.nodes;
                }
                const rRes = this.parseScriptArg(tokens, pos);
                return { node: { type: 'sqrt', deg, rad: rRes.nodes }, pos: rRes.pos };
            }

            if (['\\widehat', '\\hat'].includes(tok)) {
                const arg = this.parseScriptArg(tokens, pos);
                return { node: { type: 'hat', body: arg.nodes }, pos: arg.pos };
            }

            if (['\\overline', '\\bar'].includes(tok)) {
                const arg = this.parseScriptArg(tokens, pos);
                return { node: { type: 'obar', body: arg.nodes }, pos: arg.pos };
            }

            if (['\\overrightarrow', '\\vec'].includes(tok)) {
                const arg = this.parseScriptArg(tokens, pos);
                return { node: { type: 'vec', body: arg.nodes }, pos: arg.pos };
            }

            if (['\\wideparen', '\\overparen', '\\arc', '\\widearc', '\\overarc'].includes(tok)) {
                const arg = this.parseScriptArg(tokens, pos);
                return { node: { type: 'arc', body: arg.nodes }, pos: arg.pos };
            }

            if (['\\heva', '\\hoac'].includes(tok)) {
                const pRes = this.parsePileBraced(tokens, pos);
                return { node: { type: 'system', kind: tok === '\\heva' ? 'heva' : 'hoac', rows: pRes.rows }, pos: pRes.pos };
            }

            if (tok === '\\begin') {
                let envName = 'matrix';
                if (pos < tokens.length && tokens[pos] === '{') {
                    const envRes = this.parseExpr(tokens, pos + 1, new Set(['}']));
                    pos = envRes.pos;
                    if (pos < tokens.length && tokens[pos] === '}') pos++;
                    envName = envRes.nodes.map(n => n.ch || '').join('');
                }
                if (['array', 'cases'].includes(envName)) {
                    if (envName === 'array' && pos < tokens.length && tokens[pos] === '{') {
                        const colRes = this.parseExpr(tokens, pos + 1, new Set(['}']));
                        pos = colRes.pos;
                        if (pos < tokens.length && tokens[pos] === '}') pos++;
                    }
                    const envRows = this.parseEnvRows(tokens, pos);
                    pos = envRows.pos;
                    return { node: { type: 'system', kind: envName === 'cases' ? 'heva' : 'hoac', rows: envRows.rows }, pos };
                }
            }

            if (tok === '\\left') {
                const ld = pos < tokens.length ? tokens[pos] : '(';
                pos++;
                const innerRes = this.parseExpr(tokens, pos, new Set(['\\right']));
                pos = innerRes.pos;
                let rd = '.';
                if (pos < tokens.length && tokens[pos] === '\\right') {
                    pos++;
                    if (pos < tokens.length) {
                        rd = tokens[pos];
                        pos++;
                    }
                }
                return { node: { type: 'fence', left: ld, right: rd, body: innerRes.nodes }, pos };
            }

            if (['\\,', '\\;', '\\:', '\\ ', '\\quad', '\\qquad', '~'].includes(tok)) {
                return { node: { type: 'space' }, pos };
            }

            if (tok.startsWith('\\')) {
                const cmd = tok.substring(1);
                if (KNOWN_MATH_FUNCS.has(cmd)) return { node: { type: 'func', name: cmd }, pos };
                if (cmd in LC_GREEK) return { node: { type: 'lcgreek', name: cmd }, pos };
                if (cmd in UC_GREEK) return { node: { type: 'ucgreek', name: cmd }, pos };
                if (cmd in SYMBOL_MAP) return { node: { type: 'sym', name: cmd }, pos };
                return { node: { type: 'char', ch: cmd }, pos };
            }

            if (tok in SYMBOL_MAP) return { node: { type: 'sym', name: tok }, pos };
            return { node: { type: 'char', ch: tok }, pos };
        }

        parsePileBraced(tokens, pos) {
            if (pos >= tokens.length || tokens[pos] !== '{') return { rows: [[]], pos };
            pos++;
            const rows = [];
            let currTokens = [];
            let depth = 1;
            const n = tokens.length;
            while (pos < n && depth > 0) {
                const t = tokens[pos];
                if (t === '{') {
                    depth++;
                    currTokens.push(t);
                } else if (t === '}') {
                    depth--;
                    if (depth > 0) currTokens.push(t);
                } else if (depth === 1 && t === '\\\\') {
                    const rowAst = this.parseExpr(currTokens, 0, new Set()).nodes;
                    rows.push(rowAst);
                    currTokens = [];
                } else if (depth === 1 && t === '&') {
                    // bỏ qua ký tự căn lề &
                } else {
                    currTokens.push(t);
                }
                pos++;
            }
            if (currTokens.length > 0 || rows.length === 0) {
                const rowAst = this.parseExpr(currTokens, 0, new Set()).nodes;
                rows.push(rowAst);
            }
            return { rows, pos };
        }

        parseEnvRows(tokens, pos) {
            const rows = [];
            let currTokens = [];
            let depth = 0;
            const n = tokens.length;
            while (pos < n) {
                const t = tokens[pos];
                if (t === '\\begin') {
                    depth++;
                    currTokens.push(t);
                    pos++;
                } else if (t === '\\end') {
                    if (depth === 0) {
                        pos++;
                        if (pos < n && tokens[pos] === '{') {
                            const endEnv = this.parseExpr(tokens, pos + 1, new Set(['}']));
                            pos = endEnv.pos;
                            if (pos < n && tokens[pos] === '}') pos++;
                        }
                        break;
                    }
                    depth--;
                    currTokens.push(t);
                    pos++;
                } else if (depth === 0 && t === '\\\\') {
                    const rowAst = this.parseExpr(currTokens, 0, new Set()).nodes;
                    rows.push(rowAst);
                    currTokens = [];
                    pos++;
                } else if (depth === 0 && t === '&') {
                    currTokens.push('\\,');
                    pos++;
                } else {
                    currTokens.push(t);
                    pos++;
                }
            }
            if (currTokens.length > 0 || rows.length === 0) {
                const rowAst = this.parseExpr(currTokens, 0, new Set()).nodes;
                rows.push(rowAst);
            }
            return { rows, pos };
        }

        compileNodes(nodes, inScript = false) {
            const mtefParts = [];
            const flatNodes = [];
            for (const nd of nodes) {
                if (nd.type === 'group' && nd.body.length === 1) flatNodes.push(nd.body[0]);
                else flatNodes.push(nd);
            }

            const n = flatNodes.length;
            for (let idx = 0; idx < n; idx++) {
                const nd = flatNodes[idx];
                const ntype = nd.type;

                if (ntype === 'sym') {
                    const sname = nd.name;
                    const [tf, mtcode, enc, isBin] = SYMBOL_MAP[sname];
                    const prevType = idx > 0 ? flatNodes[idx - 1].type : null;
                    const prevIsOpen = prevType === null ||
                        (prevType === 'sym' && SYMBOL_MAP[flatNodes[idx - 1].name] && SYMBOL_MAP[flatNodes[idx - 1].name][3]) ||
                        (prevType === 'char' && '([,;:='.includes(flatNodes[idx - 1].ch));
                    const useSpace = isBin && !inScript && !( (sname === '+' || sname === '-') && prevIsOpen );

                    if (useSpace && idx > 0) {
                        mtefParts.push(packMtefChar(0x00, 0x81, 0x0020, null));
                    }
                    mtefParts.push(packMtefChar(0x04, tf, mtcode, enc));
                    if (useSpace && idx + 1 < n) {
                        mtefParts.push(packMtefChar(0x00, 0x81, 0x0020, null));
                    }
                    continue;
                }

                if (ntype === 'space') {
                    mtefParts.push(new Uint8Array([0x02, 0x00, 0x98, 0x02, 0xef]));
                    continue;
                }

                if (ntype === 'prime') {
                    mtefParts.push(new Uint8Array([0x08, 0x02, 0x00, 0x02, 0x04, 0x7f, 0x32, 0x20, 0xa2]));
                    continue;
                }

                if (ntype === 'char') {
                    const ch = nd.ch;
                    const code = ch.charCodeAt(0);
                    if (ch >= '0' && ch <= '9' || ch === '.') {
                        mtefParts.push(packMtefChar(0x00, 0x88, code, null));
                    } else if ('(),/[];:!'.includes(ch)) {
                        mtefParts.push(packMtefChar(0x00, 0x82, code, null));
                        if (ch === ';' && !inScript && idx + 1 < n) {
                            mtefParts.push(packMtefChar(0x00, 0x81, 0x0020, null));
                        }
                    } else if (/[a-zA-Z]/.test(ch) && code < 128) {
                        mtefParts.push(packMtefChar(0x00, 0x83, code, null));
                    } else if (code > 255) {
                        mtefParts.push(packMtefChar(0x10, 0x81, code, code));
                    } else {
                        mtefParts.push(packMtefChar(0x00, 0x81, code, null));
                    }
                    continue;
                }

                if (ntype === 'text') {
                    for (let c = 0; c < nd.text.length; c++) {
                        const code = nd.text.charCodeAt(c);
                        if (code > 255) mtefParts.push(packMtefChar(0x10, 0x81, code, code));
                        else mtefParts.push(packMtefChar(0x00, 0x81, code, null));
                    }
                    continue;
                }

                if (ntype === 'func') {
                    const fname = nd.name;
                    for (let c = 0; c < fname.length; c++) {
                        const opt = c === 0 ? 0x02 : 0x00;
                        mtefParts.push(packMtefChar(opt, 0x82, fname.charCodeAt(c), null));
                    }
                    if (idx + 1 < n) {
                        const nxt = flatNodes[idx + 1];
                        if (nxt.type !== 'script' && nxt.type !== 'fence' && nxt.type !== 'hat' &&
                            !(nxt.type === 'char' && '([|'.includes(nxt.ch))) {
                            mtefParts.push(packMtefChar(0x00, 0x81, 0x0020, null));
                        }
                    }
                    continue;
                }

                if (ntype === 'lcgreek') {
                    const [mtcode, enc] = LC_GREEK[nd.name];
                    mtefParts.push(packMtefChar(0x04, 0x84, mtcode, enc));
                    continue;
                }

                if (ntype === 'ucgreek') {
                    const [mtcode, enc] = UC_GREEK[nd.name];
                    mtefParts.push(packMtefChar(0x04, 0x85, mtcode, enc));
                    continue;
                }

                if (ntype === 'group') {
                    mtefParts.push(this.compileNodes(nd.body, inScript));
                    continue;
                }

                if (ntype === 'frac') {
                    const nm = this.compileNodes(nd.num, true);
                    const dm = this.compileNodes(nd.den, true);
                    mtefParts.push(concatUint8Arrays([
                        new Uint8Array([0x03, 0x00, 0x0b, 0x00, 0x00, 0x01, 0x00]),
                        nm,
                        new Uint8Array([0x00, 0x01, 0x00]),
                        dm,
                        new Uint8Array([0x00, 0x00])
                    ]));
                    continue;
                }

                if (ntype === 'sqrt') {
                    const rm = this.compileNodes(nd.rad, true);
                    if (nd.deg === null) {
                        mtefParts.push(concatUint8Arrays([
                            new Uint8Array([0x03, 0x00, 0x0a, 0x00, 0x00, 0x01, 0x00]),
                            rm,
                            new Uint8Array([0x00, 0x0b, 0x01, 0x01, 0x00, 0x0a])
                        ]));
                    } else {
                        const dgm = this.compileNodes(nd.deg, true);
                        mtefParts.push(concatUint8Arrays([
                            new Uint8Array([0x03, 0x00, 0x0a, 0x01, 0x00, 0x01, 0x00]),
                            rm,
                            new Uint8Array([0x00, 0x0b, 0x01, 0x00]),
                            dgm,
                            new Uint8Array([0x00, 0x00, 0x0a])
                        ]));
                    }
                    continue;
                }

                if (ntype === 'script') {
                    const subNodes = nd.sub;
                    const supNodes = nd.sup;
                    if (subNodes !== null && supNodes !== null) {
                        const sbm = this.compileNodes(subNodes, true);
                        const spm = this.compileNodes(supNodes, true);
                        mtefParts.push(concatUint8Arrays([
                            new Uint8Array([0x03, 0x00, 0x1d, 0x00, 0x00, 0x0b, 0x01, 0x00]),
                            sbm,
                            new Uint8Array([0x00, 0x01, 0x00]),
                            spm,
                            new Uint8Array([0x00, 0x00, 0x0a])
                        ]));
                    } else if (supNodes !== null) {
                        const spm = this.compileNodes(supNodes, true);
                        mtefParts.push(concatUint8Arrays([
                            new Uint8Array([0x03, 0x00, 0x1c, 0x00, 0x00, 0x0b, 0x01, 0x01, 0x01, 0x00]),
                            spm,
                            new Uint8Array([0x00, 0x00, 0x0a])
                        ]));
                    } else if (subNodes !== null) {
                        const sbm = this.compileNodes(subNodes, true);
                        mtefParts.push(concatUint8Arrays([
                            new Uint8Array([0x03, 0x00, 0x1b, 0x00, 0x00, 0x0b, 0x01, 0x00]),
                            sbm,
                            new Uint8Array([0x00, 0x01, 0x01, 0x00, 0x0a])
                        ]));
                    }
                    continue;
                }

                if (ntype === 'hat') {
                    const bm = this.compileNodes(nd.body, inScript);
                    mtefParts.push(concatUint8Arrays([
                        new Uint8Array([0x03, 0x00, 0x21, 0x00, 0x00, 0x01, 0x00]),
                        bm,
                        new Uint8Array([0x00, 0x02, 0x00, 0x96, 0x02, 0x03, 0x00])
                    ]));
                    continue;
                }

                if (ntype === 'obar') {
                    const bm = this.compileNodes(nd.body, inScript);
                    mtefParts.push(concatUint8Arrays([
                        new Uint8Array([0x03, 0x00, 0x0d, 0x00, 0x00, 0x01, 0x00]),
                        bm,
                        new Uint8Array([0x00, 0x00])
                    ]));
                    continue;
                }

                if (ntype === 'vec') {
                    const bm = this.compileNodes(nd.body, inScript);
                    mtefParts.push(concatUint8Arrays([
                        new Uint8Array([0x03, 0x00, 0x1f, 0x02, 0x00, 0x01, 0x00]),
                        bm,
                        new Uint8Array([0x00, 0x02, 0x00, 0x96, 0xd7, 0x20, 0x00])
                    ]));
                    continue;
                }

                if (ntype === 'arc') {
                    const bm = this.compileNodes(nd.body, inScript);
                    mtefParts.push(concatUint8Arrays([
                        new Uint8Array([0x03, 0x00, 0x22, 0x00, 0x00, 0x01, 0x00]),
                        bm,
                        new Uint8Array([0x00, 0x02, 0x00, 0x96, 0x22, 0x23, 0x00])
                    ]));
                    continue;
                }

                if (ntype === 'fence') {
                    const bm = this.compileNodes(nd.body, inScript);
                    const ld = nd.left;
                    const rd = nd.right;
                    const hasL = ld !== '.' && ld !== '';
                    const hasR = rd !== '.' && rd !== '';
                    const v = (hasL ? 1 : 0) | (hasR ? 2 : 0);
                    let sel = 1, lch = 0x28, rch = 0x29;
                    if (ld.includes('{') || rd.includes('{')) { sel = 2; lch = 0x7B; rch = 0x7D; }
                    else if (ld.includes('[') || rd.includes('[')) { sel = 3; lch = 0x5B; rch = 0x5D; }
                    else if (ld.includes('|') || rd.includes('|')) { sel = 4; lch = 0x7C; rch = 0x7C; }

                    const fChars = [];
                    if (hasL) fChars.push(new Uint8Array([0x02, 0x00, 0x96, lch, 0x00]));
                    if (hasR) fChars.push(new Uint8Array([0x02, 0x00, 0x96, rch, 0x00]));

                    mtefParts.push(concatUint8Arrays([
                        new Uint8Array([0x03, 0x00, sel, v, 0x00, 0x01, 0x00]),
                        bm,
                        new Uint8Array([0x00]),
                        concatUint8Arrays(fChars),
                        new Uint8Array([0x00])
                    ]));
                    continue;
                }

                if (ntype === 'system') {
                    const rowMtefs = [];
                    for (const rAst of nd.rows) {
                        const rm = this.compileNodes(rAst, false);
                        rowMtefs.push(concatUint8Arrays([
                            new Uint8Array([0x01, 0x00]),
                            rm,
                            new Uint8Array([0x00])
                        ]));
                    }
                    const pileMtef = concatUint8Arrays([
                        new Uint8Array([0x04, 0x00, 0x01, 0x02]),
                        concatUint8Arrays(rowMtefs),
                        new Uint8Array([0x00])
                    ]);
                    if (nd.kind === 'heva') {
                        mtefParts.push(concatUint8Arrays([
                            new Uint8Array([0x03, 0x00, 0x02, 0x01, 0x00, 0x01, 0x00]),
                            pileMtef,
                            new Uint8Array([0x00, 0x02, 0x00, 0x96, 0x7b, 0x00, 0x00])
                        ]));
                    } else {
                        mtefParts.push(concatUint8Arrays([
                            new Uint8Array([0x03, 0x00, 0x03, 0x01, 0x00, 0x01, 0x00]),
                            pileMtef,
                            new Uint8Array([0x00, 0x02, 0x00, 0x96, 0x5b, 0x00, 0x00])
                        ]));
                    }
                    continue;
                }
            }
            return concatUint8Arrays(mtefParts);
        }

        convert(latex) {
            let norm = String(latex || '').trim();
            if (norm.startsWith('$$') && norm.endsWith('$$')) norm = norm.substring(2, norm.length - 2).trim();
            else if (norm.startsWith('$') && norm.endsWith('$')) norm = norm.substring(1, norm.length - 1).trim();
            else if (norm.startsWith('\\[') && norm.endsWith('\\]')) norm = norm.substring(2, norm.length - 2).trim();
            else if (norm.startsWith('\\(') && norm.endsWith('\\)')) norm = norm.substring(2, norm.length - 2).trim();

            if (norm.endsWith('\\\\')) norm = norm.substring(0, norm.length - 2).trim();
            if (norm.startsWith('\\True')) norm = norm.substring(5).trim();

            // Chuẩn hóa dấu phẩy thập phân kiểu Việt Nam {,} thành ,
            norm = norm.replace(/\{,\}/g, ',');

            if (this.cache.has(norm)) {
                return this.cache.get(norm);
            }

            const tokens = this.tokenize(norm);
            const { nodes } = this.parseExpr(tokens, 0, new Set());
            const bodyBytes = this.compileNodes(nodes, false);

            const mtefBytes = concatUint8Arrays([
                MTEF_HEADER_BYTES,
                new Uint8Array([0x0a, 0x01, 0x00]),
                bodyBytes,
                new Uint8Array([0x00, 0x00])
            ]);

            this.cache.set(norm, mtefBytes);
            return mtefBytes;
        }
    }

    const GLOBAL_MTEF_COMPILER = new LatexMtefCompiler();

    // ==========================================
    // 3. ĐÓNG GÓI OLE2 VÀ WMF PREVIEW CHUẨN MATHTYPE
    // ==========================================
    function buildOleObject(mtefBytes) {
        const OLE_HEADER = base64ToUint8Array(OLE_HEADER_B64);
        const DIR_SEC1_BASE = base64ToUint8Array(DIR_SEC1_B64);
        const MINISTREAM_PREFIX = base64ToUint8Array(MINISTREAM_PREFIX_B64);
        const DIR_SEC4_BASE = base64ToUint8Array(DIR_SEC4_B64);

        const ts1 = Math.floor(Date.now() / 1000) & 0xFFFFFFFF;
        const ts2 = 13033261;

        const eqHdr = new Uint8Array(28);
        const eqHdrDv = new DataView(eqHdr.buffer);
        eqHdrDv.setUint16(0, 28, true);
        eqHdrDv.setUint16(2, 0, true);
        eqHdrDv.setUint32(4, 3257794562, true);
        eqHdrDv.setUint32(8, mtefBytes.length, true);
        eqHdrDv.setUint32(12, 0, true);
        eqHdrDv.setUint32(16, ts1, true);
        eqHdrDv.setUint32(20, ts2, true);
        eqHdrDv.setUint32(24, ts1, true);

        const eqLen = 28 + mtefBytes.length;
        const eqStream = new Uint8Array(eqLen);
        eqStream.set(eqHdr, 0);
        eqStream.set(mtefBytes, 28);

        const nEqMini = Math.floor((eqLen + 63) / 64);
        const totalMini = 4 + nEqMini;
        const ministreamSize = totalMini * 64;
        const nMiniSecs = Math.floor((ministreamSize + 511) / 512);

        // 1. Sector 0: FAT (512 bytes)
        const sec0 = new Uint8Array(512);
        const sec0Dv = new DataView(sec0.buffer);
        for (let i = 0; i < 128; i++) sec0Dv.setUint32(i * 4, 0xFFFFFFFF, true);
        sec0Dv.setUint32(0, 0xFFFFFFFD, true);
        sec0Dv.setUint32(4, 4, true);
        sec0Dv.setUint32(8, 0xFFFFFFFE, true);
        sec0Dv.setUint32(16, 0xFFFFFFFE, true);
        if (nMiniSecs === 1) {
            sec0Dv.setUint32(12, 0xFFFFFFFE, true);
        } else {
            sec0Dv.setUint32(12, 5, true);
            for (let s = 5; s < 5 + nMiniSecs - 2; s++) sec0Dv.setUint32(s * 4, s + 1, true);
            sec0Dv.setUint32((5 + nMiniSecs - 2) * 4, 0xFFFFFFFE, true);
        }

        // 2. Sector 1: Directory part 1 (512 bytes)
        const sec1 = new Uint8Array(DIR_SEC1_BASE);
        const sec1Dv = new DataView(sec1.buffer);
        sec1Dv.setUint32(120, ministreamSize, true);

        // 3. Sector 2: MiniFAT (512 bytes)
        const sec2 = new Uint8Array(512);
        const sec2Dv = new DataView(sec2.buffer);
        for (let i = 0; i < 128; i++) sec2Dv.setUint32(i * 4, 0xFFFFFFFF, true);
        sec2Dv.setUint32(0, 0xFFFFFFFE, true);
        sec2Dv.setUint32(4, 2, true);
        sec2Dv.setUint32(8, 0xFFFFFFFE, true);
        sec2Dv.setUint32(12, 0xFFFFFFFE, true);
        for (let k = 4; k < Math.min(128, 4 + nEqMini - 1); k++) {
            sec2Dv.setUint32(k * 4, k + 1, true);
        }
        if (4 + nEqMini - 1 < 128) {
            sec2Dv.setUint32((4 + nEqMini - 1) * 4, 0xFFFFFFFE, true);
        }

        // 4. Sector 4: Directory part 2 (512 bytes)
        const sec4 = new Uint8Array(DIR_SEC4_BASE);
        const sec4Dv = new DataView(sec4.buffer);
        sec4Dv.setUint32(120, eqLen, true);

        // 5. MiniStream
        const fullMinistream = new Uint8Array(nMiniSecs * 512);
        fullMinistream.set(MINISTREAM_PREFIX, 0);
        fullMinistream.set(eqStream, 256);
        const sec3 = fullMinistream.subarray(0, 512);
        const extraSecs = fullMinistream.subarray(512);

        const totalLen = 512 * 6 + extraSecs.length;
        const oleBytes = new Uint8Array(totalLen);
        let offset = 0;
        oleBytes.set(OLE_HEADER, offset); offset += 512;
        oleBytes.set(sec0, offset); offset += 512;
        oleBytes.set(sec1, offset); offset += 512;
        oleBytes.set(sec2, offset); offset += 512;
        oleBytes.set(sec3, offset); offset += 512;
        oleBytes.set(sec4, offset); offset += 512;
        if (extraSecs.length > 0) {
            oleBytes.set(extraSecs, offset);
        }

        return oleBytes;
    }

    function buildWmf(widthPt = 24, heightPt = 14) {
        const padX = 1.0;
        const padY = 0.5;
        const wPt = Math.max(2.0, Math.round((widthPt + 2.0 * padX) * 100) / 100);
        const hPt = Math.max(4.0, Math.round((heightPt + 2.0 * padY) * 100) / 100);

        let unitsPerPt = 800;
        while ((wPt * unitsPerPt > 32000 || hPt * unitsPerPt > 32000) && unitsPerPt > 50) {
            unitsPerPt = Math.floor(unitsPerPt / 2);
        }
        const inch = unitsPerPt * 72;
        const r = Math.max(1, Math.min(32767, Math.round(wPt * unitsPerPt)));
        const b = Math.max(1, Math.min(32767, Math.round(hPt * unitsPerPt)));
        const inchClamped = Math.max(72, Math.min(65535, Math.round(inch)));

        const apmBuf = new Uint8Array(22);
        const apmDv = new DataView(apmBuf.buffer);
        apmDv.setUint32(0, 0x9AC6CDD7, true);
        apmDv.setUint16(4, 0, true);
        apmDv.setInt16(6, 0, true);
        apmDv.setInt16(8, 0, true);
        apmDv.setInt16(10, r, true);
        apmDv.setInt16(12, b, true);
        apmDv.setUint16(14, inchClamped, true);
        apmDv.setUint32(16, 0, true);
        let csum = 0;
        for (let o = 0; o < 20; o += 2) csum ^= apmDv.getUint16(o, true);
        apmDv.setUint16(20, csum, true);

        const wmfBody = new Uint8Array(128);
        const wDv = new DataView(wmfBody.buffer);
        let p = 0;
        wDv.setUint16(p, 1, true); p += 2;
        wDv.setUint16(p, 9, true); p += 2;
        wDv.setUint16(p, 0x0300, true); p += 2;
        wDv.setUint32(p, 64, true); p += 4;
        wDv.setUint16(p, 2, true); p += 2;
        wDv.setUint32(p, 11, true); p += 4;
        wDv.setUint16(p, 0, true); p += 2;

        wDv.setUint32(p, 4, true); p += 4; wDv.setUint16(p, 0x0103, true); p += 2; wDv.setUint16(p, 8, true); p += 2;
        wDv.setUint32(p, 5, true); p += 4; wDv.setUint16(p, 0x020B, true); p += 2; wDv.setInt16(p, 0, true); p += 2; wDv.setInt16(p, 0, true); p += 2;
        wDv.setUint32(p, 5, true); p += 4; wDv.setUint16(p, 0x020C, true); p += 2; wDv.setInt16(p, b, true); p += 2; wDv.setInt16(p, r, true); p += 2;
        wDv.setUint32(p, 4, true); p += 4; wDv.setUint16(p, 0x0106, true); p += 2; wDv.setUint16(p, 2, true); p += 2;
        wDv.setUint32(p, 8, true); p += 4; wDv.setUint16(p, 0x02FA, true); p += 2; wDv.setUint16(p, 5, true); p += 2; wDv.setUint16(p, 0, true); p += 2; wDv.setUint16(p, 0, true); p += 2; wDv.setUint16(p, 0, true); p += 2; wDv.setUint16(p, 0, true); p += 2;
        wDv.setUint32(p, 4, true); p += 4; wDv.setUint16(p, 0x012D, true); p += 2; wDv.setUint16(p, 0, true); p += 2;
        wDv.setUint32(p, 7, true); p += 4; wDv.setUint16(p, 0x02FC, true); p += 2; wDv.setUint16(p, 0, true); p += 2; wDv.setUint16(p, 0, true); p += 2; wDv.setUint16(p, 0, true); p += 2; wDv.setUint16(p, 0, true); p += 2;
        wDv.setUint32(p, 4, true); p += 4; wDv.setUint16(p, 0x012D, true); p += 2; wDv.setUint16(p, 1, true); p += 2;
        wDv.setUint32(p, 11, true); p += 4; wDv.setUint16(p, 0x0538, true); p += 2; wDv.setUint16(p, 1, true); p += 2; wDv.setUint16(p, 3, true); p += 2;
        wDv.setInt16(p, 0, true); p += 2; wDv.setInt16(p, 0, true); p += 2;
        wDv.setInt16(p, 1, true); p += 2; wDv.setInt16(p, 0, true); p += 2;
        wDv.setInt16(p, 1, true); p += 2; wDv.setInt16(p, 1, true); p += 2;
        wDv.setUint32(p, 3, true); p += 4; wDv.setUint16(p, 0x0000, true); p += 2;

        const out = new Uint8Array(22 + 128);
        out.set(apmBuf, 0);
        out.set(wmfBody, 22);
        return out;
    }

    function estimateFormulaDimensions(latex) {
        let clean = String(latex || '').trim();
        if (clean.startsWith('$$') && clean.endsWith('$$')) clean = clean.substring(2, clean.length - 2).trim();
        else if (clean.startsWith('$') && clean.endsWith('$')) clean = clean.substring(1, clean.length - 1).trim();

        const isSystem = clean.includes('\\heva') || clean.includes('\\hoac') || clean.includes('\\begin{cases}');
        const isFrac = clean.includes('\\frac') || clean.includes('\\dfrac');
        const isBig = isSystem || clean.includes('\\sum') || clean.includes('\\int');

        let widthPt = Math.max(12, clean.length * 6.5);
        if (widthPt > 280) widthPt = 280;
        let heightPt = 13.5;
        let posHalfPts = -2;

        if (isSystem) {
            heightPt = 28.0;
            posHalfPts = -18;
        } else if (isFrac) {
            heightPt = 22.0;
            posHalfPts = -14;
        } else if (isBig) {
            heightPt = 20.0;
            posHalfPts = -10;
        }

        return {
            widthPt,
            heightPt,
            posHalfPts,
            dxaOrig: Math.round(widthPt * 20),
            dyaOrig: Math.round(heightPt * 20)
        };
    }

    const SHAPETYPE_XML = `
    <v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f">
        <v:stroke joinstyle="miter"/>
        <v:formulas>
            <v:f eqn="if lineDrawn pixelLineWidth 0"/>
            <v:f eqn="sum @0 1 0"/>
            <v:f eqn="sum 0 0 @1"/>
            <v:f eqn="prod @2 1 2"/>
            <v:f eqn="prod @3 21600 pixelWidth"/>
            <v:f eqn="prod @3 21600 pixelHeight"/>
            <v:f eqn="sum @0 0 1"/>
            <v:f eqn="prod @6 1 2"/>
            <v:f eqn="prod @7 21600 pixelWidth"/>
            <v:f eqn="sum @8 21600 0"/>
            <v:f eqn="prod @7 21600 pixelHeight"/>
            <v:f eqn="sum @10 21600 0"/>
        </v:formulas>
        <v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/>
        <o:lock v:ext="edit" aspectratio="t"/>
    </v:shapetype>`;

    // ==========================================
    // 4. BỘ CHUYỂN ĐỔI LATEX SANG OPENXML OMML
    // ==========================================
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
                while (end < str.length && /[a-zA-Z]/.test(end)) end++;
                return { content: str.substring(idx, end), nextIdx: end };
            } else {
                return { content: str[idx], nextIdx: idx + 1 };
            }
        }
    }

    function parseLatexToOmml(latex) {
        if (!latex) return '';
        let text = String(latex).trim();
        text = text.replace(/^\$\$([\s\S]*)\$\$$/, '$1')
                   .replace(/^\$([\s\S]*)\$$/, '$1')
                   .replace(/^\\\[([\s\S]*)\\\]$/, '$1')
                   .replace(/^\\\(([\s\S]*)\\\)$/, '$1')
                   .trim();

        text = text.replace(/\{,\}/g, ',');
        text = text.replace(/\\(dfrac|tfrac|cfrac)\b/g, '\\frac');
        text = text.replace(/\\mathbb\{R\}/g, '\u211D').replace(/\\mathbb\{N\}/g, '\u2115').replace(/\\mathbb\{Z\}/g, '\u2124').replace(/\\mathbb\{Q\}/g, '\u211A').replace(/\\mathbb\{C\}/g, '\u2102');

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

        return `<m:oMath>${parseTokensToOmml(text)}</m:oMath>`;
    }

    function parseTokensToOmml(tex) {
        let out = '';
        let i = 0;
        const len = tex.length;

        while (i < len) {
            if (/\s/.test(tex[i])) { i++; continue; }

            if (tex.startsWith('\\begin{cases}', i)) {
                const endIdx = tex.indexOf('\\end{cases}', i);
                if (endIdx !== -1) {
                    const body = tex.substring(i + 13, endIdx);
                    const rows = body.split(/\\\\/).map(r => r.trim()).filter(Boolean);
                    out += `<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e><m:eqArr>${rows.map(r => `<m:e>${parseTokensToOmml(r)}</m:e>`).join('')}</m:eqArr></m:e></m:d>`;
                    i = endIdx + 11;
                    continue;
                }
            }

            if (tex.startsWith('\\frac', i)) {
                const grp1 = extractGroup(tex, i + 5);
                const grp2 = extractGroup(tex, grp1.nextIdx);
                out += `<m:f><m:fPr/><m:num>${parseTokensToOmml(grp1.content)}</m:num><m:den>${parseTokensToOmml(grp2.content)}</m:den></m:f>`;
                i = grp2.nextIdx;
                continue;
            }

            if (tex.startsWith('\\sqrt', i)) {
                let nextI = i + 5;
                while (nextI < len && /\s/.test(tex[nextI])) nextI++;
                let degXml = '';
                let isNth = false;
                if (tex[nextI] === '[') {
                    const endBracket = tex.indexOf(']', nextI);
                    if (endBracket !== -1) {
                        const degText = tex.substring(nextI + 1, endBracket);
                        degXml = `<m:deg>${parseTokensToOmml(degText)}</m:deg>`;
                        isNth = true;
                        nextI = endBracket + 1;
                    }
                }
                const grp = extractGroup(tex, nextI);
                if (isNth) {
                    out += `<m:rad><m:radPr/>${degXml}<m:e>${parseTokensToOmml(grp.content)}</m:e></m:rad>`;
                } else {
                    out += `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${parseTokensToOmml(grp.content)}</m:e></m:rad>`;
                }
                i = grp.nextIdx;
                continue;
            }

            const vecMatch = tex.substring(i).match(/^\\(vec|overrightarrow)\b/);
            if (vecMatch) {
                const grp = extractGroup(tex, i + vecMatch[0].length);
                out += `<m:acc><m:accPr><m:chr m:val="&#x20D7;"/></m:accPr><m:e>${parseTokensToOmml(grp.content)}</m:e></m:acc>`;
                i = grp.nextIdx;
                continue;
            }

            const hatMatch = tex.substring(i).match(/^\\(widehat|wideparen|overparen|hat)\b/);
            if (hatMatch) {
                const cmd = hatMatch[1];
                const grp = extractGroup(tex, i + hatMatch[0].length);
                const chr = (cmd === 'wideparen' || cmd === 'overparen') ? '&#x23DC;' : '^';
                out += `<m:acc><m:accPr><m:chr m:val="${chr}"/></m:accPr><m:e>${parseTokensToOmml(grp.content)}</m:e></m:acc>`;
                i = grp.nextIdx;
                continue;
            }

            if (tex[i] === '\\') {
                let end = i + 1;
                while (end < len && /[a-zA-Z]/.test(tex[end])) end++;
                const cmd = tex.substring(i + 1, end);
                if (KNOWN_MATH_FUNCS.has(cmd)) {
                    out += `<m:r><m:rPr><m:nor/></m:rPr><m:t>${cmd}</m:t></m:r>`;
                    i = end;
                    continue;
                }
                if (SYMBOL_MAP[cmd]) {
                    out += `<m:r><m:t>${escapeXml(cmd)}</m:t></m:r>`;
                    i = end;
                    continue;
                }
                i = end;
                continue;
            }

            const ch = tex[i];
            i++;
            if (/[a-zA-Z]/.test(ch)) {
                out += `<m:r><m:rPr><m:sty m:val="i"/></m:rPr><m:t>${ch}</m:t></m:r>`;
            } else if (/[0-9]/.test(ch)) {
                out += `<m:r><m:t>${ch}</m:t></m:r>`;
            } else {
                out += `<m:r><m:t>${escapeXml(ch)}</m:t></m:r>`;
            }
        }
        return out;
    }

    // ==========================================
    // 5. BỘ PHÂN TÍCH BẢNG BIỂU LATEX (TABULAR)
    // ==========================================
    function parseLatexTabular(tabularCode) {
        if (!tabularCode) return null;
        const startMatch = tabularCode.match(/\\begin\{tabular\}\s*\{([^}]*)\}/i);
        if (!startMatch) return null;

        const startIdx = startMatch.index + startMatch[0].length;
        const endIdx = tabularCode.indexOf('\\end{tabular}', startIdx);
        if (endIdx === -1) return null;

        const body = tabularCode.substring(startIdx, endIdx);
        // Tách các hàng bằng \\
        const rawRows = body.split(/\\\\/).map(r => r.trim()).filter(Boolean);
        const rows = [];

        for (const rawRow of rawRows) {
            // Lọc bỏ các lệnh \hline, \cline{...}
            let cleanedRow = rawRow.replace(/\\hline/g, '').replace(/\\cline\{[^}]*\}/g, '').trim();
            if (!cleanedRow) continue;
            // Tách các ô bằng dấu &
            const cells = cleanedRow.split('&').map(c => c.trim().replace(/\{,\}/g, ','));
            rows.push(cells);
        }

        return { rows };
    }

    function buildTableXml(tableData, imageMap, formulaRegistry, formulaMode) {
        if (!tableData || !Array.isArray(tableData.rows) || tableData.rows.length === 0) return '';
        let rowsXml = '';

        for (const row of tableData.rows) {
            let cellsXml = '';
            for (const cellText of row) {
                const cellRuns = parseRunsFromText(cellText, false, false, formulaRegistry, formulaMode);
                cellsXml += `
                <w:tc>
                    <w:tcPr>
                        <w:tcMar>
                            <w:top w:w="120" w:type="dxa"/>
                            <w:bottom w:w="120" w:type="dxa"/>
                            <w:left w:w="160" w:type="dxa"/>
                            <w:right w:w="160" w:type="dxa"/>
                        </w:tcMar>
                        <w:vAlign w:val="center"/>
                    </w:tcPr>
                    <w:p>
                        <w:pPr>
                            <w:jc w:val="center"/>
                            <w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/>
                        </w:pPr>
                        ${renderRunsToXml(cellRuns, imageMap, formulaRegistry)}
                    </w:p>
                </w:tc>`;
            }
            rowsXml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cellsXml}</w:tr>`;
        }

        return `
        <w:tbl>
            <w:tblPr>
                <w:tblW w:w="0" w:type="auto"/>
                <w:jc w:val="center"/>
                <w:tblBorders>
                    <w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>
                    <w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/>
                    <w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>
                    <w:right w:val="single" w:sz="6" w:space="0" w:color="000000"/>
                    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                    <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                </w:tblBorders>
            </w:tblPr>
            ${rowsXml}
        </w:tbl>`;
    }

    // ==========================================
    // 6. TIỆN ÍCH LÀM SẠCH VĂN BẢN VÀ TÁCH RUNS
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
        // Chuẩn hóa dấu phẩy thập phân {,} -> ,
        s = s.replace(/\{,\}/g, ',');
        return s.trim();
    }

    function parseRunsFromText(rawText, baseBold = false, baseItalic = false, formulaRegistry = null, formulaMode = 'mathtype') {
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
                if (formulaMode === 'mathtype' && formulaRegistry) {
                    const oleEntry = formulaRegistry.register(tok);
                    runs.push({ isMath: true, isMathType: true, entry: oleEntry });
                } else {
                    runs.push({ isMath: true, isMathType: false, ommlXml: parseLatexToOmml(tok) });
                }
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

    function renderRunsToXml(runs, imageMap = {}, formulaRegistry = null) {
        return runs.map(r => {
            if (r.isMath) {
                if (r.isMathType && r.entry) {
                    const e = r.entry;
                    const stPart = e.includeShapetype ? SHAPETYPE_XML : '';
                    return `
                    <w:r>
                        <w:rPr>
                            <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
                            <w:color w:val="000000"/>
                            <w:position w:val="${e.posHalfPts}"/>
                            <w:sz w:val="24"/><w:szCs w:val="24"/>
                        </w:rPr>
                        <w:object w:dxaOrig="${e.dxaOrig}" w:dyaOrig="${e.dyaOrig}">
                            ${stPart}
                            <v:shape id="${e.shapeId}" type="#_x0000_t75" style="width:${e.widthPt.toFixed(2)}pt;height:${e.heightPt.toFixed(2)}pt" o:ole="">
                                <v:imagedata r:id="${e.wmfRid}" o:title=""/>
                            </v:shape>
                            <o:OLEObject Type="Embed" ProgID="Equation.DSMT4" ShapeID="${e.shapeId}" DrawAspect="Content" ObjectID="${e.objectId}" r:id="${e.oleRid}"/>
                        </w:object>
                    </w:r>`;
                }
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
    // 7. TIỆN ÍCH DÒNG KẺ CHẤM & HEADER WORD
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
        <w:tbl>
            <w:tblPr>
                <w:tblW w:w="10773" w:type="dxa"/>
                <w:tblBorders>
                    <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
                    <w:insideH w:val="none"/><w:insideV w:val="none"/>
                </w:tblBorders>
            </w:tblPr>
            <w:tblGrid>
                <w:gridCol w:w="9773"/>
                <w:gridCol w:w="1000"/>
            </w:tblGrid>
            <w:tr>
                <w:tc>
                    <w:tcPr><w:tcW w:w="9773" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
                    <w:p>
                        <w:pPr><w:spacing w:before="80" w:after="160"/></w:pPr>
                        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
                            <w:t>Họ và tên thí sinh: ............................................................................ Số báo danh: ............................ Lớp: ........................</w:t>
                        </w:r>
                    </w:p>
                </w:tc>
                <w:tc>
                    <w:tcPr>
                        <w:tcW w:w="1000" w:type="dxa"/>
                        <w:tcBorders>
                            <w:top w:val="single" w:sz="6" w:color="000000"/>
                            <w:left w:val="single" w:sz="6" w:color="000000"/>
                            <w:bottom w:val="single" w:sz="6" w:color="000000"/>
                            <w:right w:val="single" w:sz="6" w:color="000000"/>
                        </w:tcBorders>
                        <w:vAlign w:val="center"/>
                    </w:tcPr>
                    <w:p>
                        <w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr>
                        <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="888888"/></w:rPr>
                            <w:t>Phách</w:t>
                        </w:r>
                    </w:p>
                </w:tc>
            </w:tr>
        </w:tbl>`;
    }

    // ==========================================
    // 8. FORMULA REGISTRY ĐỂ QUẢN LÝ OLE / WMF
    // ==========================================
    class DocxFormulaRegistry {
        constructor() {
            this.entries = [];
            this.wmfRidMap = new Map();
            this.nextRid = 20;
            this.nextImgIdx = 0;
            this.nextOleIdx = 0;
            this.shapeCounter = 1025;
            this.objectIdBase = 1853387800;
            this.shapetypeEmitted = false;
        }

        register(latex) {
            const mtefBytes = GLOBAL_MTEF_COMPILER.convert(latex);
            const mtefHex = Array.from(mtefBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const oleBytes = buildOleObject(mtefBytes);

            const dims = estimateFormulaDimensions(latex);
            const wmfBytes = buildWmf(dims.widthPt, dims.heightPt);

            let wmfRid;
            let wmfTarget;
            if (this.wmfRidMap.has(mtefHex)) {
                const existing = this.wmfRidMap.get(mtefHex);
                wmfRid = existing.wmfRid;
                wmfTarget = existing.wmfTarget;
            } else {
                this.nextImgIdx++;
                this.nextRid++;
                wmfRid = `rIdWmf_${this.nextRid}`;
                wmfTarget = `media/image_math_${this.nextImgIdx}.wmf`;
                this.wmfRidMap.set(mtefHex, { wmfRid, wmfTarget, wmfBytes });
            }

            this.nextOleIdx++;
            this.nextRid++;
            const oleRid = `rIdOle_${this.nextRid}`;
            const oleTarget = `embeddings/oleObject${this.nextOleIdx}.bin`;

            const shapeId = `_x0000_i${this.shapeCounter++}`;
            const objectId = `_${this.objectIdBase + this.nextOleIdx - 1}`;
            const includeShapetype = !this.shapetypeEmitted;
            this.shapetypeEmitted = true;

            const entry = {
                latex,
                mtefBytes,
                oleBytes,
                wmfBytes,
                wmfRid,
                wmfTarget,
                oleRid,
                oleTarget,
                shapeId,
                objectId,
                includeShapetype,
                widthPt: dims.widthPt,
                heightPt: dims.heightPt,
                dxaOrig: dims.dxaOrig,
                dyaOrig: dims.dyaOrig,
                posHalfPts: dims.posHalfPts
            };

            this.entries.push(entry);
            return entry;
        }
    }

    // ==========================================
    // 9. XÂY DỰNG TOÀN BỘ FILE WORD XML (BTPRO)
    // ==========================================
    function buildDocumentXml({ title, questions, mode = 'questions', options = {}, imageMap = {}, formulaRegistry = null }) {
        const {
            formulaMode = 'mathtype', // 'mathtype' hoặc 'omml'
            headerStyle = 'standard_gov', // 'standard_gov', 'brand_center', 'compact', 'none'
            agencyName = 'SỞ GD&ĐT HÀ NỘI',
            schoolName = 'TRƯỜNG THPT TRẦN QUANG KHẢI',
            examType = '(ĐỀ CHÍNH THỨC)',
            examSubtitle = 'ĐỀ KHẢO SÁT CHẤT LƯỢNG HỌC KỲ',
            subject = 'Toán học',
            grade = '9',
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

        // 1. TẠO TIÊU ĐỀ THEO MẪU ĐƯỢC CHỌN (CHUẨN BỘ 2 CỘT TỪ SCREENSHOT 2)
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
                    <!-- CỘT 1 (BÊN TRÁI 4 DÒNG CHUẨN SCREENSHOT 2) -->
                    <w:tc>
                        <w:tcPr><w:tcW w:w="5386" w:type="dxa"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="30"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(agencyName.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="30"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(schoolName.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="30"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(examType.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>(Đề thi có ${questions.length} câu hỏi)</w:t></w:r>
                        </w:p>
                    </w:tc>
                    <!-- CỘT 2 (BÊN PHẢI 3 DÒNG CHUẨN SCREENSHOT 2) -->
                    <w:tc>
                        <w:tcPr><w:tcW w:w="5387" w:type="dxa"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="30"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(title.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="30"/></w:pPr>
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

        // Hàm kết xuất đoạn văn hoặc bảng biểu bên trong câu hỏi
        function renderQuestionBlocks(prefixText, rawContent) {
            let outXml = '';
            const content = cleanHtmlToWordText(rawContent);

            // Kiểm tra xem câu hỏi có chứa môi trường \begin{tabular} hay không
            const tabularMatch = content.match(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/i);
            if (tabularMatch) {
                const tableCode = tabularMatch[0];
                const preText = content.substring(0, tabularMatch.index).trim();
                const postText = content.substring(tabularMatch.index + tableCode.length).trim();

                // Paragraph trước bảng
                outXml += `
                <w:p>
                  <w:pPr>
                    <w:ind w:left="992" w:hanging="992"/>
                    <w:spacing w:before="80" w:after="40" w:line="276" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                    <w:t xml:space="preserve">${escapeXml(prefixText)}</w:t>
                  </w:r>
                  ${renderRunsToXml(parseRunsFromText(preText, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}
                </w:p>`;

                // Bảng biểu
                const tableData = parseLatexTabular(tableCode);
                if (tableData) {
                    outXml += buildTableXml(tableData, imageMap, formulaRegistry, formulaMode);
                }

                // Paragraph sau bảng nếu có
                if (postText) {
                    outXml += `
                    <w:p>
                      <w:pPr>
                        <w:ind w:left="992"/>
                        <w:spacing w:before="40" w:after="40" w:line="276" w:lineRule="auto"/>
                        <w:jc w:val="both"/>
                      </w:pPr>
                      ${renderRunsToXml(parseRunsFromText(postText, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}
                    </w:p>`;
                }
            } else {
                // Câu hỏi dạng văn bản thông thường
                outXml += `
                <w:p>
                  <w:pPr>
                    <w:ind w:left="992" w:hanging="992"/>
                    <w:spacing w:before="80" w:after="40" w:line="276" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                    <w:t xml:space="preserve">${escapeXml(prefixText)}</w:t>
                  </w:r>
                  ${renderRunsToXml(parseRunsFromText(content, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}
                </w:p>`;
            }

            return outXml;
        }

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
                const prefix = `${cccdTag}Câu ${qNum}. `;

                bodyXml += renderQuestionBlocks(prefix, q.content);

                // Chèn ảnh đính kèm câu hỏi nếu có
                if (q.image && imageMap[q.image]) {
                    const imgInfo = imageMap[q.image];
                    bodyXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>${buildDrawingXml(imgInfo.id, imgInfo.rId, imgInfo.cx, imgInfo.cy)}</w:p>`;
                }

                // Options
                const opts = Array.isArray(q.options) ? q.options : [];
                if (opts.length > 0) {
                    const letters = ['A', 'B', 'C', 'D'];
                    const cleanOpts = opts.map(o => cleanHtmlToWordText(typeof o === 'object' ? (o.text || '') : o));
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
                            ${renderRunsToXml(parseRunsFromText(optText, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}`;
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
                                ${renderRunsToXml(parseRunsFromText(cleanOpts[oIdx], false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}`;
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
                              ${renderRunsToXml(parseRunsFromText(optText, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}
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
                      ${renderRunsToXml(parseRunsFromText(solText, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}
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
                const prefix = `${cccdTag}Câu ${qNum}. `;

                bodyXml += renderQuestionBlocks(prefix, q.content);

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
                      ${renderRunsToXml(parseRunsFromText(stText, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}
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
                      ${renderRunsToXml(parseRunsFromText(solText, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}
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
                const prefix = `${cccdTag}Câu ${qNum}. `;

                bodyXml += renderQuestionBlocks(prefix, q.content);

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
                          ${renderRunsToXml(parseRunsFromText(solText, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}
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
                const prefix = `${cccdTag}Câu ${qNum}. `;

                bodyXml += renderQuestionBlocks(prefix, q.content);

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
                      ${renderRunsToXml(parseRunsFromText(solText, false, false, formulaRegistry, formulaMode), imageMap, formulaRegistry)}
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
                    bodyXml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>`;
                    for (let c = 0; c < colsPerRow; c++) {
                        const qIdx = r * colsPerRow + c;
                        const label = qIdx < totalP1 ? `Câu ${qIdx + 1}` : '';
                        bodyXml += `<w:tc><w:tcPr><w:tcW w:w="1077" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>${label}</w:t></w:r></w:p></w:tc>`;
                    }
                    bodyXml += `</w:tr>`;

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
                    const st = Array.isArray(q.statements) ? q.statements : [];
                    bodyXml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>`;
                    bodyXml += `<w:tc><w:tcPr><w:tcW w:w="2154"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Câu ${pIdx + 1}</w:t></w:r></w:p></w:tc>`;
                    for (let sIdx = 0; sIdx < 4; sIdx++) {
                        const sObj = st[sIdx];
                        const isTrue = typeof sObj === 'object' ? (sObj.correct === true || sObj.isCorrect === true || sObj.answer === 'Đ' || sObj.answer === true) : false;
                        const charAns = sObj ? (isTrue ? 'Đ' : 'S') : '';
                        const colorAns = isTrue ? '059669' : 'DC2626';
                        bodyXml += `<w:tc><w:tcPr><w:tcW w:w="2155"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${colorAns}"/><w:sz w:val="24"/></w:rPr><w:t>${charAns}</w:t></w:r></w:p></w:tc>`;
                    }
                    bodyXml += `</w:tr>`;
                });
                bodyXml += `</w:tbl>`;
            }

            // Đáp án Phần III (Trả lời ngắn)
            if (part3.length > 0) {
                const totalP3 = part3.length;
                const colsPerRow = 6;
                const rowsCount = Math.ceil(totalP3 / colsPerRow);

                bodyXml += `<w:p><w:pPr><w:spacing w:before="160" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="22"/></w:rPr><w:t>Phần III: Đáp án Trả lời ngắn</w:t></w:r></w:p>`;
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
                    ${Array.from({ length: colsPerRow }).map(() => '<w:gridCol w:w="1795"/>').join('')}
                  </w:tblGrid>`;

                for (let r = 0; r < rowsCount; r++) {
                    bodyXml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>`;
                    for (let c = 0; c < colsPerRow; c++) {
                        const qIdx = r * colsPerRow + c;
                        const label = qIdx < totalP3 ? `Câu ${qIdx + 1}` : '';
                        bodyXml += `<w:tc><w:tcPr><w:tcW w:w="1795"/><w:shd w:fill="F3F4F6"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/></w:rPr><w:t>${label}</w:t></w:r></w:p></w:tc>`;
                    }
                    bodyXml += `</w:tr>`;

                    bodyXml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>`;
                    for (let c = 0; c < colsPerRow; c++) {
                        const qIdx = r * colsPerRow + c;
                        let ansVal = '';
                        if (qIdx < totalP3) {
                            const q = part3[qIdx];
                            ansVal = q.answer || q.shortAnswer || q.correctAnswer || '';
                        }
                        bodyXml += `<w:tc><w:tcPr><w:tcW w:w="1795"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="059669"/><w:sz w:val="22"/></w:rPr><w:t>${escapeXml(ansVal)}</w:t></w:r></w:p></w:tc>`;
                    }
                    bodyXml += `</w:tr>`;
                }
                bodyXml += `</w:tbl>`;
            }
        }

        // Section Properties: Khổ A4, lề 2.0-1.0-1.0-1.0 cm chuẩn BTPRO
        bodyXml += `
        <w:sectPr>
            <w:pgSz w:w="11906" w:h="16838"/>
            <w:pgMar w:top="1134" w:right="567" w:bottom="567" w:left="567" w:header="708" w:footer="708" w:gutter="0"/>
            <w:cols w:space="708"/>
            <w:docGrid w:linePitch="360"/>
        </w:sectPr>`;

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
            xmlns:v="urn:schemas-microsoft-com:vml"
            xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyXml}
  </w:body>
</w:document>`;
    }

    // ==========================================
    // 10. THU THẬP VÀ XỬ LÝ HÌNH ẢNH TRONG ĐỀ THI
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
    // 11. TẠO FILE DOCX BLOB HOÀN CHỈNH
    // ==========================================
    async function createDocxBlob({ title, questions, mode = 'questions', options = {} }) {
        if (typeof JSZip === 'undefined') {
            throw new Error('Thư viện JSZip chưa được tải!');
        }

        const zip = new JSZip();
        const formulaRegistry = new DocxFormulaRegistry();

        // 1. Nạp và xử lý toàn bộ hình ảnh
        const imageMap = await collectAndPrepareImages(questions, zip);

        // 2. Tạo nội dung document.xml (đồng thời thu thập các công thức MathType)
        const docXml = buildDocumentXml({
            title,
            questions,
            mode,
            options,
            imageMap,
            formulaRegistry
        });
        zip.file('word/document.xml', docXml);

        // 3. Nếu ở chế độ MathType OLE: nhúng toàn bộ oleObject.bin và image.wmf vào zip
        if (options.formulaMode !== 'omml') {
            formulaRegistry.entries.forEach(entry => {
                zip.file(`word/${entry.oleTarget}`, entry.oleBytes);
            });
            formulaRegistry.wmfRidMap.forEach((val) => {
                zip.file(`word/${val.wmfTarget}`, val.wmfBytes);
            });
        }

        // 4. [Content_Types].xml
        let contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="wmf" ContentType="image/x-wmf"/>
  <Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
</Types>`;
        zip.file('[Content_Types].xml', contentTypesXml);

        // 5. _rels/.rels
        zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

        // 6. word/_rels/document.xml.rels
        let relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rIdFontTable" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>`;

        // Quan hệ hình ảnh PNG/JPG thông thường
        Object.values(imageMap).forEach(img => {
            relsXml += `\n  <Relationship Id="${img.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image_${img.id}.png"/>`;
        });

        // Quan hệ WMF và OLE cho MathType
        if (options.formulaMode !== 'omml') {
            formulaRegistry.wmfRidMap.forEach((val) => {
                relsXml += `\n  <Relationship Id="${val.wmfRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${val.wmfTarget}"/>`;
            });
            formulaRegistry.entries.forEach(entry => {
                relsXml += `\n  <Relationship Id="${entry.oleRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="${entry.oleTarget}"/>`;
            });
        }

        relsXml += `\n</Relationships>`;
        zip.file('word/_rels/document.xml.rels', relsXml);

        // 7. word/styles.xml
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

        // 8. word/settings.xml
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

        // 9. word/fontTable.xml
        zip.file('word/fontTable.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fontTable xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Times New Roman"/>
  <w:font w:name="Cambria Math"/>
  <w:font w:name="Symbol"/>
</w:fontTable>`);

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
    // 12. HÀM XUẤT ĐỀ THI RA FILE WORD
    // ==========================================
    async function exportExamToWord(exam, customOptions = {}) {
        if (!exam) throw new Error('Không có dữ liệu đề thi');
        const questions = exam.questions || [];
        const baseName = sanitizeFilename(customOptions.examTitle || exam.title || 'De_Thi');
        const mode = customOptions.mode || 'questions';

        if (mode === 'both') {
            const blobQ = await createDocxBlob({
                title: customOptions.examTitle || exam.title || 'Đề thi',
                questions: questions,
                mode: 'questions',
                options: customOptions
            });
            triggerDownload(blobQ, `${baseName}_De_Bai.docx`);

            await new Promise(r => setTimeout(r, 600));

            const blobF = await createDocxBlob({
                title: customOptions.examTitle || exam.title || 'Đề thi',
                questions: questions,
                mode: 'full',
                options: customOptions
            });
            triggerDownload(blobF, `${baseName}_De_Va_Loi_Giai.docx`);
        } else if (mode === 'full') {
            const blob = await createDocxBlob({
                title: customOptions.examTitle || exam.title || 'Đề thi',
                questions: questions,
                mode: 'full',
                options: customOptions
            });
            triggerDownload(blob, `${baseName}_De_Va_Loi_Giai.docx`);
        } else {
            const blob = await createDocxBlob({
                title: customOptions.examTitle || exam.title || 'Đề thi',
                questions: questions,
                mode: 'questions',
                options: customOptions
            });
            triggerDownload(blob, `${baseName}_De_Bai.docx`);
        }
    }

    // ==========================================
    // 13. GIAO DIỆN MODAL TÙY CHỌN XUẤT WORD
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
                            <p class="text-[11px] text-gray-400">MathType 6/7 OLE chuẩn BTPRO / OMML, Căn lề A4, Kẻ bảng, Dòng kẻ chấm</p>
                        </div>
                    </div>
                    <button type="button" onclick="window.closeExportWordModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg text-lg">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Body Modal (Scrollable) -->
                <div class="py-3.5 space-y-4 overflow-y-auto flex-1 pr-1 custom-scrollbar">
                    
                    <!-- 1. Định dạng công thức Toán -->
                    <div class="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-900/40 space-y-2">
                        <label class="block text-xs font-bold text-blue-900 dark:text-blue-200">
                            📐 1. Định dạng công thức Toán trong Word
                        </label>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label class="flex items-start gap-2 p-2.5 rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer transition">
                                <input type="radio" name="exportWordFormulaMode" value="mathtype" checked class="mt-0.5 text-blue-600 focus:ring-blue-500">
                                <div>
                                    <p class="text-xs font-bold text-blue-700 dark:text-blue-300">✨ MathType 6/7 (DSMT4 OLE)</p>
                                    <p class="text-[10px] text-gray-500">Chuẩn BTPRO / Thầy Choang. Nhấp đúp mở MathType, tương thích Alt+\\</p>
                                </div>
                            </label>
                            <label class="flex items-start gap-2 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition">
                                <input type="radio" name="exportWordFormulaMode" value="omml" class="mt-0.5 text-blue-600 focus:ring-blue-500">
                                <div>
                                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">Word Equation (OMML)</p>
                                    <p class="text-[10px] text-gray-500">Công thức mặc định của Word, không yêu cầu cài MathType</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- 2. Chế độ xuất file -->
                    <div>
                        <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">2. Chế độ xuất file</label>
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

                    <!-- 3. Tùy chọn Mẫu Tiêu đề (Header) -->
                    <div class="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                        <div class="flex items-center justify-between">
                            <label class="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                <i class="fa-solid fa-heading text-blue-600"></i> 3. Mẫu tiêu đề đề thi (Header)
                            </label>
                            <select id="exportWordHeaderStyle" class="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none cursor-pointer">
                                <option value="standard_gov" selected>🏛️ Mẫu 1: Chuẩn Sở / Bộ GD (2 cột chính thức)</option>
                                <option value="brand_center">⭐ Mẫu 2: Trung tâm / QMath (Trang trọng)</option>
                                <option value="compact">📄 Mẫu 3: Tiêu đề Rút gọn (Đơn giản)</option>
                                <option value="none">🚫 Mẫu 4: Không tiêu đề (Bắt đầu từ Câu 1)</option>
                            </select>
                        </div>

                        <!-- Các trường thông tin cho phép chỉnh sửa -->
                        <div id="exportWordHeaderFieldsArea" class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-gray-200 dark:border-gray-700">
                            <div>
                                <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Cơ quan chủ quản (Dòng 1 trái)</label>
                                <input type="text" id="exportWordAgencyName" value="SỞ GD&ĐT HÀ NỘI" class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                            </div>
                            <div>
                                <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Tên trường / Đơn vị (Dòng 2 trái)</label>
                                <input type="text" id="exportWordSchoolName" value="TRƯỜNG THPT TRẦN QUANG KHẢI" class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                            </div>
                            <div>
                                <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Loại đề thi (Dòng 3 trái)</label>
                                <input type="text" id="exportWordExamType" value="(ĐỀ CHÍNH THỨC)" class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                            </div>
                            <div>
                                <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Tên đề thi (Dòng 1 phải)</label>
                                <input type="text" id="exportWordTitleInput" class="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                            </div>
                            <div class="grid grid-cols-3 gap-1.5">
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Môn thi</label>
                                    <input type="text" id="exportWordSubject" value="TOÁN HỌC" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Khối</label>
                                    <input type="text" id="exportWordGrade" value="9" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                                </div>
                                <div>
                                    <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Mã đề</label>
                                    <input type="text" id="exportWordExamCode" value="101" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                                </div>
                            </div>
                            <div class="flex items-center justify-between pt-3">
                                <div class="flex items-center gap-1.5">
                                    <span class="text-[11px] text-gray-500">Thời gian:</span>
                                    <input type="number" id="exportWordDuration" value="90" class="w-16 px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-center font-bold">
                                    <span class="text-[11px] text-gray-500">phút</span>
                                </div>
                            </div>
                            <div class="sm:col-span-2 flex items-center justify-between pt-1">
                                <label class="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" id="exportWordCandidateInfo" checked class="rounded text-blue-600 focus:ring-blue-500">
                                    <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">Khung thông tin học sinh (Họ tên, SBD, Lớp) & Ô phách</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- 4. Tùy chọn Dòng kẻ chấm (Dotted Lines) -->
                    <div class="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200/80 dark:border-amber-900/50 space-y-2.5">
                        <div class="flex items-center justify-between">
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" id="exportWordIncludeDottedLines" class="rounded text-amber-600 focus:ring-amber-500">
                                <span class="text-xs font-bold text-amber-900 dark:text-amber-200">
                                    ✍️ 4. Thêm dòng kẻ chấm để học sinh làm bài / nháp trên đề
                                </span>
                            </label>
                        </div>
                        <div id="exportWordDottedOptions" class="hidden grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-gray-700 dark:text-gray-300">Số dòng chấm mỗi câu:</span>
                                <input type="number" id="exportWordDottedCount" value="4" min="1" max="30" class="w-16 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 font-bold text-center">
                            </div>
                            <div>
                                <select id="exportWordDottedScope" class="w-full text-xs px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none">
                                    <option value="essay_short" selected>Chỉ câu Trả lời ngắn & Tự luận (Khuyên dùng)</option>
                                    <option value="all">Tất cả các câu hỏi</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- 5. Tùy chọn bổ sung khác -->
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
                        <span>Định dạng <b>MathType 6/7 OLE (Equation.DSMT4)</b> tạo trực tiếp file nhúng OLE2 chuẩn BTPRO. Bạn có thể nhấp đúp trực tiếp vào công thức trong Word để mở MathType hoặc dùng phím tắt <b>Alt+\\</b> mà không gặp bất kỳ lỗi font hay mất công thức nào!</span>
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
            titleInput.value = examObj ? (examObj.title || 'ĐỀ 01-CỤM CHUYÊN MÔN SỐ 16') : 'ĐỀ 01-CỤM CHUYÊN MÔN SỐ 16';
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
                    btnConfirm.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang tạo file Word MathType...';

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

                    const selectedFormulaMode = document.querySelector('input[name="exportWordFormulaMode"]:checked')?.value || 'mathtype';
                    const selectedMode = document.querySelector('input[name="exportWordMode"]:checked')?.value || 'questions';
                    const hStyle = document.getElementById('exportWordHeaderStyle')?.value || 'standard_gov';
                    const agency = document.getElementById('exportWordAgencyName')?.value || 'SỞ GD&ĐT HÀ NỘI';
                    const sName = document.getElementById('exportWordSchoolName')?.value || 'TRƯỜNG THPT TRẦN QUANG KHẢI';
                    const eType = document.getElementById('exportWordExamType')?.value || '(ĐỀ CHÍNH THỨC)';
                    const eTitle = document.getElementById('exportWordTitleInput')?.value || fullExam.title || 'Đề thi';
                    const subj = document.getElementById('exportWordSubject')?.value || 'TOÁN HỌC';
                    const grd = document.getElementById('exportWordGrade')?.value || '9';
                    const dur = parseInt(document.getElementById('exportWordDuration')?.value || 90);
                    const code = document.getElementById('exportWordExamCode')?.value || '101';
                    const cInfo = document.getElementById('exportWordCandidateInfo')?.checked !== false;

                    const hasDotted = document.getElementById('exportWordIncludeDottedLines')?.checked === true;
                    const dotCount = parseInt(document.getElementById('exportWordDottedCount')?.value || 4);
                    const dotScope = document.getElementById('exportWordDottedScope')?.value || 'essay_short';

                    const incTable = document.getElementById('exportWordIncludeAnswerTable')?.checked !== false;
                    const incCccd = document.getElementById('exportWordIncludeCccd')?.checked === true;

                    await exportExamToWord(fullExam, {
                        formulaMode: selectedFormulaMode,
                        mode: selectedMode,
                        headerStyle: hStyle,
                        agencyName: agency,
                        schoolName: sName,
                        examType: eType,
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
                            formulaMode: 'mathtype',
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
        LatexMtefCompiler,
        buildOleObject,
        buildWmf,
        parseLatexToOmml,
        parseLatexTabular,
        createDocxBlob,
        exportExamToWord,
        openExportWordModal,
        closeExportWordModal
    };

    window.openExportWordModal = openExportWordModal;
    window.closeExportWordModal = closeExportWordModal;
    window.exportExamToWord = exportExamToWord;

})(typeof window !== 'undefined' ? window : this);
