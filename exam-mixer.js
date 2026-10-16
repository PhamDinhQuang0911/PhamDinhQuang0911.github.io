/**
 * exam-mixer.js - Module Trộn Đề Thi Chuyên Nghiệp (LaTeX & Word DOCX)
 * Hỗ trợ đảo câu hỏi, đảo phương án, phân nhóm mức độ ID6, đồng bộ lời giải Đúng/Sai \itemch
 * Xuất trọn bộ đề thi (Word / LaTeX) kèm bảng ma trận đáp án Excel và đóng gói ZIP.
 * Logic tham chiếu chuẩn từ MixerEngine (1.9.0.5)
 */

(function(global) {
    'use strict';
    const window = global;

    // =======================================================
    // 1. CÁC HÀM TIỆN ÍCH LÀM SẠCH VÀ PHÂN TÍCH TEXT
    // =======================================================
    function parseOptionsSafely(text, maxOpts = 4) {
        const blocks = [];
        let cur = text.trimStart();
        let lastMatchEndInOriginal = 0;

        while (cur.startsWith('{') && blocks.length < maxOpts) {
            let count = 0;
            let endIdx = -1;
            for (let i = 0; i < cur.length; i++) {
                if (cur[i] === '{') count++;
                else if (cur[i] === '}') {
                    count--;
                    if (count === 0) {
                        endIdx = i;
                        break;
                    }
                }
            }
            if (endIdx !== -1) {
                blocks.push(cur.substring(0, endIdx + 1));
                const consumed = endIdx + 1;
                const textAfter = cur.substring(consumed);
                const spacesLen = textAfter.length - textAfter.trimStart().length;
                cur = textAfter.trimStart();
                lastMatchEndInOriginal += consumed + spacesLen;
            } else {
                break;
            }
        }
        return { blocks, lastIdx: lastMatchEndInOriginal };
    }

    function shuffleArray(arr) {
        const res = [...arr];
        for (let i = res.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [res[i], res[j]] = [res[j], res[i]];
        }
        return res;
    }

    // =======================================================
    // 2. BỘ PHÂN TÍCH VÀ ĐẢO PHƯƠNG ÁN (PORT TỪ MIXER_CORE.PY)
    // =======================================================
    const REGEX_ID6 = /\[\d[A-Z0-9][A-Z0-9][YBKGTNHVC][A-Z0-9]-[A-Z0-9]\]/i;

    function getAnswerChoice(exText) {
        const m = exText.match(/\\choice\s*(?:\[[^\]]*\])?\s*(\{[\s\S]*)/);
        if (!m) return "A";
        const { blocks } = parseOptionsSafely(m[1], 4);
        for (let i = 0; i < blocks.length; i++) {
            if (blocks[i].includes('\\True')) return String.fromCharCode(65 + i);
        }
        return "A";
    }

    function getAnswerChoiceTF(exText) {
        const m = exText.match(/\\choiceTF\s*(\{[\s\S]*)/);
        if (!m) return "SSSS";
        const { blocks } = parseOptionsSafely(m[1], 4);
        return blocks.map(b => (b.includes('\\True') ? 'Đ' : 'S')).join('');
    }

    function getAnswerShortRaw(exText) {
        const m = exText.match(/\\(?:shortans|SA)\s*(?:\[[^\]]*\])?\s*(\{[\s\S]*)/);
        if (m) {
            const { blocks } = parseOptionsSafely(m[1], 1);
            if (blocks && blocks.length > 0) {
                return blocks[0].trim().slice(1, -1);
            }
        }
        return "";
    }

    function cleanShortAnswer(rawAns) {
        if (!rawAns) return "";
        let s = String(rawAns).trim();
        s = s.replace(/<\/?(?:b|strong|i|em|span|p|div)\b[^>]*>/gi, '');
        s = s.replace(/\\(?:textbf|mathbf|text|mathrm|textrm|textit)\s*\{([^}]*)\}/gi, '$1');
        s = s.replace(/\\(?:textbf|mathbf|text|mathrm|textrm|textit)\b/gi, '');
        s = s.replace(/^\$+|\$+$/g, '').trim();
        s = s.replace(/\{([.,])\}/g, '$1');
        s = s.replace(/[\$\s\~]|\\,|\\;/g, '').replace(/\{,\}/g, ',').replace(/\./g, ',').trim();
        return s;
    }

    /**
     * Đảo phương án bên trong từng câu hỏi:
     * 1. \choiceTF: Đảo 4 mệnh đề và ĐỒNG BỘ đảo \itemch trong \begin{itemchoice}...\end{itemchoice}
     * 2. \choice: Đảo 4 phương án trắc nghiệm nhiều lựa chọn
     * Tôn trọng ký hiệu khóa ##
     */
    function shuffleOptionsInQuestion(exText) {
        // 1. Xử lý \choiceTF (Trắc nghiệm Đúng / Sai)
        const matchTf = exText.match(/(\\choiceTF\s*(?:\[[^\]]*\])?\s*)(\{[\s\S]*)/);
        if (matchTf) {
            const prefix = matchTf[1];
            const rest = matchTf[2];
            const { blocks: mainOps, lastIdx } = parseOptionsSafely(rest, 4);

            if (mainOps.length === 4) {
                const unlockedIdx = [0, 1, 2, 3].filter(i => !mainOps[i].includes("##"));
                const shuffledIdx = shuffleArray(unlockedIdx);

                const perm = [0, 1, 2, 3];
                for (let k = 0; k < unlockedIdx.length; k++) {
                    perm[unlockedIdx[k]] = shuffledIdx[k];
                }

                const newOps = [0, 1, 2, 3].map(i => mainOps[perm[i]].replace(/##/g, ""));
                const suffix = rest.substring(lastIdx);
                const tfReplaced = exText.substring(0, matchTf.index) + prefix + newOps.join('') + suffix;

                // Đồng bộ đảo \itemch trong lời giải \begin{itemchoice}...\end{itemchoice}
                const icMatch = tfReplaced.match(/(\\begin\{itemchoice\}(?:\[.*?\])?)([\s\S]*?)(\\end\{itemchoice\})/);
                if (icMatch) {
                    const icStart = icMatch[1];
                    const icInner = icMatch[2];
                    const icEnd = icMatch[3];

                    // Tách các mục theo \itemch
                    const parts = icInner.split(/(\\itemch(?![a-zA-Z]))/);
                    const header = parts[0] || '';
                    const items = [];
                    for (let k = 1; k < parts.length; k += 2) {
                        const cmd = parts[k];
                        const body = (k + 1 < parts.length) ? parts[k + 1] : '';
                        items.push(cmd + body);
                    }

                    if (items.length === 4) {
                        const newItems = [];
                        for (let i = 0; i < 4; i++) {
                            let itemContent = items[perm[i]];
                            const newLetter = String.fromCharCode(97 + i); // 'a', 'b', 'c', 'd'
                            itemContent = itemContent.replace(
                                /(\\itemch\s*(?:\\textbf\{)?)([a-d])([\)\.\}])/i,
                                (m, p1, p2, p3) => `${p1}${newLetter}${p3}`
                            );
                            newItems.push(itemContent);
                        }
                        const newIc = icStart + header + newItems.join('') + icEnd;
                        return tfReplaced.substring(0, icMatch.index) + newIc + tfReplaced.substring(icMatch.index + icMatch[0].length);
                    }
                }
                return tfReplaced;
            }
            return exText;
        }

        // 2. Xử lý \choice (Trắc nghiệm nhiều phương án)
        const matchCh = exText.match(/(\\choice\s*(?:\[[^\]]*\])?\s*)(\{[\s\S]*)/);
        if (!matchCh) return exText;

        const prefix = matchCh[1];
        const rest = matchCh[2];
        const { blocks: mainOps, lastIdx } = parseOptionsSafely(rest, 4);
        if (mainOps.length < 4) return exText;

        const suffix = rest.substring(lastIdx);
        const unlockedIdx = [0, 1, 2, 3].filter(i => !mainOps[i].includes("##"));
        const unlockedOps = unlockedIdx.map(i => mainOps[i]);
        const shuffledOps = shuffleArray(unlockedOps);

        const newOps = [...mainOps];
        for (let k = 0; k < unlockedIdx.length; k++) {
            newOps[unlockedIdx[k]] = shuffledOps[k];
        }
        const cleanedOps = newOps.map(op => op.replace(/##/g, ""));
        return exText.substring(0, matchCh.index) + prefix + cleanedOps.join('') + suffix;
    }

    /**
     * Đảo thứ tự câu hỏi thông minh theo phân nhóm mức độ nhận thức ID6
     */
    function smartShuffleQuestions(questionList, phanNhomMode = "Không phân nhóm") {
        if (!Array.isArray(questionList) || questionList.length <= 1) return questionList;

        const unlockedIndices = [];
        const unlockedItems = [];

        for (let i = 0; i < questionList.length; i++) {
            const item = questionList[i];
            const itemText = typeof item === 'object' ? (item.rawLatex || item.content || '') : String(item);
            if (!itemText.includes("##")) {
                unlockedIndices.push(i);
                unlockedItems.push(item);
            }
        }

        let shuffledItems = [];

        if (phanNhomMode === "Không phân nhóm") {
            shuffledItems = shuffleArray(unlockedItems);
        } else {
            // Phân 4 cấp độ: Biết (1), Hiểu (2), Vận dụng (3), Vận dụng cao (4)
            const groups = { 1: [], 2: [], 3: [], 4: [], 99: [] };

            for (const item of unlockedItems) {
                const itemText = typeof item === 'object' ? (item.rawLatex || item.content || '') : String(item);
                const match = itemText.match(REGEX_ID6);
                if (match) {
                    const tag = match[0];
                    const mucDo = tag[4] ? tag[4].toUpperCase() : '';
                    if (['N', 'Y', 'B'].includes(mucDo)) groups[1].push(item);
                    else if (['H', 'K'].includes(mucDo)) groups[2].push(item);
                    else if (['V', 'G'].includes(mucDo)) groups[3].push(item);
                    else if (['C', 'T'].includes(mucDo)) groups[4].push(item);
                    else groups[99].push(item);
                } else if (typeof item === 'object' && item.level) {
                    const lvl = item.level.toLowerCase();
                    if (lvl.includes('nhận biết') || lvl.includes('nb')) groups[1].push(item);
                    else if (lvl.includes('thông hiểu') || lvl.includes('th')) groups[2].push(item);
                    else if (lvl.includes('vận dụng cao') || lvl.includes('vdc')) groups[4].push(item);
                    else if (lvl.includes('vận dụng') || lvl.includes('vd')) groups[3].push(item);
                    else groups[99].push(item);
                } else {
                    groups[99].push(item);
                }
            }

            // Trộn ngẫu nhiên câu hỏi bên trong từng nhóm
            for (const k in groups) {
                groups[k] = shuffleArray(groups[k]);
            }

            // Lắp ráp thứ tự theo cấu hình
            if (phanNhomMode.includes("2 nhóm")) {
                const de = shuffleArray([...groups[1], ...groups[2]]);
                const kho = shuffleArray([...groups[3], ...groups[4]]);
                shuffledItems = [...de, ...kho, ...groups[99]];
            } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu < VD, VDC")) {
                const kho = shuffleArray([...groups[3], ...groups[4]]);
                shuffledItems = [...groups[1], ...groups[2], ...kho, ...groups[99]];
            } else if (phanNhomMode.includes("3 nhóm: Biết < Hiểu, VD < VDC")) {
                const tb = shuffleArray([...groups[2], ...groups[3]]);
                shuffledItems = [...groups[1], ...tb, ...groups[4], ...groups[99]];
            } else {
                // 4 nhóm mặc định
                shuffledItems = [...groups[1], ...groups[2], ...groups[3], ...groups[4], ...groups[99]];
            }
        }

        const result = [...questionList];
        for (let k = 0; k < unlockedIndices.length; k++) {
            result[unlockedIndices[k]] = shuffledItems[k];
        }

        // Xóa dấu khóa ## khi xuất ra đề thi
        return result.map(item => {
            if (typeof item === 'string') return item.replace(/##/g, "");
            return item;
        });
    }

    // =======================================================
    // 2.5. ĐỘNG CƠ TRỘN FILE WORD TRỰC TIẾP (DOCX DIRECT MIXER)
    // BẢO TOÀN 100% TOÀN BỘ CÔNG THỨC MATHTYPE OLE VÀ OMML
    // KHÔNG CHUYỂN QUA LATEX ĐỂ TRÁNH MẤT/HỎNG CÔNG THỨC
    // =======================================================
    class DocxDirectMixer {
        constructor(docxBuffer, config = {}) {
            this.docxBuffer = docxBuffer;
            this.config = {
                so_de: config.so_de || 4,
                ma_de_list: config.ma_de_list || ['1001', '1002', '1003', '1004'],
                dao_cau: config.dao_cau !== false,
                dao_pa: config.dao_pa !== false,
                dao_y_tf: config.dao_y_tf !== false,
                phannhom: config.phannhom || 'Không phân nhóm',
                header: config.header || {},
                ...config
            };
        }

        async mix(onProgress = () => {}) {
            onProgress(10, "Đang mở cấu trúc tệp Word DOCX gốc...");
            const srcZip = await JSZip.loadAsync(this.docxBuffer);
            this.srcZip = srcZip;

            // Đọc relationships từ word/_rels/document.xml.rels để liên kết OLE object
            this.relsMap = {};
            const relsFile = srcZip.file('word/_rels/document.xml.rels');
            if (relsFile) {
                const relsXml = await relsFile.async('text');
                const relMatches = relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g);
                for (const m of relMatches) {
                    this.relsMap[m[1]] = m[2];
                }
            }

            // Nạp trước dữ liệu binary của các file MathType OLE trong word/embeddings/
            this.oleDataMap = {};
            const embFiles = srcZip.file(/^word\/embeddings\//);
            for (const f of embFiles) {
                try {
                    this.oleDataMap[f.name] = await f.async('uint8array');
                } catch (e) {
                    console.warn("[Mixer] Không thể đọc OLE binary:", f.name, e);
                }
            }

            const docXml = await srcZip.file('word/document.xml').async('text');

            onProgress(15, "Đang phân tích cấu trúc các câu hỏi và công thức MathType...");
            const parsed = this.parseDocx(docXml);

            const maDeList = this.config.ma_de_list;
            const totalExams = maDeList.length;
            const outExams = {};
            const matrixData = [];

            // 1. Phân tích đáp án đề gốc
            const gocAnswers = this.extractExamAnswers(parsed.sections);
            matrixData.push({
                made: "GỐC",
                isGoc: true,
                p1: gocAnswers.p1,
                p2: gocAnswers.p2,
                p3: gocAnswers.p3,
                p3_raw: gocAnswers.p3
            });

            // 2. Tạo đề gốc De_Goc.docx (chuẩn hóa mã đề, gỡ gạch chân đáp án để phát cho học sinh)
            onProgress(22, "Đang tạo file Word Đề Gốc...");
            const gocDocXml = this.buildExamXml(parsed, {
                examCode: "GỐC",
                shuffleQuestions: false,
                shuffleOptions: false,
                keepUnderlines: false
            });
            const gocZip = await JSZip.loadAsync(this.docxBuffer);
            gocZip.file('word/document.xml', gocDocXml);
            outExams["De_Goc.docx"] = await gocZip.generateAsync({ type: 'uint8array' });

            // 3. Tạo file HuongDanGiai.docx (giữ nguyên vị trí đề gốc, giữ lại lời giải và gạch chân đáp án đúng)
            onProgress(26, "Đang tạo file Lời giải chi tiết Đề Gốc...");
            const hdgDocXml = this.buildExamXml(parsed, {
                examCode: "GỐC",
                shuffleQuestions: false,
                shuffleOptions: false,
                keepUnderlines: true,
                titleSuffix: " - HƯỚNG DẪN GIẢI"
            });
            const hdgZip = await JSZip.loadAsync(this.docxBuffer);
            hdgZip.file('word/document.xml', hdgDocXml);
            const huongDanGiai = await hdgZip.generateAsync({ type: 'uint8array' });

            // 4. Trộn từng mã đề thi con
            for (let idx = 0; idx < totalExams; idx++) {
                const maDe = maDeList[idx];
                const pct = 30 + Math.floor((idx / totalExams) * 45);
                onProgress(pct, `Đang trộn đề Word mã ${maDe} (${idx + 1}/${totalExams})...`);

                const mixed = this.buildMixedExam(parsed, maDe);
                const childZip = await JSZip.loadAsync(this.docxBuffer);
                childZip.file('word/document.xml', mixed.docXml);
                outExams[`De_${maDe}.docx`] = await childZip.generateAsync({ type: 'uint8array' });

                matrixData.push({
                    made: maDe,
                    isGoc: false,
                    p1: mixed.answers.p1,
                    p2: mixed.answers.p2,
                    p3: mixed.answers.p3,
                    p3_raw: mixed.answers.p3
                });
            }

            return {
                exams: outExams,
                huongDanGiai,
                matrixData,
                maDeList,
                totalQuestions: parsed.totalQuestions
            };
        }

        extractTextFromOleRId(rId) {
            if (!this.relsMap || !rId) return '';
            let target = this.relsMap[rId];
            if (!target) return '';
            if (!target.startsWith('word/')) target = 'word/' + target.replace(/^\//, '');
            const binBuf = this.oleDataMap ? this.oleDataMap[target] : null;
            if (!binBuf) return '';
            return this.extractTextFromOle(binBuf);
        }

        extractTextFromOle(binBuf) {
            if (!binBuf || binBuf.length === 0) return '';
            let mtefStart = -1;
            for (let i = 0; i < binBuf.length - 4; i++) {
                if (binBuf[i] === 0x05 && binBuf[i + 1] === 0x01) {
                    mtefStart = i;
                    break;
                }
            }
            if (mtefStart === -1) return '';

            let chars = '';
            let i = mtefStart;
            while (i < binBuf.length - 4) {
                if (binBuf[i] === 0x02) { // CHAR record
                    let cur = i + 1;
                    const opts = binBuf[cur++];
                    if (opts & 0x08) cur += 4; // nudge
                    const typeface = binBuf[cur++];
                    if (cur + 2 <= binBuf.length) {
                        const code = binBuf[cur] | (binBuf[cur + 1] << 8); // uint16 LE
                        cur += 2;
                        if (code >= 0x20 && code <= 0x7E) {
                            chars += String.fromCharCode(code);
                        } else if (code === 0x2212) { // unicode minus sign −
                            chars += '-';
                        }
                    }
                    i = cur;
                } else {
                    i++;
                }
            }
            return chars.trim();
        }

        hasUnderlineOrHighlight(xml) {
            if (!xml) return false;
            const hasU = /<w:u\b(?![^>]*w:val="none")[^>]*\/>|<w:u\b(?![^>]*w:val="none")[^>]*>[\s\S]*?<\/w:u>/i.test(xml);
            const hasH = /<w:highlight\b(?![^>]*w:val="none")[^>]*\/>|<w:highlight\b(?![^>]*w:val="none")[^>]*>[\s\S]*?<\/w:highlight>/i.test(xml);
            return hasU || hasH;
        }

        buildExamHeaderXml(examCode, titleSuffix = '') {
            const h = this.config.header || {};
            const meta = this.detectedHeaderMeta || {};
            const agency = (h.agency || meta.agency || 'SỞ GD&ĐT HÀ NỘI').trim();
            const school = (h.school || meta.school || 'TRƯỜNG THPT TRẦN QUANG KHẢI').trim();
            let title = (h.title || meta.title || 'KIỂM TRA HỌC KỲ I').trim();
            if (titleSuffix) title += titleSuffix;
            const examType = (h.examType || '(ĐỀ CHÍNH THỨC)').trim();
            const subject = (h.subject || meta.subject || 'TOÁN HỌC').trim();
            const grade = h.grade ? String(h.grade).trim() : (meta.grade || '');
            const duration = h.duration || meta.duration || 90;
            const cleanCode = String(examCode || '1001').trim();

            const escapeXml = (str) => {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
            };

            const gradeText = grade ? ` - KHỐI ${escapeXml(grade)}` : '';

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
                    <w:gridCol w:w="4400"/>
                    <w:gridCol w:w="6373"/>
                </w:tblGrid>
                <w:tr>
                    <!-- CỘT 1 (BÊN TRÁI: SỞ / TRƯỜNG / LOẠI ĐỀ) -->
                    <w:tc>
                        <w:tcPr><w:tcW w:w="4400" w:type="dxa"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="20"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(agency.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:u w:val="single"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(school.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="20"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(examType.toUpperCase())}</w:t></w:r>
                        </w:p>
                    </w:tc>
                    <!-- CỘT 2 (BÊN PHẢI: TÊN ĐỀ / MÔN / THỜI GIAN) -->
                    <w:tc>
                        <w:tcPr><w:tcW w:w="6373" w:type="dxa"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="20"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${escapeXml(title.toUpperCase())}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="20"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>MÔN THI: ${escapeXml(subject.toUpperCase())}${gradeText}</w:t></w:r>
                        </w:p>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:u w:val="single"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t>Thời gian làm bài: ${duration} phút, không kể thời gian phát đề</w:t></w:r>
                        </w:p>
                    </w:tc>
                </w:tr>
            </w:tbl>
            <!-- BẢNG KHUNG HỌ TÊN VÀ Ô MÃ ĐỀ ĐÓNG KHUNG -->
            <w:tbl>
                <w:tblPr>
                    <w:tblW w:w="10773" w:type="dxa"/>
                    <w:tblBorders>
                        <w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/>
                        <w:insideH w:val="none"/><w:insideV w:val="none"/>
                    </w:tblBorders>
                </w:tblPr>
                <w:tblGrid>
                    <w:gridCol w:w="8173"/>
                    <w:gridCol w:w="2600"/>
                </w:tblGrid>
                <w:tr>
                    <w:tc>
                        <w:tcPr><w:tcW w:w="8173" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
                        <w:p>
                            <w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
                                <w:t xml:space="preserve">Họ và tên thí sinh: .................................................... Số báo danh: ................</w:t>
                            </w:r>
                        </w:p>
                    </w:tc>
                    <w:tc>
                        <w:tcPr>
                            <w:tcW w:w="2600" w:type="dxa"/>
                            <w:tcBorders>
                                <w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>
                                <w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/>
                                <w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>
                                <w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/>
                            </w:tcBorders>
                            <w:vAlign w:val="center"/>
                        </w:tcPr>
                        <w:p>
                            <w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>
                            <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                                <w:t>Mã đề ${escapeXml(cleanCode)}</w:t>
                            </w:r>
                        </w:p>
                    </w:tc>
                </w:tr>
            </w:tbl>
            <w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr></w:p>`;
        }

        buildExamFooterXml() {
            return `
            <w:p>
                <w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="80"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
                    <w:t xml:space="preserve">------------------- HẾT -------------------</w:t>
                </w:r>
            </w:p>
            <w:p>
                <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="160"/></w:pPr>
                <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
                    <w:t>Thí sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm.</w:t>
                </w:r>
            </w:p>`;
        }

        parseDocx(docXml) {
            const bodyMatch = docXml.match(/([\s\S]*?<w:body>)([\s\S]*?)(<w:sectPr\b[\s\S]*?<\/w:body>[\s\S]*)/);
            if (!bodyMatch) throw new Error("Cấu trúc file Word không đúng chuẩn (không tìm thấy <w:body>)");

            const preBody = bodyMatch[1];
            const bodyContent = bodyMatch[2];
            const postBody = bodyMatch[3];

            const elementRegex = /<(w:p|w:tbl)\b[^>]*>[\s\S]*?<\/\1>/g;
            let match;
            const elements = [];
            while ((match = elementRegex.exec(bodyContent)) !== null) {
                const xml = match[0];
                const text = (xml.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || [])
                    .map(t => t.replace(/<[^>]+>/g, ''))
                    .join('');
                elements.push({ tag: match[1], xml, text });
            }

            const qStartRegex = /^(?:\[(?:NB|TH|VD|VDC|\w+)\]\s*)?(?:##\s*)?(?:Câu|Bài|Question)\s*(\d+)[:.\s]/i;
            const secStartRegex = /^\s*(?:PHẦN|Phần)\s+(I{1,3}|IV|[1-4])[:.\s]/i;

            const isEndOfExam = (text) => {
                const t = text.trim();
                if (!t) return false;
                if (/^[-_\s*~—–]*H(?:Ế|ế|E|e)T[-_\s*~—–]*$/i.test(t)) return true;
                if (/^(?:-{2,}|_{2,}|\*{2,})\s*H(?:Ế|ế|E|e)T\s*(?:-{2,}|_{2,}|\*{2,})$/i.test(t)) return true;
                if (/^\(?\s*H(?:Ế|ế|E|e)T\s*\)?$/i.test(t)) return true;
                if (/^\s*(?:HẾT|Hết)\s*[\.\-—–]*\s*(?:Thí\s*sinh|Cán\s*bộ|Giám\s*thị)/i.test(t)) return true;
                return false;
            };

            let firstContentIdx = elements.findIndex(e => qStartRegex.test(e.text.trim()) || secStartRegex.test(e.text.trim()));
            if (firstContentIdx === -1) firstContentIdx = 0;

            const headerElements = elements.slice(0, firstContentIdx);
            const rawMainElements = elements.slice(firstContentIdx);

            // Trích xuất metadata từ header cũ nếu có để làm giá trị mặc định cho tiêu đề mới
            const meta = {};
            headerElements.forEach(e => {
                const t = e.text.trim();
                if (/SỞ\s+GD|PHÒNG\s+GD|BỘ\s+GD/i.test(t)) {
                    const m = t.match(/((?:SỞ|PHÒNG|BỘ)\s+GD[^\n\r]+)/i);
                    if (m && !meta.agency) meta.agency = m[1].trim();
                }
                if (/TRƯỜNG\s+THPT|TRƯỜNG\s+THCS|TRƯỜNG\s+TIỂU\s+HỌC/i.test(t)) {
                    const m = t.match(/(TRƯỜNG\s+(?:THPT|THCS|TIỂU\s+HỌC)[^\n\r]+)/i);
                    if (m && !meta.school) meta.school = m[1].trim();
                }
                if (/MÔN(?:\s+THI)?\s*[:\s]*([^\n\r\-–]+)/i.test(t)) {
                    const m = t.match(/MÔN(?:\s+THI)?\s*[:\s]*([^\n\r\-–]+)/i);
                    if (m && !meta.subject) meta.subject = m[1].trim();
                }
                if (/Thời\s*gian\s*(?:làm\s*bài)?\s*[:\s]*(\d+)\s*phút/i.test(t)) {
                    const m = t.match(/Thời\s*gian\s*(?:làm\s*bài)?\s*[:\s]*(\d+)\s*phút/i);
                    if (m && !meta.duration) meta.duration = parseInt(m[1], 10);
                }
            });
            this.detectedHeaderMeta = meta;

            // Tách các phần tử sau chữ HẾT vào footerElements (không trộn vào câu hỏi)
            const mainElements = [];
            const footerElements = [];
            let examEnded = false;

            for (const el of rawMainElements) {
                const trimmed = el.text.trim();
                if (examEnded) {
                    footerElements.push(el);
                    continue;
                }
                if (isEndOfExam(trimmed)) {
                    examEnded = true;
                    footerElements.push(el);
                    continue;
                }
                mainElements.push(el);
            }

            const sections = [];
            let currentSec = { titleEl: null, questions: [] };
            sections.push(currentSec);

            let currentQ = null;
            let qCounter = 0;

            for (const el of mainElements) {
                const trimmed = el.text.trim();

                if (secStartRegex.test(trimmed)) {
                    if (currentQ) {
                        currentSec.questions.push(currentQ);
                        currentQ = null;
                    }
                    currentSec = { titleEl: el, questions: [] };
                    sections.push(currentSec);
                    continue;
                }

                if (qStartRegex.test(trimmed)) {
                    if (currentQ) {
                        currentSec.questions.push(currentQ);
                    }
                    qCounter++;
                    currentQ = {
                        id: qCounter,
                        originalNum: (trimmed.match(qStartRegex) || [])[1] || qCounter,
                        elements: [el],
                        type: 'choice',
                        isLocked: trimmed.includes('##')
                    };
                } else if (currentQ) {
                    currentQ.elements.push(el);
                } else {
                    if (!currentSec.introElements) currentSec.introElements = [];
                    currentSec.introElements.push(el);
                }
            }
            if (currentQ) currentSec.questions.push(currentQ);

            // Xóa section rỗng đầu tiên nếu không có câu hỏi và không có tiêu đề
            if (sections.length > 1 && sections[0].questions.length === 0 && !sections[0].titleEl) {
                sections.shift();
            }

            // Chuẩn hóa tiêu đề các Phần theo chuẩn Bộ GD&ĐT 2025 (Chữ màu đen, 1 dòng, in đậm toàn bộ)
            const hasMultipleSections = sections.length > 1;
            if (hasMultipleSections) {
                if (!sections[0].titleEl && sections[1] && sections[1].titleEl && /PHẦN\s+(?:II|2)/i.test(sections[1].titleEl.text)) {
                    const p1Count = sections[0].questions.length;
                    const p1Text = `PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu ${p1Count}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`;
                    const p1Xml = `<w:p><w:pPr><w:spacing w:before="240" w:after="80" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${p1Text}</w:t></w:r></w:p>`;
                    sections[0].titleEl = { tag: 'w:p', xml: p1Xml, text: p1Text };
                }

                sections.forEach((sec, sIdx) => {
                    if (!sec.titleEl) {
                        if (sIdx === 0) sec.part = 'choice';
                        return;
                    }
                    const tText = sec.titleEl.text.trim();
                    const qCount = sec.questions.length;
                    let normText = '';
                    if (/PHẦN\s+(?:I\b|1\b)|Nhiều\s*phương\s*án/i.test(tText)) {
                        sec.part = 'choice';
                        normText = `PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu ${qCount}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`;
                    } else if (/PHẦN\s+(?:II\b|2\b)|Đúng\s*Sai/i.test(tText)) {
                        sec.part = 'tf';
                        normText = `PHẦN II. Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu ${qCount}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`;
                    } else if (/PHẦN\s+(?:III\b|3\b)|Trả\s*lời\s*ngắn/i.test(tText)) {
                        sec.part = 'short';
                        normText = `PHẦN III. Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu ${qCount}.`;
                    } else if (/PHẦN\s+(?:IV\b|4\b)|Tự\s*luận/i.test(tText)) {
                        sec.part = 'essay';
                        normText = `PHẦN IV. Tự luận. Thí sinh trình bày chi tiết lời giải từ câu 1 đến câu ${qCount}.`;
                    }

                    if (normText) {
                        sec.titleEl.xml = `<w:p><w:pPr><w:spacing w:before="240" w:after="80" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${normText}</w:t></w:r></w:p>`;
                        sec.titleEl.text = normText;
                    } else {
                        sec.titleEl.xml = sec.titleEl.xml.replace(/<w:color\b[^>]*\/>/g, '').replace(/<w:color\b[^>]*>[\s\S]*?<\/w:color>/g, '');
                    }
                });
            }

            let totalQ = 0;
            sections.forEach(sec => {
                sec.questions.forEach(q => {
                    totalQ++;
                    this.analyzeQuestion(q, sec);
                });
            });

            return { preBody, headerElements, sections, footerElements, postBody, totalQuestions: totalQ };
        }

        analyzeQuestion(q, sec = null) {
            const fullText = q.elements.map(e => e.text).join('\n');
            const isSecTf = sec && (sec.part === 'tf' || /PHẦN\s+(?:II\b|2\b)|Đúng\s*Sai/i.test(sec.titleEl ? sec.titleEl.text : ''));
            const isSecShort = sec && (sec.part === 'short' || /PHẦN\s+(?:III\b|3\b)|Trả\s*lời\s*ngắn/i.test(sec.titleEl ? sec.titleEl.text : ''));
            const isSecChoice = sec && (sec.part === 'choice' || /PHẦN\s+(?:I\b|1\b)|Nhiều\s*phương\s*án/i.test(sec.titleEl ? sec.titleEl.text : ''));

            // 1. Kiểm tra câu trắc nghiệm Đúng / Sai (Part II)
            // Phát hiện các ý a), b), c), d) - chú ý chữ cái thường [a-d] theo chuẩn Bộ GD&ĐT
            const abcdStmts = [];
            q.elements.forEach((el, idx) => {
                const tr = el.text.trim();
                const m = tr.match(/^([a-d])\s*\)\s*(.*)/);
                if (m) {
                    abcdStmts.push({ elIdx: idx, letter: m[1].toLowerCase(), content: m[2], el });
                }
            });
            const tfLetters = new Set(abcdStmts.map(s => s.letter));
            const hasAll4Tf = tfLetters.has('a') && tfLetters.has('b') && tfLetters.has('c') && tfLetters.has('d');

            if (isSecTf || hasAll4Tf) {
                if (abcdStmts.length >= 4) {
                    q.type = 'tf';
                    q.tfStatements = [];
                    q.correctTf = {};
                    abcdStmts.forEach(stmt => {
                        const letter = stmt.letter;
                        q.tfStatements.push({ elIdx: stmt.elIdx, letter });
                        const content = stmt.content;
                        const valMatch = content.match(/(?:[-–:]|\s+)\((Đúng|Sai|Đ|S)\)\s*$/i) || 
                                         content.match(/(?:[-–:]|\s+)(ĐÚNG|SAI)\s*$/i) ||
                                         content.match(/\((Đúng|Sai|Đ|S)\)/i);
                        if (valMatch) {
                            q.correctTf[letter] = valMatch[1].toUpperCase().startsWith('Đ') ? 'Đ' : 'S';
                        } else if (this.hasUnderlineOrHighlight(stmt.el.xml)) {
                            // Gạch chân hoặc highlight -> ĐÚNG
                            q.correctTf[letter] = 'Đ';
                        } else {
                            // Không gạch chân -> SAI
                            q.correctTf[letter] = 'S';
                        }
                    });
                    return;
                }
            }

            // 2. Kiểm tra câu trắc nghiệm 4 phương án A, B, C, D (Part I)
            let optType = null;
            let optElIdx = -1;

            if (!isSecShort) {
                q.elements.forEach((el, idx) => {
                    if (el.tag === 'w:tbl') {
                        const cells = el.xml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
                        const cellTexts = cells.map(c => (c.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join(''));
                        if (cellTexts.some(t => /^\s*A\./.test(t)) && cellTexts.some(t => /^\s*B\./.test(t))) {
                            optType = 'table';
                            optElIdx = idx;
                        }
                    } else if (el.tag === 'w:p') {
                        const t = el.text;
                        if (/A\..*?B\..*?C\..*?D\./.test(t)) {
                            optType = 'single_para';
                            optElIdx = idx;
                        }
                    }
                });

                if (!optType) {
                    for (let i = 0; i <= q.elements.length - 4; i++) {
                        const t0 = q.elements[i].text.trim();
                        const t1 = q.elements[i+1].text.trim();
                        const t2 = q.elements[i+2].text.trim();
                        const t3 = q.elements[i+3].text.trim();
                        if (/^A\./.test(t0) && /^B\./.test(t1) && /^C\./.test(t2) && /^D\./.test(t3)) {
                            optType = '4_paras';
                            optElIdx = i;
                            break;
                        }
                    }
                }
            }

            if (optType && !isSecShort) {
                q.type = 'choice';
                q.optType = optType;
                q.optElIdx = optElIdx;
                q.correctAnswer = this.detectOriginalAnswer(q);
            } else {
                // 3. Câu trả lời ngắn (Part III)
                q.type = 'short';
                let rawAns = '';
                for (const el of q.elements) {
                    const tr = el.text.trim();
                    const isDaLine = /^\s*(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=]/i.test(tr);
                    if (isDaLine) {
                        const m = tr.match(/^(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=]\s*([^\r\n]+)/i);
                        if (m) {
                            const cand = m[1].trim();
                            if (cand && !/^(?:Lời\s*giải|HDG|Hướng\s*dẫn)/i.test(cand)) {
                                rawAns = cand;
                                break;
                            }
                        }
                        if (/<o:OLEObject\b/i.test(el.xml)) {
                            const oleMatch = el.xml.match(/<o:OLEObject\b[^>]*r:id="([^"]+)"/i);
                            if (oleMatch) {
                                const ext = this.extractTextFromOleRId(oleMatch[1]);
                                if (ext) { rawAns = ext; break; }
                            }
                        }
                    }
                }

                if (!rawAns) {
                    const dsMatch = fullText.match(/(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)[^\S\r\n]*[:=][^\S\r\n]*([^\r\n]+)/i);
                    if (dsMatch) {
                        const cand = dsMatch[1].trim();
                        if (!/^(?:Lời\s*giải|HDG|Hướng\s*dẫn)/i.test(cand)) {
                            rawAns = cand;
                        }
                    }
                }
                q.correctAnswer = cleanShortAnswer(rawAns);
            }
        }

        detectOriginalAnswer(q) {
            if (q.optType === 'table') {
                const tblXml = q.elements[q.optElIdx].xml;
                const cells = tblXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
                for (let i = 0; i < cells.length; i++) {
                    if (this.hasUnderlineOrHighlight(cells[i])) {
                        return ['A', 'B', 'C', 'D'][i] || 'A';
                    }
                }
            } else if (q.optType === 'single_para') {
                const pXml = q.elements[q.optElIdx].xml;
                const runRegex = /<w:r\b[\s\S]*?<\/w:r>/g;
                const runs = pXml.match(runRegex) || [];
                let currentBucket = -1;
                for (const r of runs) {
                    const text = (r.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
                    const optMatch = text.match(/^([A-D])\s*[.:]/) || (r.includes('<w:b/>') && text.match(/^([A-D])$/));
                    if (optMatch) {
                        currentBucket = optMatch[1].toUpperCase().charCodeAt(0) - 65;
                    }
                    if (currentBucket >= 0 && currentBucket <= 3 && this.hasUnderlineOrHighlight(r)) {
                        return ['A', 'B', 'C', 'D'][currentBucket];
                    }
                }
            } else if (q.optType === '4_paras') {
                for (let i = 0; i < 4; i++) {
                    const pXml = q.elements[q.optElIdx + i].xml;
                    if (this.hasUnderlineOrHighlight(pXml)) {
                        return ['A', 'B', 'C', 'D'][i];
                    }
                }
            }

            const fullText = q.elements.map(e => e.text).join(' ');
            const chonMatch = fullText.match(/Chọn\s+([A-D])/i);
            if (chonMatch) return chonMatch[1].toUpperCase();

            return 'A';
        }

        extractExamAnswers(sections) {
            const p1 = [];
            const p2 = [];
            const p3 = [];
            sections.forEach(sec => {
                sec.questions.forEach(q => {
                    if (q.type === 'choice') {
                        p1.push(q.correctAnswer || 'A');
                    } else if (q.type === 'tf') {
                        const tfStr = ['a', 'b', 'c', 'd'].map(k => (q.correctTf && q.correctTf[k]) || 'Đ').join('');
                        p2.push(tfStr);
                    } else {
                        p3.push(q.correctAnswer || '');
                    }
                });
            });
            return { p1, p2, p3 };
        }

        buildMixedExam(parsed, maDe) {
            let globalQIndex = 0;
            const answers = { p1: [], p2: [], p3: [] };
            const mixedSectionsXml = [];
            const hasMultipleSections = parsed.sections.length > 1;

            for (const sec of parsed.sections) {
                if (sec.titleEl) mixedSectionsXml.push(sec.titleEl.xml);
                if (sec.introElements) sec.introElements.forEach(e => mixedSectionsXml.push(e.xml));

                let questionsToProcess = [...sec.questions];
                if (this.config.dao_cau) {
                    const lockedPositions = [];
                    const movable = [];
                    questionsToProcess.forEach((q, idx) => {
                        if (q.isLocked) lockedPositions.push({ idx, q });
                        else movable.push(q);
                    });
                    const shuffled = this.shuffleArray(movable);
                    const finalOrder = [];
                    let movIdx = 0;
                    for (let i = 0; i < questionsToProcess.length; i++) {
                        const locked = lockedPositions.find(p => p.idx === i);
                        if (locked) finalOrder.push(locked.q);
                        else finalOrder.push(shuffled[movIdx++]);
                    }
                    questionsToProcess = finalOrder;
                }

                let secQIndex = 0;
                for (const q of questionsToProcess) {
                    secQIndex++;
                    globalQIndex++;
                    const newQNum = hasMultipleSections ? secQIndex : globalQIndex;
                    const mixedQXml = this.renderMixedQuestion(q, newQNum, answers, false);
                    mixedSectionsXml.push(mixedQXml);
                }
            }

            // Tạo khung tiêu đề mới hoàn toàn, loại bỏ khung tiêu đề cũ để không bao giờ bị lặp mã đề
            const headerXml = this.buildExamHeaderXml(maDe);
            const footerXml = this.buildExamFooterXml();

            let fullMixedDocXml = parsed.preBody + headerXml + mixedSectionsXml.join('') + footerXml + parsed.postBody;
            // Xóa triệt để mọi thẻ gạch chân và highlight còn sót lại trong đề thi của học sinh
            fullMixedDocXml = fullMixedDocXml.replace(/<w:u\b[^>]*\/>/gi, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/gi, '');
            fullMixedDocXml = fullMixedDocXml.replace(/<w:highlight\b[^>]*\/>/gi, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/gi, '');

            return {
                docXml: fullMixedDocXml,
                answers
            };
        }

        renderMixedQuestion(q, newQNum, answersAccumulator, keepUnderlines = false) {
            let qElements = q.elements.map(e => ({ ...e }));

            // Khi xuất đề thi cho học sinh (!keepUnderlines):
            // 1. Cắt bỏ hoàn toàn từ phần Lời giải trở đi (cho mọi câu hỏi kể cả câu trả lời ngắn)
            // 2. Cắt bỏ hoàn toàn các paragraph/element chứa Đáp án / Đáp số / ĐS / Kết quả
            // 3. Nếu cụm Đáp án/Đáp số nằm ở cuối một paragraph câu hỏi, cắt bỏ khỏi XML
            if (!keepUnderlines) {
                let solStartIdx = -1;
                for (let i = 0; i < qElements.length; i++) {
                    const tr = qElements[i].text.trim();
                    if (/^(?:Lời\s*giải|Hướng\s*dẫn\s*giải|HDG)[:.\s]/i.test(tr) || /^Lời\s*giải\b/i.test(tr)) {
                        solStartIdx = i;
                        break;
                    }
                }

                if (solStartIdx !== -1) {
                    qElements = qElements.slice(0, solStartIdx);
                }

                // Lọc bỏ triệt để các phần tử/paragraph chứa đáp án/đáp số trong đề học sinh
                qElements = qElements.filter(e => {
                    const tr = (e.text || '').trim();
                    return !/^\s*(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=.]/i.test(tr) &&
                           !/^\s*(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\b/i.test(tr);
                });

                // Cắt bỏ cụm đáp án nếu vô tình nằm ở cuối paragraph câu hỏi
                qElements.forEach(e => {
                    if (/(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=.]/i.test(e.text || '')) {
                        e.xml = e.xml.replace(/(<w:t\b[^>]*>)([\s\S]*?)(?:[-–•*]\s*)?(?:Đáp\s*án|Đáp\s*số|ĐS|Kết\s*quả)\s*[:=.][\s\S]*?(<\/w:t>)/gi, '$1$2$3');
                    }
                });

                // Xóa triệt để toàn bộ thẻ gạch chân <w:u> và <w:highlight> khỏi mọi phần tử của câu hỏi trong đề học sinh
                qElements.forEach(e => {
                    if (e.xml) {
                        e.xml = e.xml.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                        e.xml = e.xml.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                    }
                });
            }

            let firstXml = qElements[0].xml;
            if (/(<w:t\b[^>]*>)(?:\[(?:NB|TH|VD|VDC|\w+)\]\s*)?(?:##\s*)?(?:Câu|Bài|Question)\s*\d+([:.\s(])/i.test(firstXml)) {
                firstXml = firstXml.replace(
                    /(<w:t\b[^>]*>)(?:\[(?:NB|TH|VD|VDC|\w+)\]\s*)?(?:##\s*)?(?:Câu|Bài|Question)\s*\d+([:.\s(])/i,
                    `$1Câu ${newQNum}: `
                );
            } else {
                firstXml = firstXml.replace(/(<w:t\b[^>]*>)\s*\d+([:.\s(])/, `$1${newQNum}: `);
            }
            firstXml = firstXml.replace(/(<w:t\b[^>]*>)##\s*/i, '$1');
            qElements[0].xml = firstXml;

            if (q.type === 'choice') {
                let perm = [0, 1, 2, 3];
                if (this.config.dao_pa) {
                    perm = this.shuffleArray([0, 1, 2, 3]);
                }

                const origLetter = q.correctAnswer || 'A';
                const origIdx = origLetter.charCodeAt(0) - 65;
                const newAnsIdx = perm.indexOf(origIdx);
                const newLetter = ['A', 'B', 'C', 'D'][newAnsIdx !== -1 ? newAnsIdx : 0];
                if (answersAccumulator && answersAccumulator.p1) {
                    answersAccumulator.p1.push(newLetter);
                }

                if (q.optType === 'table') {
                    const targetEl = qElements[q.optElIdx];
                    if (targetEl) targetEl.xml = this.permuteTableCells(targetEl.xml, perm, keepUnderlines);
                } else if (q.optType === 'single_para') {
                    const targetEl = qElements[q.optElIdx];
                    if (targetEl) targetEl.xml = this.permuteSingleParaRuns(targetEl.xml, perm, keepUnderlines);
                } else if (q.optType === '4_paras') {
                    const paras = [
                        qElements[q.optElIdx],
                        qElements[q.optElIdx + 1],
                        qElements[q.optElIdx + 2],
                        qElements[q.optElIdx + 3]
                    ].filter(Boolean);
                    if (paras.length === 4) {
                        const labels = ['A', 'B', 'C', 'D'];
                        const reordered = [];
                        for (let i = 0; i < 4; i++) {
                            const oldP = paras[perm[i]];
                            let pXml = oldP.xml;
                            if (!keepUnderlines) {
                                pXml = pXml.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                                pXml = pXml.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                            }
                            pXml = pXml.replace(/(<w:t\b[^>]*>)\s*([A-D])\s*([.:])/, `$1${labels[i]}$3`);
                            reordered.push({ ...oldP, xml: pXml });
                        }
                        for (let i = 0; i < 4; i++) {
                            qElements[q.optElIdx + i] = reordered[i];
                        }
                    }
                }

                qElements.forEach(e => {
                    if (e.text.includes('Chọn ')) {
                        e.xml = e.xml.replace(/(Chọn\s+)[A-D]/g, `$1${newLetter}`);
                    }
                });

            } else if (q.type === 'tf') {
                let perm = [0, 1, 2, 3];
                if (this.config.dao_y_tf && q.tfStatements && q.tfStatements.length === 4) {
                    perm = this.shuffleArray([0, 1, 2, 3]);
                    const oldStatements = q.tfStatements.map(s => qElements[s.elIdx]).filter(Boolean);
                    if (oldStatements.length === 4) {
                        const tfLabels = ['a', 'b', 'c', 'd'];
                        const newTfAnswers = {};
                        for (let i = 0; i < 4; i++) {
                            const srcStmtIdx = perm[i];
                            const origLetter = q.tfStatements[srcStmtIdx].letter;
                            const origAns = (q.correctTf && q.correctTf[origLetter]) || 'Đ';
                            const targetLetter = tfLabels[i];
                            newTfAnswers[targetLetter] = origAns;

                            const origEl = oldStatements[srcStmtIdx];
                            let elXml = origEl.xml;
                            if (!keepUnderlines) {
                                elXml = elXml.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                                elXml = elXml.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                            }
                            elXml = elXml.replace(/(<w:t\b[^>]*>)\s*([a-d])\s*([.)])/i, `$1${targetLetter}$3`);
                            qElements[q.tfStatements[i].elIdx] = { ...origEl, xml: elXml };
                        }
                        const tfStr = ['a', 'b', 'c', 'd'].map(k => newTfAnswers[k] || 'Đ').join('');
                        if (answersAccumulator && answersAccumulator.p2) {
                            answersAccumulator.p2.push(tfStr);
                        }
                    } else {
                        const tfStr = ['a', 'b', 'c', 'd'].map(k => (q.correctTf && q.correctTf[k]) || 'Đ').join('');
                        if (answersAccumulator && answersAccumulator.p2) {
                            answersAccumulator.p2.push(tfStr);
                        }
                    }
                } else {
                    const tfStr = ['a', 'b', 'c', 'd'].map(k => (q.correctTf && q.correctTf[k]) || 'Đ').join('');
                    if (answersAccumulator && answersAccumulator.p2) {
                        answersAccumulator.p2.push(tfStr);
                    }
                    if (!keepUnderlines && q.tfStatements) {
                        q.tfStatements.forEach(s => {
                            if (qElements[s.elIdx]) {
                                let x = qElements[s.elIdx].xml;
                                x = x.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                                x = x.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                                qElements[s.elIdx].xml = x;
                            }
                        });
                    }
                }
            } else {
                if (answersAccumulator && answersAccumulator.p3) {
                    answersAccumulator.p3.push(q.correctAnswer || '');
                }
            }

            if (!keepUnderlines) {
                return qElements.map(e => {
                    let x = e.xml || '';
                    return x.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '')
                            .replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                }).join('');
            }

            return qElements.map(e => e.xml).join('');
        }

        permuteTableCells(tblXml, perm, keepUnderlines = false) {
            const tcRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
            const cells = tblXml.match(tcRegex) || [];
            if (cells.length !== 4) return tblXml;

            const labels = ['A', 'B', 'C', 'D'];
            const newCells = [];
            for (let i = 0; i < 4; i++) {
                let cXml = cells[perm[i]];
                if (!keepUnderlines) {
                    cXml = cXml.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                    cXml = cXml.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                }
                cXml = cXml.replace(/(<w:t\b[^>]*>)\s*([A-D])\s*([.:])/, `$1${labels[i]}$3`);
                newCells.push(cXml);
            }
            let cIdx = 0;
            return tblXml.replace(tcRegex, () => newCells[cIdx++]);
        }

        permuteSingleParaRuns(pXml, perm, keepUnderlines = false) {
            const pPrMatch = pXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/);
            const pPr = pPrMatch ? pPrMatch[0] : '';
            const insideP = pXml.replace(/<w:p\b[^>]*>/, '').replace(/<\/w:p>$/, '').replace(pPr, '');

            const runRegex = /<w:r\b[\s\S]*?<\/w:r>/g;
            const runs = insideP.match(runRegex) || [];
            if (runs.length === 0) return pXml;

            const buckets = [[], [], [], []];
            let currentBucket = -1;

            runs.forEach(r => {
                const text = (r.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('').trim();
                const optMatch = text.match(/^([A-D])\s*[.:]/) || (r.includes('<w:b/>') && text.match(/^([A-D])$/));
                if (optMatch) {
                    currentBucket = optMatch[1].toUpperCase().charCodeAt(0) - 65;
                }
                if (currentBucket >= 0 && currentBucket <= 3) {
                    buckets[currentBucket].push(r);
                }
            });

            if (buckets.some(b => b.length === 0)) return pXml;

            const labels = ['A', 'B', 'C', 'D'];
            const newRuns = [];

            for (let i = 0; i < 4; i++) {
                const bucketRuns = [...buckets[perm[i]]];
                let labelUpdated = false;
                const processed = bucketRuns.map(r => {
                    let rXml = r;
                    if (!keepUnderlines) {
                        rXml = rXml.replace(/<w:u\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/g, '');
                        rXml = rXml.replace(/<w:highlight\b[^>]*\/>/g, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/g, '');
                    }
                    if (!labelUpdated && /<w:t\b[^>]*>[\s\S]*?[A-D][.:\s]/.test(rXml)) {
                        rXml = rXml.replace(/(<w:t\b[^>]*>)\s*([A-D])\s*([.:])/, `$1${labels[i]}$3`);
                        labelUpdated = true;
                    } else if (!labelUpdated && /<w:t\b[^>]*>[A-D]<\/w:t>/.test(rXml)) {
                        rXml = rXml.replace(/(<w:t\b[^>]*>)[A-D](<\/w:t>)/, `$1${labels[i]}$2`);
                        labelUpdated = true;
                    }
                    return rXml;
                });

                const clean = processed.filter(r => !r.includes('<w:tab/>') && !r.includes('<w:tab '));
                newRuns.push(...clean);
                if (i < 3) {
                    newRuns.push('<w:r><w:tab/></w:r>');
                }
            }

            const pTagMatch = pXml.match(/<w:p\b[^>]*>/);
            const pTag = pTagMatch ? pTagMatch[0] : '<w:p>';
            return `${pTag}${pPr}${newRuns.join('')}</w:p>`;
        }

        buildExamXml(parsed, options = {}) {
            let globalQIndex = 0;
            const sectionsXml = [];
            const hasMultipleSections = parsed.sections.length > 1;

            for (const sec of parsed.sections) {
                if (sec.titleEl) sectionsXml.push(sec.titleEl.xml);
                if (sec.introElements) sec.introElements.forEach(e => sectionsXml.push(e.xml));

                let secQIndex = 0;
                for (const q of sec.questions) {
                    secQIndex++;
                    globalQIndex++;
                    const newQNum = hasMultipleSections ? secQIndex : globalQIndex;
                    sectionsXml.push(this.renderMixedQuestion(q, newQNum, null, options.keepUnderlines));
                }
            }

            // Tạo khung tiêu đề mới hoàn toàn, loại bỏ khung tiêu đề cũ
            const headerXml = this.buildExamHeaderXml(options.examCode || 'GỐC', options.titleSuffix || '');
            const footerXml = (options.keepUnderlines && parsed.footerElements && parsed.footerElements.length > 0)
                ? parsed.footerElements.map(e => e.xml).join('')
                : this.buildExamFooterXml();

            let docXml = parsed.preBody + headerXml + sectionsXml.join('') + footerXml + parsed.postBody;
            if (!options.keepUnderlines) {
                docXml = docXml.replace(/<w:u\b[^>]*\/>/gi, '').replace(/<w:u\b[^>]*>[\s\S]*?<\/w:u>/gi, '');
                docXml = docXml.replace(/<w:highlight\b[^>]*\/>/gi, '').replace(/<w:highlight\b[^>]*>[\s\S]*?<\/w:highlight>/gi, '');
            }
            return docXml;
        }

        shuffleArray(arr) {
            const a = [...arr];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }
    }

    // =======================================================
    // THƯ VIỆN QRCODEJS TÍCH HỢP SẴN (OFFLINE 100%)
    // =======================================================
    const QRCODE_MIN_JS = "var QRCode;!function(){function a(a){this.mode=c.MODE_8BIT_BYTE,this.data=a,this.parsedData=[];for(var b=[],d=0,e=this.data.length;e>d;d++){var f=this.data.charCodeAt(d);f>65536?(b[0]=240|(1835008&f)>>>18,b[1]=128|(258048&f)>>>12,b[2]=128|(4032&f)>>>6,b[3]=128|63&f):f>2048?(b[0]=224|(61440&f)>>>12,b[1]=128|(4032&f)>>>6,b[2]=128|63&f):f>128?(b[0]=192|(1984&f)>>>6,b[1]=128|63&f):b[0]=f,this.parsedData=this.parsedData.concat(b)}this.parsedData.length!=this.data.length&&(this.parsedData.unshift(191),this.parsedData.unshift(187),this.parsedData.unshift(239))}function b(a,b){this.typeNumber=a,this.errorCorrectLevel=b,this.modules=null,this.moduleCount=0,this.dataCache=null,this.dataList=[]}function i(a,b){if(void 0==a.length)throw new Error(a.length+\"/\"+b);for(var c=0;c<a.length&&0==a[c];)c++;this.num=new Array(a.length-c+b);for(var d=0;d<a.length-c;d++)this.num[d]=a[d+c]}function j(a,b){this.totalCount=a,this.dataCount=b}function k(){this.buffer=[],this.length=0}function m(){return\"undefined\"!=typeof CanvasRenderingContext2D}function n(){var a=!1,b=navigator.userAgent;return/android/i.test(b)&&(a=!0,aMat=b.toString().match(/android ([0-9]\\.[0-9])/i),aMat&&aMat[1]&&(a=parseFloat(aMat[1]))),a}function r(a,b){for(var c=1,e=s(a),f=0,g=l.length;g>=f;f++){var h=0;switch(b){case d.L:h=l[f][0];break;case d.M:h=l[f][1];break;case d.Q:h=l[f][2];break;case d.H:h=l[f][3]}if(h>=e)break;c++}if(c>l.length)throw new Error(\"Too long data\");return c}function s(a){var b=encodeURI(a).toString().replace(/\\%[0-9a-fA-F]{2}/g,\"a\");return b.length+(b.length!=a?3:0)}a.prototype={getLength:function(){return this.parsedData.length},write:function(a){for(var b=0,c=this.parsedData.length;c>b;b++)a.put(this.parsedData[b],8)}},b.prototype={addData:function(b){var c=new a(b);this.dataList.push(c),this.dataCache=null},isDark:function(a,b){if(0>a||this.moduleCount<=a||0>b||this.moduleCount<=b)throw new Error(a+\",\"+b);return this.modules[a][b]},getModuleCount:function(){return this.moduleCount},make:function(){this.makeImpl(!1,this.getBestMaskPattern())},makeImpl:function(a,c){this.moduleCount=4*this.typeNumber+17,this.modules=new Array(this.moduleCount);for(var d=0;d<this.moduleCount;d++){this.modules[d]=new Array(this.moduleCount);for(var e=0;e<this.moduleCount;e++)this.modules[d][e]=null}this.setupPositionProbePattern(0,0),this.setupPositionProbePattern(this.moduleCount-7,0),this.setupPositionProbePattern(0,this.moduleCount-7),this.setupPositionAdjustPattern(),this.setupTimingPattern(),this.setupTypeInfo(a,c),this.typeNumber>=7&&this.setupTypeNumber(a),null==this.dataCache&&(this.dataCache=b.createData(this.typeNumber,this.errorCorrectLevel,this.dataList)),this.mapData(this.dataCache,c)},setupPositionProbePattern:function(a,b){for(var c=-1;7>=c;c++)if(!(-1>=a+c||this.moduleCount<=a+c))for(var d=-1;7>=d;d++)-1>=b+d||this.moduleCount<=b+d||(this.modules[a+c][b+d]=c>=0&&6>=c&&(0==d||6==d)||d>=0&&6>=d&&(0==c||6==c)||c>=2&&4>=c&&d>=2&&4>=d?!0:!1)},getBestMaskPattern:function(){for(var a=0,b=0,c=0;8>c;c++){this.makeImpl(!0,c);var d=f.getLostPoint(this);(0==c||a>d)&&(a=d,b=c)}return b},createMovieClip:function(a,b,c){var d=a.createEmptyMovieClip(b,c),e=1;this.make();for(var f=0;f<this.modules.length;f++)for(var g=f*e,h=0;h<this.modules[f].length;h++){var i=h*e,j=this.modules[f][h];j&&(d.beginFill(0,100),d.moveTo(i,g),d.lineTo(i+e,g),d.lineTo(i+e,g+e),d.lineTo(i,g+e),d.endFill())}return d},setupTimingPattern:function(){for(var a=8;a<this.moduleCount-8;a++)null==this.modules[a][6]&&(this.modules[a][6]=0==a%2);for(var b=8;b<this.moduleCount-8;b++)null==this.modules[6][b]&&(this.modules[6][b]=0==b%2)},setupPositionAdjustPattern:function(){for(var a=f.getPatternPosition(this.typeNumber),b=0;b<a.length;b++)for(var c=0;c<a.length;c++){var d=a[b],e=a[c];if(null==this.modules[d][e])for(var g=-2;2>=g;g++)for(var h=-2;2>=h;h++)this.modules[d+g][e+h]=-2==g||2==g||-2==h||2==h||0==g&&0==h?!0:!1}},setupTypeNumber:function(a){for(var b=f.getBCHTypeNumber(this.typeNumber),c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[Math.floor(c/3)][c%3+this.moduleCount-8-3]=d}for(var c=0;18>c;c++){var d=!a&&1==(1&b>>c);this.modules[c%3+this.moduleCount-8-3][Math.floor(c/3)]=d}},setupTypeInfo:function(a,b){for(var c=this.errorCorrectLevel<<3|b,d=f.getBCHTypeInfo(c),e=0;15>e;e++){var g=!a&&1==(1&d>>e);6>e?this.modules[e][8]=g:8>e?this.modules[e+1][8]=g:this.modules[this.moduleCount-15+e][8]=g}for(var e=0;15>e;e++){var g=!a&&1==(1&d>>e);8>e?this.modules[8][this.moduleCount-e-1]=g:9>e?this.modules[8][15-e-1+1]=g:this.modules[8][15-e-1]=g}this.modules[this.moduleCount-8][8]=!a},mapData:function(a,b){for(var c=-1,d=this.moduleCount-1,e=7,g=0,h=this.moduleCount-1;h>0;h-=2)for(6==h&&h--;;){for(var i=0;2>i;i++)if(null==this.modules[d][h-i]){var j=!1;g<a.length&&(j=1==(1&a[g]>>>e));var k=f.getMask(b,d,h-i);k&&(j=!j),this.modules[d][h-i]=j,e--,-1==e&&(g++,e=7)}if(d+=c,0>d||this.moduleCount<=d){d-=c,c=-c;break}}}},b.PAD0=236,b.PAD1=17,b.createData=function(a,c,d){for(var e=j.getRSBlocks(a,c),g=new k,h=0;h<d.length;h++){var i=d[h];g.put(i.mode,4),g.put(i.getLength(),f.getLengthInBits(i.mode,a)),i.write(g)}for(var l=0,h=0;h<e.length;h++)l+=e[h].dataCount;if(g.getLengthInBits()>8*l)throw new Error(\"code length overflow. (\"+g.getLengthInBits()+\">\"+8*l+\")\");for(g.getLengthInBits()+4<=8*l&&g.put(0,4);0!=g.getLengthInBits()%8;)g.putBit(!1);for(;;){if(g.getLengthInBits()>=8*l)break;if(g.put(b.PAD0,8),g.getLengthInBits()>=8*l)break;g.put(b.PAD1,8)}return b.createBytes(g,e)},b.createBytes=function(a,b){for(var c=0,d=0,e=0,g=new Array(b.length),h=new Array(b.length),j=0;j<b.length;j++){var k=b[j].dataCount,l=b[j].totalCount-k;d=Math.max(d,k),e=Math.max(e,l),g[j]=new Array(k);for(var m=0;m<g[j].length;m++)g[j][m]=255&a.buffer[m+c];c+=k;var n=f.getErrorCorrectPolynomial(l),o=new i(g[j],n.getLength()-1),p=o.mod(n);h[j]=new Array(n.getLength()-1);for(var m=0;m<h[j].length;m++){var q=m+p.getLength()-h[j].length;h[j][m]=q>=0?p.get(q):0}}for(var r=0,m=0;m<b.length;m++)r+=b[m].totalCount;for(var s=new Array(r),t=0,m=0;d>m;m++)for(var j=0;j<b.length;j++)m<g[j].length&&(s[t++]=g[j][m]);for(var m=0;e>m;m++)for(var j=0;j<b.length;j++)m<h[j].length&&(s[t++]=h[j][m]);return s};for(var c={MODE_NUMBER:1,MODE_ALPHA_NUM:2,MODE_8BIT_BYTE:4,MODE_KANJI:8},d={L:1,M:0,Q:3,H:2},e={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7},f={PATTERN_POSITION_TABLE:[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],[6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],[6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],[6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]],G15:1335,G18:7973,G15_MASK:21522,getBCHTypeInfo:function(a){for(var b=a<<10;f.getBCHDigit(b)-f.getBCHDigit(f.G15)>=0;)b^=f.G15<<f.getBCHDigit(b)-f.getBCHDigit(f.G15);return(a<<10|b)^f.G15_MASK},getBCHTypeNumber:function(a){for(var b=a<<12;f.getBCHDigit(b)-f.getBCHDigit(f.G18)>=0;)b^=f.G18<<f.getBCHDigit(b)-f.getBCHDigit(f.G18);return a<<12|b},getBCHDigit:function(a){for(var b=0;0!=a;)b++,a>>>=1;return b},getPatternPosition:function(a){return f.PATTERN_POSITION_TABLE[a-1]},getMask:function(a,b,c){switch(a){case e.PATTERN000:return 0==(b+c)%2;case e.PATTERN001:return 0==b%2;case e.PATTERN010:return 0==c%3;case e.PATTERN011:return 0==(b+c)%3;case e.PATTERN100:return 0==(Math.floor(b/2)+Math.floor(c/3))%2;case e.PATTERN101:return 0==b*c%2+b*c%3;case e.PATTERN110:return 0==(b*c%2+b*c%3)%2;case e.PATTERN111:return 0==(b*c%3+(b+c)%2)%2;default:throw new Error(\"bad maskPattern:\"+a)}},getErrorCorrectPolynomial:function(a){for(var b=new i([1],0),c=0;a>c;c++)b=b.multiply(new i([1,g.gexp(c)],0));return b},getLengthInBits:function(a,b){if(b>=1&&10>b)switch(a){case c.MODE_NUMBER:return 10;case c.MODE_ALPHA_NUM:return 9;case c.MODE_8BIT_BYTE:return 8;case c.MODE_KANJI:return 8;default:throw new Error(\"mode:\"+a)}else if(27>b)switch(a){case c.MODE_NUMBER:return 12;case c.MODE_ALPHA_NUM:return 11;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 10;default:throw new Error(\"mode:\"+a)}else{if(!(41>b))throw new Error(\"type:\"+b);switch(a){case c.MODE_NUMBER:return 14;case c.MODE_ALPHA_NUM:return 13;case c.MODE_8BIT_BYTE:return 16;case c.MODE_KANJI:return 12;default:throw new Error(\"mode:\"+a)}}},getLostPoint:function(a){for(var b=a.getModuleCount(),c=0,d=0;b>d;d++)for(var e=0;b>e;e++){for(var f=0,g=a.isDark(d,e),h=-1;1>=h;h++)if(!(0>d+h||d+h>=b))for(var i=-1;1>=i;i++)0>e+i||e+i>=b||(0!=h||0!=i)&&g==a.isDark(d+h,e+i)&&f++;f>5&&(c+=3+f-5)}for(var d=0;b-1>d;d++)for(var e=0;b-1>e;e++){var j=0;a.isDark(d,e)&&j++,a.isDark(d+1,e)&&j++,a.isDark(d,e+1)&&j++,a.isDark(d+1,e+1)&&j++,(0==j||4==j)&&(c+=3)}for(var d=0;b>d;d++)for(var e=0;b-6>e;e++)a.isDark(d,e)&&!a.isDark(d,e+1)&&a.isDark(d,e+2)&&a.isDark(d,e+3)&&a.isDark(d,e+4)&&!a.isDark(d,e+5)&&a.isDark(d,e+6)&&(c+=40);for(var e=0;b>e;e++)for(var d=0;b-6>d;d++)a.isDark(d,e)&&!a.isDark(d+1,e)&&a.isDark(d+2,e)&&a.isDark(d+3,e)&&a.isDark(d+4,e)&&!a.isDark(d+5,e)&&a.isDark(d+6,e)&&(c+=40);for(var k=0,e=0;b>e;e++)for(var d=0;b>d;d++)a.isDark(d,e)&&k++;var l=Math.abs(100*k/b/b-50)/5;return c+=10*l}},g={glog:function(a){if(1>a)throw new Error(\"glog(\"+a+\")\");return g.LOG_TABLE[a]},gexp:function(a){for(;0>a;)a+=255;for(;a>=256;)a-=255;return g.EXP_TABLE[a]},EXP_TABLE:new Array(256),LOG_TABLE:new Array(256)},h=0;8>h;h++)g.EXP_TABLE[h]=1<<h;for(var h=8;256>h;h++)g.EXP_TABLE[h]=g.EXP_TABLE[h-4]^g.EXP_TABLE[h-5]^g.EXP_TABLE[h-6]^g.EXP_TABLE[h-8];for(var h=0;255>h;h++)g.LOG_TABLE[g.EXP_TABLE[h]]=h;i.prototype={get:function(a){return this.num[a]},getLength:function(){return this.num.length},multiply:function(a){for(var b=new Array(this.getLength()+a.getLength()-1),c=0;c<this.getLength();c++)for(var d=0;d<a.getLength();d++)b[c+d]^=g.gexp(g.glog(this.get(c))+g.glog(a.get(d)));return new i(b,0)},mod:function(a){if(this.getLength()-a.getLength()<0)return this;for(var b=g.glog(this.get(0))-g.glog(a.get(0)),c=new Array(this.getLength()),d=0;d<this.getLength();d++)c[d]=this.get(d);for(var d=0;d<a.getLength();d++)c[d]^=g.gexp(g.glog(a.get(d))+b);return new i(c,0).mod(a)}},j.RS_BLOCK_TABLE=[[1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16]],j.getRSBlocks=function(a,b){var c=j.getRsBlockTable(a,b);if(void 0==c)throw new Error(\"bad rs block @ typeNumber:\"+a+\"/errorCorrectLevel:\"+b);for(var d=c.length/3,e=[],f=0;d>f;f++)for(var g=c[3*f+0],h=c[3*f+1],i=c[3*f+2],k=0;g>k;k++)e.push(new j(h,i));return e},j.getRsBlockTable=function(a,b){switch(b){case d.L:return j.RS_BLOCK_TABLE[4*(a-1)+0];case d.M:return j.RS_BLOCK_TABLE[4*(a-1)+1];case d.Q:return j.RS_BLOCK_TABLE[4*(a-1)+2];case d.H:return j.RS_BLOCK_TABLE[4*(a-1)+3];default:return void 0}},k.prototype={get:function(a){var b=Math.floor(a/8);return 1==(1&this.buffer[b]>>>7-a%8)},put:function(a,b){for(var c=0;b>c;c++)this.putBit(1==(1&a>>>b-c-1))},getLengthInBits:function(){return this.length},putBit:function(a){var b=Math.floor(this.length/8);this.buffer.length<=b&&this.buffer.push(0),a&&(this.buffer[b]|=128>>>this.length%8),this.length++}};var l=[[17,14,11,7],[32,26,20,14],[53,42,32,24],[78,62,46,34],[106,84,60,44],[134,106,74,58],[154,122,86,64],[192,152,108,84],[230,180,130,98],[271,213,151,119],[321,251,177,137],[367,287,203,155],[425,331,241,177],[458,362,258,194],[520,412,292,220],[586,450,322,250],[644,504,364,280],[718,560,394,310],[792,624,442,338],[858,666,482,382],[929,711,509,403],[1003,779,565,439],[1091,857,611,461],[1171,911,661,511],[1273,997,715,535],[1367,1059,751,593],[1465,1125,805,625],[1528,1190,868,658],[1628,1264,908,698],[1732,1370,982,742],[1840,1452,1030,790],[1952,1538,1112,842],[2068,1628,1168,898],[2188,1722,1228,958],[2303,1809,1283,983],[2431,1911,1351,1051],[2563,1989,1423,1093],[2699,2099,1499,1139],[2809,2213,1579,1219],[2953,2331,1663,1273]],o=function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){function g(a,b){var c=document.createElementNS(\"http://www.w3.org/2000/svg\",a);for(var d in b)b.hasOwnProperty(d)&&c.setAttribute(d,b[d]);return c}var b=this._htOption,c=this._el,d=a.getModuleCount();Math.floor(b.width/d),Math.floor(b.height/d),this.clear();var h=g(\"svg\",{viewBox:\"0 0 \"+String(d)+\" \"+String(d),width:\"100%\",height:\"100%\",fill:b.colorLight});h.setAttributeNS(\"http://www.w3.org/2000/xmlns/\",\"xmlns:xlink\",\"http://www.w3.org/1999/xlink\"),c.appendChild(h),h.appendChild(g(\"rect\",{fill:b.colorDark,width:\"1\",height:\"1\",id:\"template\"}));for(var i=0;d>i;i++)for(var j=0;d>j;j++)if(a.isDark(i,j)){var k=g(\"use\",{x:String(i),y:String(j)});k.setAttributeNS(\"http://www.w3.org/1999/xlink\",\"href\",\"#template\"),h.appendChild(k)}},a.prototype.clear=function(){for(;this._el.hasChildNodes();)this._el.removeChild(this._el.lastChild)},a}(),p=\"svg\"===document.documentElement.tagName.toLowerCase(),q=p?o:m()?function(){function a(){this._elImage.src=this._elCanvas.toDataURL(\"image/png\"),this._elImage.style.display=\"block\",this._elCanvas.style.display=\"none\"}function d(a,b){var c=this;if(c._fFail=b,c._fSuccess=a,null===c._bSupportDataURI){var d=document.createElement(\"img\"),e=function(){c._bSupportDataURI=!1,c._fFail&&_fFail.call(c)},f=function(){c._bSupportDataURI=!0,c._fSuccess&&c._fSuccess.call(c)};return d.onabort=e,d.onerror=e,d.onload=f,d.src=\"data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==\",void 0}c._bSupportDataURI===!0&&c._fSuccess?c._fSuccess.call(c):c._bSupportDataURI===!1&&c._fFail&&c._fFail.call(c)}if(this._android&&this._android<=2.1){var b=1/window.devicePixelRatio,c=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(a,d,e,f,g,h,i,j){if(\"nodeName\"in a&&/img/i.test(a.nodeName))for(var l=arguments.length-1;l>=1;l--)arguments[l]=arguments[l]*b;else\"undefined\"==typeof j&&(arguments[1]*=b,arguments[2]*=b,arguments[3]*=b,arguments[4]*=b);c.apply(this,arguments)}}var e=function(a,b){this._bIsPainted=!1,this._android=n(),this._htOption=b,this._elCanvas=document.createElement(\"canvas\"),this._elCanvas.width=b.width,this._elCanvas.height=b.height,a.appendChild(this._elCanvas),this._el=a,this._oContext=this._elCanvas.getContext(\"2d\"),this._bIsPainted=!1,this._elImage=document.createElement(\"img\"),this._elImage.style.display=\"none\",this._el.appendChild(this._elImage),this._bSupportDataURI=null};return e.prototype.draw=function(a){var b=this._elImage,c=this._oContext,d=this._htOption,e=a.getModuleCount(),f=d.width/e,g=d.height/e,h=Math.round(f),i=Math.round(g);b.style.display=\"none\",this.clear();for(var j=0;e>j;j++)for(var k=0;e>k;k++){var l=a.isDark(j,k),m=k*f,n=j*g;c.strokeStyle=l?d.colorDark:d.colorLight,c.lineWidth=1,c.fillStyle=l?d.colorDark:d.colorLight,c.fillRect(m,n,f,g),c.strokeRect(Math.floor(m)+.5,Math.floor(n)+.5,h,i),c.strokeRect(Math.ceil(m)-.5,Math.ceil(n)-.5,h,i)}this._bIsPainted=!0},e.prototype.makeImage=function(){this._bIsPainted&&d.call(this,a)},e.prototype.isPainted=function(){return this._bIsPainted},e.prototype.clear=function(){this._oContext.clearRect(0,0,this._elCanvas.width,this._elCanvas.height),this._bIsPainted=!1},e.prototype.round=function(a){return a?Math.floor(1e3*a)/1e3:a},e}():function(){var a=function(a,b){this._el=a,this._htOption=b};return a.prototype.draw=function(a){for(var b=this._htOption,c=this._el,d=a.getModuleCount(),e=Math.floor(b.width/d),f=Math.floor(b.height/d),g=['<table style=\"border:0;border-collapse:collapse;\">'],h=0;d>h;h++){g.push(\"<tr>\");for(var i=0;d>i;i++)g.push('<td style=\"border:0;border-collapse:collapse;padding:0;margin:0;width:'+e+\"px;height:\"+f+\"px;background-color:\"+(a.isDark(h,i)?b.colorDark:b.colorLight)+';\"></td>');g.push(\"</tr>\")}g.push(\"</table>\"),c.innerHTML=g.join(\"\");var j=c.childNodes[0],k=(b.width-j.offsetWidth)/2,l=(b.height-j.offsetHeight)/2;k>0&&l>0&&(j.style.margin=l+\"px \"+k+\"px\")},a.prototype.clear=function(){this._el.innerHTML=\"\"},a}();QRCode=function(a,b){if(this._htOption={width:256,height:256,typeNumber:4,colorDark:\"#000000\",colorLight:\"#ffffff\",correctLevel:d.H},\"string\"==typeof b&&(b={text:b}),b)for(var c in b)this._htOption[c]=b[c];\"string\"==typeof a&&(a=document.getElementById(a)),this._android=n(),this._el=a,this._oQRCode=null,this._oDrawing=new q(this._el,this._htOption),this._htOption.text&&this.makeCode(this._htOption.text)},QRCode.prototype.makeCode=function(a){this._oQRCode=new b(r(a,this._htOption.correctLevel),this._htOption.correctLevel),this._oQRCode.addData(a),this._oQRCode.make(),this._el.title=a,this._oDrawing.draw(this._oQRCode),this.makeImage()},QRCode.prototype.makeImage=function(){\"function\"==typeof this._oDrawing.makeImage&&(!this._android||this._android>=3)&&this._oDrawing.makeImage()},QRCode.prototype.clear=function(){this._oDrawing.clear()},QRCode.CorrectLevel=d}();";
    if (typeof QRCode === 'undefined' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        try { new Function(QRCODE_MIN_JS)(); } catch (e) { console.warn("[Mixer] Không thể khởi tạo QRCode inline:", e); }
    }

    // =======================================================
    // 3. ĐỘNG CƠ TRỘN ĐỀ HOÀN CHỈNH (EXAM MIXER ENGINE)
    // =======================================================
    class ExamMixerEngine {
        constructor(inputData, config = {}) {
            this.inputData = inputData; // raw tex string, docx buffer, or questions array
            this.isDocxInput = (inputData instanceof ArrayBuffer) || 
                               (inputData instanceof Blob) || 
                               (typeof Uint8Array !== 'undefined' && inputData instanceof Uint8Array) ||
                               (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(inputData));
            this.config = {
                so_de: 4,
                ma_de_list: ['1001', '1002', '1003', '1004'],
                ma_de_digits: 4,
                ma_de_style: 'consecutive', // 'consecutive', 'random', 'even', 'odd', 'manual'
                dao_cau: true,
                dao_pa: true,
                dao_y_tf: true,
                phannhom: 'Không phân nhóm',
                header: {
                    style: 'standard_gov',
                    agency: 'SỞ GD&ĐT HÀ NỘI',
                    school: 'TRƯỜNG THPT TRẦN QUANG KHẢI',
                    title: 'KIỂM TRA HỌC KỲ I',
                    examType: '(ĐỀ CHÍNH THỨC)',
                    subject: 'TOÁN HỌC',
                    grade: '9',
                    duration: 90,
                    candidateInfo: true
                },
                output_format: 'both', // 'word', 'tex', 'both'
                ...config
            };
        }

        /**
         * Sinh danh sách mã đề theo cấu hình
         */
        static generateExamCodes(count, digits = 4, style = 'consecutive', startCode = null) {
            const codes = [];
            let start = startCode ? parseInt(startCode, 10) : (digits === 4 ? 1001 : 101);
            if (isNaN(start)) start = digits === 4 ? 1001 : 101;

            if (style === 'consecutive') {
                for (let i = 0; i < count; i++) {
                    codes.push(String(start + i).padStart(digits, '0'));
                }
            } else if (style === 'even') {
                if (start % 2 !== 0) start += 1;
                for (let i = 0; i < count; i++) {
                    codes.push(String(start + i * 2).padStart(digits, '0'));
                }
            } else if (style === 'odd') {
                if (start % 2 === 0) start += 1;
                for (let i = 0; i < count; i++) {
                    codes.push(String(start + i * 2).padStart(digits, '0'));
                }
            } else if (style === 'random') {
                const used = new Set();
                const min = Math.pow(10, digits - 1);
                const max = Math.pow(10, digits) - 1;
                while (used.size < count) {
                    const r = Math.floor(min + Math.random() * (max - min + 1));
                    used.add(String(r).padStart(digits, '0'));
                }
                codes.push(...Array.from(used));
            } else {
                for (let i = 0; i < count; i++) {
                    codes.push(String(start + i).padStart(digits, '0'));
                }
            }
            return codes;
        }

        /**
         * Bộ phân tích file Word DOCX siêu tốc độc lập qua JSZip (30ms)
         */
        async parseDocxInput(arrayBuffer, report) {
            report(8, "Đang mở cấu trúc tệp Word DOCX...");
            if (typeof JSZip === 'undefined') {
                throw new Error("Thư viện JSZip chưa được tải trên trang.");
            }

            let zip;
            try {
                zip = await JSZip.loadAsync(arrayBuffer);
            } catch (zErr) {
                throw new Error("Không thể mở tệp Word DOCX: " + (zErr.message || zErr.toString()));
            }

            const docFile = zip.file("word/document.xml");
            if (!docFile) {
                throw new Error("Tệp DOCX không hợp lệ (không tìm thấy word/document.xml).");
            }

            report(12, "Đang trích xuất nội dung văn bản và công thức...");
            const docXml = await docFile.async("text");

            // Phân tích các đoạn paragraph <w:p>
            const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
            const lines = [];
            let pMatch;

            while ((pMatch = pRegex.exec(docXml)) !== null) {
                const pXml = pMatch[1];
                const rRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
                let line = '';
                let rMatch;

                while ((rMatch = rRegex.exec(pXml)) !== null) {
                    const rXml = rMatch[1];
                    const isUnderlined = /<w:u\b[^>]*\/>|<w:u\b[^>]*val=[\"'](?!none)[^\"']+[\"']/i.test(rXml);

                    const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
                    let tMatch;
                    while ((tMatch = tRegex.exec(rXml)) !== null) {
                        const text = tMatch[1];
                        if (isUnderlined) {
                            const labelM = text.trim().match(/^([A-Da-d])\s*[\.\)]?$/);
                            if (labelM) {
                                line += ` [[WORD_UNDERLINE_${labelM[1].toUpperCase()}]] `;
                            }
                        }
                        line += text;
                    }
                }

                // Trích xuất công thức OpenXML Math <m:t> nếu có
                const mtRegex = /<m:t\b[^>]*>([\s\S]*?)<\/m:t>/g;
                let mtMatch;
                while ((mtMatch = mtRegex.exec(pXml)) !== null) {
                    line += mtMatch[1];
                }

                line = line
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&apos;/g, "'");

                if (line.trim()) lines.push(line.trim());
            }

            const rawDocText = lines.join('\n');
            report(15, `Đã trích xuất ${lines.length} dòng dữ liệu từ Word.`);

            // 1. Nếu văn bản Word đã chứa sẵn mã LaTeX \begin{ex} hoặc \begin{bt}
            if (rawDocText.includes('\\begin{ex}') || rawDocText.includes('\\begin{bt}')) {
                report(18, "Phát hiện mã nguồn LaTeX trực tiếp trong file Word!");
                return { texContent: rawDocText, parsedQuestions: [] };
            }

            // 2. Nhận diện các câu hỏi trắc nghiệm (Câu 1. / Bài 1.)
            const parseFn = window.parseWordQuestions || (window.QuestionImporter && window.QuestionImporter.parseWordQuestions);
            if (typeof parseFn === 'function') {
                const questions = parseFn(rawDocText);
                if (questions && questions.length > 0) {
                    report(18, `Nhận diện thành công ${questions.length} câu hỏi từ file Word!`);
                    const tex = this.convertQuestionsArrayToTex(questions);
                    return { texContent: tex, parsedQuestions: questions };
                }
            }

            // 3. Dự phòng Mammoth nhẹ nhàng nếu JSZip chưa tách đủ cấu trúc
            if (window.mammoth) {
                report(16, "Đang phân tích cấu trúc bổ sung qua Mammoth...");
                try {
                    const mRes = await window.mammoth.convertToHtml({ arrayBuffer }, {
                        styleMap: ['u => u'],
                        ignoreEmptyParagraphs: true
                    });
                    const htmlText = window.wordHtmlToImportText ? window.wordHtmlToImportText(mRes.value) : mRes.value.replace(/<[^>]+>/g, '\n');
                    if (typeof parseFn === 'function') {
                        const mQuestions = parseFn(htmlText);
                        if (mQuestions && mQuestions.length > 0) {
                            report(18, `Nhận diện thành công ${mQuestions.length} câu hỏi qua Mammoth!`);
                            return { texContent: this.convertQuestionsArrayToTex(mQuestions), parsedQuestions: mQuestions };
                        }
                    }
                } catch (mErr) {
                    console.warn("[Mixer] Fallback Mammoth:", mErr);
                }
            }

            throw new Error("Không thể trích xuất câu hỏi từ file Word. Đảm bảo file Word có cấu trúc 'Câu 1.' hoặc chứa mã nguồn '\\begin{ex}'.");
        }

        /**
         * Trộn trực tiếp file Word (.docx) ở tầng OpenXML
         * Bảo toàn 100% công thức MathType OLE, bảng biểu, hình vẽ và định dạng
         */
        async mixDocxDirect(report) {
            report(8, "Bắt đầu trộn đề Word trực tiếp từ file gốc (Bảo toàn 100% công thức MathType)...");
            let buf = this.inputData;
            if (buf instanceof Blob) {
                buf = await buf.arrayBuffer();
            } else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(buf)) {
                buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
            }

            const mixer = new DocxDirectMixer(buf, this.config);
            const directResult = await mixer.mix(report);

            report(75, "Đang tạo bảng đáp án Excel và Mã QR...");
            const zip = new JSZip();
            const deThiFolder = zip.folder("de_thi");
            const dapAnFolder = zip.folder("dap_an");
            const qrFolder = zip.folder("qr_code");

            // 1. Thêm các file Word đề thi vào de_thi/
            for (const [filename, fileData] of Object.entries(directResult.exams)) {
                deThiFolder.file(filename, fileData);
            }

            // 2. Thêm file HuongDanGiai.docx vào dap_an/
            if (directResult.huongDanGiai) {
                dapAnFolder.file("HuongDanGiai.docx", directResult.huongDanGiai);
            }

            // 3. Tạo bảng đáp án Excel SmartTest & YoungMix
            const matrixData = directResult.matrixData;
            const smartTestBlob = await ExamMixerEngine.buildSmartTestXlsx(matrixData);
            dapAnFolder.file("DapAn_SmartTest.xlsx", smartTestBlob);

            const youngMixBlob = await ExamMixerEngine.buildYoungMixXlsx(matrixData);
            dapAnFolder.file("DapAn_YoungMix.xlsx", youngMixBlob);

            // 4. Tạo mã QR
            const qrData = ExamMixerEngine.buildQrData(matrixData);
            qrFolder.file("QR_TNMaker.txt", qrData.tnmChunks.map(c => `// Mã đề: ${c.madeList.join(', ')}\n${c.qrString}`).join('\n\n'));
            qrFolder.file("QR_QM_ChamThi.json", JSON.stringify(qrData.qmList, null, 2));
            qrFolder.file("QR_UnT.txt", qrData.untList.join('\n---\n'));

            const shouldExportTex = this.config.output_format === 'tex' || this.config.output_format === 'both';
            if (shouldExportTex) {
                qrFolder.file("MaQR_ChamThi.tex", ExamMixerEngine.buildMaQrTex(qrData));
            }

            const qrViewerHtml = ExamMixerEngine.buildQrViewerHtml(this.config.header?.title || "Đề thi", matrixData, qrData);
            qrFolder.file("Xem_Ma_QR.html", qrViewerHtml);
            qrFolder.file("qrcode.min.js", QRCODE_MIN_JS);

            const QR_tex = typeof QRCode !== 'undefined' ? QRCode : (typeof window !== 'undefined' ? window.QRCode : null);
            if (QR_tex) {
                // 1. TNMaker QR PNG
                for (const chunk of qrData.tnmChunks) {
                    const blobPng = await ExamMixerEngine.generateQrPngBlob(chunk.qrString, 350, 350);
                    if (blobPng) qrFolder.file(`TNMaker_De_${chunk.madeList.join('_')}.png`, blobPng);
                }
                // 2. QM Chấm Thi QR PNG
                for (const chunk of qrData.qmChunks) {
                    const blobPng = await ExamMixerEngine.generateQrPngBlob(chunk.qrString, 350, 350);
                    if (blobPng) qrFolder.file(`QM_De_${chunk.madeList.join('_')}.png`, blobPng);
                }
                // 3. UnT QR PNG
                for (let i = 0; i < qrData.untList.length; i++) {
                    const untStr = qrData.untList[i];
                    const made = untStr.split('\n')[0] || (i + 1);
                    const blobPng = await ExamMixerEngine.generateQrPngBlob(untStr, 350, 350);
                    if (blobPng) qrFolder.file(`UnT_De_${made}.png`, blobPng);
                }
            }

            // =======================================================
            // 3. XUẤT HƯỚNG DẪN GIẢI & FILE MAIN TEX (KHI CHỌN TEX HOẶC BOTH)
            // =======================================================
            if (shouldExportTex) {
                dapAnFolder.file("HuongDanGiai.tex", ExamMixerEngine.buildHuongDanGiaiTex(matrixData, cacDeDaTron, deGocBlocks));
                zip.file("Main_de_bai.tex", this.buildMainTex(maDeList, this.config.header, false));
                zip.file("Main_dap_an.tex", this.buildMainTex(maDeList, this.config.header, true));

                let deGocTex = `\\newpage\n\\setcounter{page}{1}\n\\madethi{GỐC}\n\\setcounter{ex}{0}\\setcounter{bt}{0}\n\n`;
                deGocTex += deGocBlocks.join('\n\n') + `\n\n\\begin{center}\\bf\n----- HẾT -----\n\\end{center}\n\\label{GOC}\n`;
                deThiFolder.file("De_Goc.tex", deGocTex.replace(/DPSpercent/g, '\\%'));

                for (const maDe of maDeList) {
                    const blocks = cacDeDaTron[maDe];
                    let texFile = `\\newpage\n\\setcounter{page}{1}\n\\madethi{${maDe}}\n\\setcounter{ex}{0}\\setcounter{bt}{0}\n\n`;
                    texFile += blocks.join('\n\n') + `\n\n\\begin{center}\\bf\n----- HẾT -----\n\\end{center}\n\\label{${maDe}}\n`;
                    deThiFolder.file(`De_${maDe}.tex`, texFile.replace(/DPSpercent/g, '\\%'));
                }
            }

            // =======================================================
            // 4. XUẤT CÁC FILE WORD (.DOCX) NẾU ĐƯỢC CHỌN
            // =======================================================
            const createDocx = window.createDocxBlob || (window.WordMathTypeExporter && window.WordMathTypeExporter.createDocxBlob);
            const parseLatex = (window.QuestionImporter && window.QuestionImporter.parseLatexExamString) || window.parseLatexExamString;

            const toDocxBuffer = async (data) => {
                if (!data) return null;
                if (data instanceof Uint8Array || data instanceof ArrayBuffer) return data;
                if (typeof data.arrayBuffer === 'function') {
                    try {
                        return await data.arrayBuffer();
                    } catch (e) {
                        return data;
                    }
                }
                return data;
            };

            if (shouldExportWord) {
                if (typeof createDocx !== 'function') {
                    console.warn("[Mixer] Không tìm thấy hàm createDocxBlob để tạo file Word!");
                } else {
                    report(80, "Đang xuất file Word (.docx) Đề Gốc...");

                    const makeHeaderConfig = (code) => ({
                        style: headerCfg.style || 'standard_gov',
                        agency: headerCfg.agency || 'SỞ GD&ĐT HÀ NỘI',
                        school: headerCfg.school || 'TRƯỜNG THPT TRẦN QUANG KHẢI',
                        exam_type: headerCfg.examType || '(ĐỀ CHÍNH THỨC)',
                        title: headerCfg.title || 'ĐỀ THI',
                        subject: headerCfg.subject || 'TOÁN HỌC',
                        grade: headerCfg.grade || '9',
                        duration: headerCfg.duration || 90,
                        exam_code: code,
                        candidate_info: headerCfg.candidateInfo !== false
                    });

                    // 4.1. Xuất file Word Đề Gốc
                    let parsedGocQuestions = null;
                    try {
                        const gocCfg = makeHeaderConfig("GỐC");
                        const fullGocTex = deGocBlocks.join('\n\n').replace(/DPSpercent/g, '\\%');
                        parsedGocQuestions = (typeof parseLatex === 'function') ? parseLatex(fullGocTex) : fullGocTex;

                        const blobGoc = await createDocx({
                            title: `${headerCfg.title || 'De_Thi'}_Goc`,
                            questions: parsedGocQuestions,
                            mode: 'questions',
                            options: {
                                headerStyle: gocCfg.style,
                                agencyName: gocCfg.agency,
                                schoolName: gocCfg.school,
                                examType: gocCfg.exam_type,
                                examTitle: gocCfg.title,
                                subject: gocCfg.subject,
                                grade: gocCfg.grade,
                                duration: gocCfg.duration,
                                examCode: "GỐC",
                                includeCandidateInfo: gocCfg.candidate_info,
                                returnType: 'uint8array'
                            }
                        });
                        const docxDataGoc = await toDocxBuffer(blobGoc);
                        if (docxDataGoc) {
                            deThiFolder.file("De_Goc.docx", docxDataGoc);
                        }
                    } catch (gErr) {
                        console.error("[Mixer] Lỗi xuất Word Đề Gốc:", gErr);
                    }

                    // 4.2. Xuất Lời giải chi tiết Đề Gốc dạng Word (.docx) vào dap_an/
                    try {
                        if (parsedGocQuestions) {
                            const gocCfg = makeHeaderConfig("GỐC");
                            const blobHDG = await createDocx({
                                title: `${headerCfg.title || 'Huong_Dan_Giai'}_De_Goc`,
                                questions: parsedGocQuestions,
                                mode: 'full',
                                options: {
                                    headerStyle: gocCfg.style,
                                    agencyName: gocCfg.agency,
                                    schoolName: gocCfg.school,
                                    examType: gocCfg.exam_type,
                                    examTitle: `${gocCfg.exam_title || gocCfg.title || 'ĐỀ THI'} - HƯỚNG DẪN GIẢI`,
                                    subject: gocCfg.subject,
                                    grade: gocCfg.grade,
                                    duration: gocCfg.duration,
                                    examCode: "GỐC",
                                    includeCandidateInfo: false,
                                    returnType: 'uint8array'
                                }
                            });
                            const docxDataHDG = await toDocxBuffer(blobHDG);
                            if (docxDataHDG) {
                                dapAnFolder.file("HuongDanGiai.docx", docxDataHDG);
                            }
                        }
                    } catch (hdgErr) {
                        console.warn("[Mixer] Không thể tạo HuongDanGiai.docx:", hdgErr);
                    }

                    // 4.3. Xuất file Word cho từng mã đề thi con
                    for (let i = 0; i < maDeList.length; i++) {
                        const maDe = maDeList[i];
                        report(82 + Math.floor((i / maDeList.length) * 14), `Đang tạo file Word mã ${maDe}...`);
                        const examBlocks = cacDeDaTron[maDe];
                        const fullLatexExam = examBlocks.join('\n\n').replace(/DPSpercent/g, '\\%');
                        const parsedExamQuestions = (typeof parseLatex === 'function') ? parseLatex(fullLatexExam) : fullLatexExam;
                        const hConfig = makeHeaderConfig(maDe);

                        try {
                            const blobDocx = await createDocx({
                                title: `${headerCfg.title || 'De_Thi'}_${maDe}`,
                                questions: parsedExamQuestions,
                                mode: 'questions',
                                options: {
                                    headerStyle: hConfig.style,
                                    agencyName: hConfig.agency,
                                    schoolName: hConfig.school,
                                    examType: hConfig.exam_type,
                                    examTitle: hConfig.title,
                                    subject: hConfig.subject,
                                    grade: hConfig.grade,
                                    duration: hConfig.duration,
                                    examCode: maDe,
                                    includeCandidateInfo: hConfig.candidate_info,
                                    returnType: 'uint8array'
                                }
                            });
                            const docxData = await toDocxBuffer(blobDocx);
                            if (docxData) {
                                deThiFolder.file(`De_${maDe}.docx`, docxData);
                            }
                        } catch (wErr) {
                            console.error(`[Mixer] Lỗi tạo Word mã ${maDe}:`, wErr);
                        }
                    }
                }
            }

            report(97, "Đang đóng gói file ZIP hoàn chỉnh...");
            const zipType = typeof Blob !== 'undefined' ? "blob" : "nodebuffer";
            const finalZipBlob = await zip.generateAsync({ type: zipType });
            report(100, "Hoàn tất trộn đề thi!");

            return {
                zipBlob: finalZipBlob,
                matrixData,
                maDeList,
                totalQuestions: degocCh.length + degocTF.length + degocSh.length + btBlocks.length
            };
        }

        convertQuestionsArrayToTex(questions) {
            if (!Array.isArray(questions)) return "";
            return questions.map(q => {
                const env = q.type === 'essay' ? 'bt' : 'ex';
                let res = `\\begin{${env}}\n${q.content || ''}\n`;
                if (q.type === 'tf' && Array.isArray(q.statements)) {
                    res += '\\choiceTF\n' + q.statements.map(st => `\t{${st.isTrue ? '\\True ' : ''}${st.text || ''}}`).join('\n') + '\n';
                } else if (Array.isArray(q.options) && q.options.length > 0) {
                    res += '\\choice\n' + q.options.map((opt, i) => `\t{${i === q.correct ? '\\True ' : ''}${opt}}`).join('\n') + '\n';
                } else if (q.type === 'short' && q.answer) {
                    res += `\\shortans{${q.answer}}\n`;
                }
                if (q.solution) {
                    res += `\\loigiai{\n${q.solution}\n}\n`;
                }
                res += `\\end{${env}}`;
                return res;
            }).join('\n\n');
        }

        // =======================================================
        // CÁC HÀM XUẤT EXCEL THUẦN OPENXML (PORT TỪ MIXER_CORE.PY)
        // =======================================================
        static async buildNativeXlsx(rows) {
            const zip = new JSZip();
            const ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
            const rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
            const wb = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
                'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
            const wb_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');

            const sd = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];
            for (let rIdx = 0; rIdx < rows.length; rIdx++) {
                const row = rows[rIdx];
                sd.push(`<row r="${rIdx + 1}">`);
                for (let cIdx = 0; cIdx < row.length; cIdx++) {
                    let colLetter = "";
                    let temp = cIdx;
                    while (temp >= 0) {
                        colLetter = String.fromCharCode(65 + (temp % 26)) + colLetter;
                        temp = Math.floor(temp / 26) - 1;
                    }
                    let rawVal = row[cIdx];
                    if (rawVal === null || rawVal === undefined) rawVal = "";
                    let vS = String(rawVal).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

                    // Chuẩn 100% LiveTeX mixer_core.py line 100-103
                    if (vS !== "" && !isNaN(vS) && !vS.startsWith("=") && (!vS.startsWith("0") || vS === "0")) {
                        sd.push(`<c r="${colLetter}${rIdx + 1}" t="n"><v>${vS}</v></c>`);
                    } else {
                        sd.push(`<c r="${colLetter}${rIdx + 1}" t="inlineStr"><is><t>${vS}</t></is></c>`);
                    }
                }
                sd.push('</row>');
            }
            sd.push('</sheetData></worksheet>');

            zip.file('[Content_Types].xml', ct);
            zip.file('_rels/.rels', rels);
            zip.file('xl/workbook.xml', wb);
            zip.file('xl/_rels/workbook.xml.rels', wb_rels);
            zip.file('xl/worksheets/sheet1.xml', sd.join(''));

            return await zip.generateAsync({
                type: 'uint8array',
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
        }

        static async buildSmartTestXlsx(matrixData) {
            const targetData = matrixData.filter(d => !d.isGoc || matrixData.length === 1);
            const stRows = [["Câu\\Mã đề", ...targetData.map(d => `'${d.made}`)]];
            const maxP1 = Math.max(40, ...targetData.map(d => (d.p1 || []).length));
            for (let q = 0; q < maxP1; q++) {
                stRows.push([q + 1, ...targetData.map(d => (d.p1 && q < d.p1.length ? d.p1[q] : ""))]);
            }
            const maxP2 = Math.max(8, ...targetData.map(d => (d.p2 || []).length));
            for (let q = 0; q < maxP2; q++) {
                stRows.push([q + 1, ...targetData.map(d => (d.p2 && q < d.p2.length ? d.p2[q].replace(/D/g, 'Đ') : ""))]);
            }
            const maxP3 = Math.max(8, ...targetData.map(d => (d.p3 || []).length));
            for (let q = 0; q < maxP3; q++) {
                stRows.push([q + 1, ...targetData.map(d => (d.p3 && q < d.p3.length ? d.p3[q] : ""))]);
            }
            return await ExamMixerEngine.buildNativeXlsx(stRows);
        }

        static async buildYoungMixXlsx(matrixData) {
            const targetData = matrixData.filter(d => !d.isGoc || matrixData.length === 1);
            const maxP1 = Math.max(40, ...targetData.map(d => (d.p1 || []).length));
            const maxP2 = Math.max(8, ...targetData.map(d => (d.p2 || []).length));
            const maxP3 = Math.max(8, ...targetData.map(d => (d.p3 || []).length));

            const ymHeader = ["Đề\\câu"];
            for (let q = 1; q <= maxP1; q++) ymHeader.push(q);
            for (let q = 1; q <= maxP2; q++) {
                ymHeader.push(`${q}a`, `${q}b`, `${q}c`, `${q}d`);
            }
            for (let q = 1; q <= maxP3; q++) ymHeader.push(q);

            const ymRows = [ymHeader];
            for (const d of targetData) {
                const row = [`'${d.made}`];
                for (let i = 0; i < maxP1; i++) {
                    row.push(d.p1 && i < d.p1.length ? d.p1[i] : "");
                }
                for (let q = 0; q < maxP2; q++) {
                    if (d.p2 && q < d.p2.length) {
                        const tf = d.p2[q].replace(/D/g, 'Đ');
                        for (let c = 0; c < 4; c++) {
                            row.push(c < tf.length ? tf[c] : "");
                        }
                    } else {
                        row.push("", "", "", "");
                    }
                }
                for (let i = 0; i < maxP3; i++) {
                    row.push(d.p3 && i < d.p3.length ? d.p3[i] : "");
                }
                ymRows.push(row);
            }
            return await ExamMixerEngine.buildNativeXlsx(ymRows);
        }

        // =======================================================
        // CÁC HÀM TẠO DỮ LIỆU VÀ GIAO DIỆN MÃ QR
        // =======================================================
        static buildQrData(matrixData) {
            const untList = [];
            const tnmList = [];
            const qmList = [];

            // Lấy các mã đề thi con (hoặc cả đề gốc nếu chỉ có 1 đề)
            const targetCodes = matrixData.filter(d => !d.isGoc || matrixData.length === 1);

            for (const d of targetCodes) {
                // 1. Chuẩn UnT
                let unt = `${d.made}\n`;
                if (d.p1 && d.p1.length > 0) unt += d.p1.join('');
                if (d.p2 && d.p2.length > 0) unt += '\n' + d.p2.map(s => s.replace(/D/g, 'Đ')).join('');
                if (d.p3_raw && d.p3_raw.length > 0) {
                    const cleanSh = d.p3_raw.map(ans => cleanShortAnswer(ans));
                    unt += '\n' + cleanSh.join('|');
                }
                untList.push(unt);

                // 2. Chuẩn TNMaker: "made":"p1#p2_with_Đ#p3_clean"
                let tnm = `"${d.made}":"`;
                if (d.p1 && d.p1.length > 0) tnm += d.p1.join('');
                if (d.p2 && d.p2.length > 0) tnm += '#' + d.p2.map(s => s.replace(/D/g, 'Đ')).join('_');
                if (d.p3_raw && d.p3_raw.length > 0) {
                    const cleanSh = d.p3_raw.map(ans => cleanShortAnswer(ans));
                    tnm += '#' + cleanSh.join('_');
                }
                tnm += '"';
                tnmList.push({ made: d.made, pair: tnm });

                // 3. Chuẩn QM Chấm Thi: [made, ans1, ans2...]
                const qm = [String(d.made)];
                if (d.p1) qm.push(...d.p1);
                if (d.p2) {
                    for (const tf of d.p2) {
                        const normTf = tf.replace(/Đ/g, 'D');
                        for (let c = 0; c < normTf.length; c++) qm.push(normTf[c]);
                    }
                }
                if (d.p3_raw) {
                    for (const ans of d.p3_raw) {
                        const cleanAns = cleanShortAnswer(ans);
                        const num = parseFloat(cleanAns.replace(',', '.'));
                        if (!isNaN(num) && Number.isFinite(num)) {
                            qm.push(Number.isInteger(num) ? parseInt(num, 10) : num);
                        } else {
                            qm.push(cleanAns);
                        }
                    }
                }
                qmList.push(qm);
            }

            // Chia khối TNMaker (tối đa 8 mã đề / mã QR)
            const tnmChunks = [];
            for (let i = 0; i < tnmList.length; i += 8) {
                const chunk = tnmList.slice(i, i + 8);
                const jsonStr = '{' + chunk.map(c => c.pair).join(',') + ',"success":true,"type":6}';
                tnmChunks.push({
                    madeList: chunk.map(c => c.made),
                    qrString: jsonStr
                });
            }

            // Chia khối QM (tối đa 3 mã đề / mã QR theo đúng chuẩn LiveTex và app QM Chấm Thi)
            const qmChunks = [];
            for (let i = 0; i < qmList.length; i += 3) {
                const chunk = qmList.slice(i, i + 3);
                const jsonStr = JSON.stringify(chunk);
                qmChunks.push({
                    madeList: chunk.map(c => c[0]),
                    qrString: jsonStr
                });
            }

            return { untList, tnmList, tnmChunks, qmList, qmChunks };
        }

        static buildMaQrTex(qrData) {
            let tex = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[vietnamese]{babel}
\\usepackage{geometry}
\\usepackage{qrcode}
\\geometry{top=1.5cm, bottom=1.8cm, left=1.5cm, right=1.5cm}
\\begin{document}

\\begin{center}
{\\Large\\bfseries MÃ QR CODE CHẤM THI TỰ ĐỘNG}
\\end{center}
\\vspace{0.5cm}
`;

            // TNMaker QR
            if (qrData.tnmChunks && qrData.tnmChunks.length > 0) {
                tex += `\\section*{1. Mã QR dành cho ứng dụng chấm trắc nghiệm TNMaker}\n\\begin{center}\n`;
                for (const chunk of qrData.tnmChunks) {
                    const escaped = chunk.qrString.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
                    tex += `{\\bf Mã đề: ${chunk.madeList.join(', ')}}\\\\[2mm]\n`;
                    tex += `\\qrcode[height=1.8in]{${escaped}}\\vspace{6mm}\\\\\n`;
                }
                tex += `\\end{center}\n\\newpage\n`;
            }

            // QM Chấm thi QR
            if (qrData.qmChunks && qrData.qmChunks.length > 0) {
                tex += `\\section*{2. Mã QR dành cho ứng dụng chấm thi QM}\n\\begin{center}\n`;
                for (const chunk of qrData.qmChunks) {
                    const escaped = chunk.qrString.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
                    tex += `{\\bf Mã đề: ${chunk.madeList.join(', ')}}\\\\[2mm]\n`;
                    tex += `\\qrcode[height=1.6in]{${escaped}}\\vspace{6mm}\\\\\n`;
                }
                tex += `\\end{center}\n\\newpage\n`;
            }

            // UnT QR
            if (qrData.untList && qrData.untList.length > 0) {
                tex += `\\section*{3. Mã QR dành cho ứng dụng chấm thi UnT}\n\\begin{center}\n`;
                for (let i = 0; i < qrData.untList.length; i += 4) {
                    const chunk = qrData.untList.slice(i, i + 4);
                    tex += `\\qrcode[height=1.8in]{${chunk.join('\n')}}\\vspace{6mm}\\\\\n`;
                }
                tex += `\\end{center}\n`;
            }

            tex += `\\end{document}`;
            return tex;
        }

        static buildHuongDanGiaiTex(matrixData, cacDeDaTron, deGocBlocks) {
            let tex = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[vietnamese]{babel}
\\usepackage{amsmath,amssymb,geometry}
\\usepackage[book]{ex_test}
\\geometry{top=1.5cm, bottom=1.8cm, left=1.5cm, right=1.5cm}
\\begin{document}
`;
            for (const d of matrixData) {
                const made = d.made;
                const isGoc = d.isGoc;
                tex += `\\newpage\n\\setcounter{page}{1}\n\\begin{center}\\bfseries\\large\n\\fbox{HƯỚNG DẪN GIẢI CHI TIẾT - ${isGoc ? 'ĐỀ GỐC' : `MÃ ĐỀ ${made}`}}\n\\end{center}\n`;
                tex += `\\setcounter{section}{0}\\setcounter{subsection}{0}\\setcounter{subsubsection}{0}\\setcounter{ex}{0}\\setcounter{bt}{0}\n\n`;

                const blocks = isGoc ? deGocBlocks : (cacDeDaTron[made] || []);
                tex += blocks.join('\n\n') + `\n\n\\begin{center}\\bf\n----- HẾT -----\n\\end{center}\n`;
            }
            tex += `\\end{document}`;
            return tex.replace(/DPSpercent/g, '\\%');
        }

        static buildQrViewerHtml(title, matrixData, qrData) {
            const tnmJson = JSON.stringify(qrData.tnmChunks);
            const qmJson = JSON.stringify(qrData.qmChunks);
            const untJson = JSON.stringify(qrData.untList);

            return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mã QR Chấm Thi - ${title}</title>
    <script>
    ${QRCODE_MIN_JS}
    </script>
    <style>
        :root { --primary: #ea580c; --primary-hover: #c2410c; --bg: #f8fafc; --card: #ffffff; --text: #1e293b; --border: #e2e8f0; }
        @media (prefers-color-scheme: dark) {
            :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --border: #334155; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
        body { background: var(--bg); color: var(--text); padding: 24px; min-height: 100vh; }
        .container { max-width: 1000px; margin: 0 auto; }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid var(--border); }
        .title { font-size: 22px; font-weight: 800; color: var(--primary); }
        .sub { font-size: 13px; opacity: 0.7; margin-top: 4px; }
        .btn-print { background: var(--primary); color: #fff; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 700; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
        .btn-print:hover { background: var(--primary-hover); }
        .tabs { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
        .tab-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--text); font-weight: 700; font-size: 13px; cursor: pointer; transition: 0.2s; }
        .tab-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
        .qr-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .qr-code-box { display: inline-flex; justify-content: center; align-items: center; padding: 14px; background: #ffffff; border-radius: 12px; margin: 12px 0; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .qr-label { font-size: 16px; font-weight: 800; margin-bottom: 6px; }
        .qr-desc { font-size: 11px; opacity: 0.7; word-break: break-all; max-height: 48px; overflow: hidden; margin-bottom: 12px; font-family: monospace; }
        .btn-dl { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .btn-dl:hover { background: #e2e8f0; }
        @media print {
            body { background: #fff !important; color: #000 !important; padding: 0 !important; }
            .header, .tabs, .btn-print, .btn-dl { display: none !important; }
            .grid { grid-template-columns: repeat(2, 1fr) !important; gap: 30px !important; }
            .qr-card { border: 1px solid #000 !important; box-shadow: none !important; page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1 class="title">MÃ QR CODE CHẤM THI TỰ ĐỘNG</h1>
                <p class="sub">${title} | Hỗ trợ TNMaker, QM Chấm Thi &amp; UnT</p>
            </div>
            <button class="btn-print" onclick="window.print()">🖨️ In Mã QR Ra Giấy</button>
        </div>

        <div class="tabs">
            <button class="tab-btn active" id="btnTabTnm" onclick="switchTab('tnm')">📱 App TNMaker</button>
            <button class="tab-btn" id="btnTabQm" onclick="switchTab('qm')">📱 App QM Chấm Thi</button>
            <button class="tab-btn" id="btnTabUnt" onclick="switchTab('unt')">📱 App UnT</button>
        </div>

        <div id="tabContentTnm" class="grid"></div>
        <div id="tabContentQm" class="grid" style="display:none;"></div>
        <div id="tabContentUnt" class="grid" style="display:none;"></div>
    </div>

    <script>
        const tnmData = ${tnmJson};
        const qmData = ${qmJson};
        const untData = ${untJson};

        function switchTab(tab) {
            document.getElementById('btnTabTnm').className = tab === 'tnm' ? 'tab-btn active' : 'tab-btn';
            document.getElementById('btnTabQm').className = tab === 'qm' ? 'tab-btn active' : 'tab-btn';
            document.getElementById('btnTabUnt').className = tab === 'unt' ? 'tab-btn active' : 'tab-btn';

            document.getElementById('tabContentTnm').style.display = tab === 'tnm' ? 'grid' : 'none';
            document.getElementById('tabContentQm').style.display = tab === 'qm' ? 'grid' : 'none';
            document.getElementById('tabContentUnt').style.display = tab === 'unt' ? 'grid' : 'none';
        }

        function renderQrItem(container, title, text) {
            const card = document.createElement('div');
            card.className = 'qr-card';

            const h3 = document.createElement('div');
            h3.className = 'qr-label';
            h3.textContent = title;
            card.appendChild(h3);

            const desc = document.createElement('div');
            desc.className = 'qr-desc';
            desc.textContent = text;
            card.appendChild(desc);

            const qrBox = document.createElement('div');
            qrBox.className = 'qr-code-box';
            card.appendChild(qrBox);

            const dlBtn = document.createElement('button');
            dlBtn.className = 'btn-dl';
            dlBtn.textContent = '📥 Tải ảnh PNG';
            dlBtn.onclick = () => {
                const img = qrBox.querySelector('img');
                const canvas = qrBox.querySelector('canvas');
                const a = document.createElement('a');
                a.download = title.replace(/[^a-zA-Z0-9_]/g, '_') + '.png';
                if (img && img.src && img.src.startsWith('data:image/')) {
                    a.href = img.src;
                    a.click();
                } else if (canvas && typeof canvas.toDataURL === 'function') {
                    a.href = canvas.toDataURL('image/png');
                    a.click();
                }
            };
            card.appendChild(dlBtn);
            container.appendChild(card);

            try {
                new QRCode(qrBox, {
                    text: text,
                    width: 220,
                    height: 220,
                    correctLevel: QRCode.CorrectLevel.L
                });
            } catch (err) {
                console.error("Lỗi vẽ QR:", err);
            }
        }

        window.onload = function() {
            // 1. TNMaker
            const cTnm = document.getElementById('tabContentTnm');
            tnmData.forEach((chunk, idx) => {
                renderQrItem(cTnm, 'TNMaker: Mã đề ' + chunk.madeList.join(', '), chunk.qrString);
            });

            // 2. QM Chấm thi
            const cQm = document.getElementById('tabContentQm');
            qmData.forEach((chunk, idx) => {
                renderQrItem(cQm, 'App QM: Mã đề ' + chunk.madeList.join(', '), chunk.qrString);
            });

            // 3. UnT
            const cUnt = document.getElementById('tabContentUnt');
            untData.forEach((untStr, idx) => {
                const lines = untStr.split('\\n');
                renderQrItem(cUnt, 'App UnT: Mã đề ' + (lines[0] || (idx+1)), untStr);
            });
        };
    </script>
</body>
</html>`;
        }

        static async generateQrPngBlob(text, width = 350, height = 350) {
            const QR = typeof QRCode !== 'undefined' ? QRCode : (typeof window !== 'undefined' ? window.QRCode : null);
            if (!QR) return null;
            if (typeof document === 'undefined') return null;

            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'fixed';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            document.body.appendChild(tempDiv);

            try {
                new QR(tempDiv, {
                    text: text,
                    width: width,
                    height: height,
                    correctLevel: QR.CorrectLevel.L
                });

                await new Promise(r => setTimeout(r, 60));

                const canvas = tempDiv.querySelector('canvas');
                const img = tempDiv.querySelector('img');
                let dataUrl = '';

                if (img && img.src && img.src.startsWith('data:image/')) {
                    dataUrl = img.src;
                } else if (canvas && typeof canvas.toDataURL === 'function') {
                    dataUrl = canvas.toDataURL('image/png');
                }

                if (dataUrl && dataUrl.startsWith('data:image/png;base64,')) {
                    const base64 = dataUrl.split(',')[1];
                    const binStr = atob(base64);
                    const bytes = new Uint8Array(binStr.length);
                    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                    return bytes;
                }

                if (canvas && typeof canvas.toBlob === 'function') {
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    if (blob && blob.size > 0) return blob;
                }
            } catch (e) {
                console.warn("[Mixer] Lỗi tạo ảnh QR PNG:", e);
            } finally {
                if (tempDiv.parentNode) tempDiv.parentNode.removeChild(tempDiv);
            }
            return null;
        }

        buildMainTex(maDeList, headerCfg, isDapAn = false) {
            const inputs = maDeList.map(md => `\\input{de_thi/De_${md}}`).join('\n');
            const daInputs = isDapAn ? "\n\\newpage\n\\input{dap_an/HuongDanGiai}\n" : "";
            return `\\documentclass[12pt,a4paper]{article}
\\usepackage{amsmath,amssymb,geometry}
\\usepackage[book]{ex_test}
\\geometry{top=1.5cm, bottom=1.8cm, left=1.5cm, right=1.5cm}
\\begin{document}
${inputs}
\\end{document}`;
        }
    }

    // =======================================================
    // 4. GIAO DIỆN MODAL TRỘN ĐỀ THI (HTML / UI)
    // =======================================================
    function openExamMixerModal(defaultData = null) {
        let modal = document.getElementById('examMixerModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'examMixerModal';
            modal.className = 'fixed inset-0 z-[170] bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 transition-opacity';
            modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 flex flex-col" style="width: 95vw; max-width: 1100px; max-height: 90vh;">
                <!-- Header Modal -->
                <div class="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
                    <div class="flex items-center gap-2.5">
                        <span class="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center text-lg">
                            <i class="fa-solid fa-shuffle"></i>
                        </span>
                        <div>
                            <h3 class="font-bold text-gray-800 dark:text-gray-100 text-sm sm:text-base">Trộn Đề Thi Chuyên Nghiệp (TeX &amp; Word)</h3>
                            <p class="text-[11px] text-gray-500 dark:text-gray-400">Đảo câu hỏi, đảo phương án, phân nhóm ID6, xuất Đề gốc &amp; Đề con, Excel SmartTest/YoungMix &amp; Mã QR chấm thi</p>
                        </div>
                    </div>
                    <button type="button" onclick="window.closeExamMixerModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg text-lg">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Tabs chọn nguồn đầu vào -->
                <div class="flex items-center gap-2 pt-3 pb-1 border-b border-gray-100 dark:border-gray-800 shrink-0 text-xs">
                    <button type="button" onclick="window.switchMixerInputTab('file')" id="btnMixerTabFile" class="px-3 py-1.5 font-bold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 transition-colors">
                        📁 Tải File (.tex / .docx)
                    </button>
                    <button type="button" onclick="window.switchMixerInputTab('paste')" id="btnMixerTabPaste" class="px-3 py-1.5 font-medium rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                        📋 Dán mã LaTeX
                    </button>
                    <button type="button" onclick="window.switchMixerInputTab('bank')" id="btnMixerTabBank" class="px-3 py-1.5 font-medium rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
                        🏛️ Chọn từ Kho đề
                    </button>
                </div>

                <!-- Body Modal (Scrollable 2 Cột) -->
                <div class="py-3.5 overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-4">
                    
                    <!-- 1. Vùng chọn nguồn đầu vào -->
                    <div id="mixerInputAreaFile" class="p-3 bg-gray-50/70 dark:bg-gray-800/60 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
                        <input type="file" id="mixerFileInput" accept=".tex,.docx" class="hidden" onchange="window.handleMixerFileSelected(this)">
                        <div onclick="document.getElementById('mixerFileInput').click()" class="cursor-pointer py-4">
                            <i class="fa-solid fa-cloud-arrow-up text-3xl text-gray-400 mb-2"></i>
                            <p class="text-xs font-bold text-gray-700 dark:text-gray-200">Nhấp để chọn file hoặc kéo thả file .tex / .docx vào đây</p>
                            <p class="text-[11px] text-gray-400 mt-0.5">Hỗ trợ đầy đủ định dạng LaTeX (.tex) và Word DOCX (.docx)</p>
                        </div>
                        <div id="mixerFileStatus" class="hidden text-xs font-bold text-primary-600 dark:text-primary-400 pt-2 border-t border-gray-200 dark:border-gray-700"></div>
                    </div>

                    <div id="mixerInputAreaPaste" class="hidden">
                        <textarea id="mixerPasteInput" rows="6" placeholder="Dán nội dung mã nguồn LaTeX (\begin{ex}...\end{ex}) vào đây..." class="w-full p-2.5 text-xs font-mono border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-primary-500"></textarea>
                    </div>

                    <div id="mixerInputAreaBank" class="hidden">
                        <select id="mixerBankSelect" class="w-full p-2.5 text-xs font-bold border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                            <option value="">-- Chọn đề thi từ Ngân hàng của bạn --</option>
                        </select>
                    </div>

                    <!-- 2. Bố cục 2 Cột: Cấu hình Trộn đề & Khung Tiêu Đề -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px;">
                        
                        <!-- CỘT TRÁI: Cấu hình Trộn -->
                        <div class="space-y-3.5" style="min-width: 0;">
                            <div class="p-3.5 bg-gray-50/70 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/80 space-y-3">
                                <label class="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                    <i class="fa-solid fa-sliders text-gray-600 dark:text-gray-300"></i> Cấu hình khi trộn
                                </label>

                                <!-- Số lượng đề & Chế độ mã đề -->
                                <div class="grid grid-cols-2 gap-2 pt-1 border-t border-gray-200 dark:border-gray-700">
                                    <div>
                                        <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">Số lượng mã đề</label>
                                        <input type="number" id="mixerExamCount" value="4" min="1" max="24" onchange="window.updateMixerPreviewCodes()" class="w-full px-2.5 py-1.5 text-xs font-bold border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-center outline-none">
                                    </div>
                                    <div>
                                        <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">Độ dài mã đề</label>
                                        <div class="inline-flex w-full rounded-lg border border-gray-300 dark:border-gray-600 p-0.5 bg-gray-100 dark:bg-gray-800 text-[11px]">
                                            <button type="button" id="btnMixerDigits3" onclick="window.setMixerDigits(3)" class="flex-1 py-1 font-medium rounded-md text-gray-600 dark:text-gray-400 cursor-pointer">3 số</button>
                                            <button type="button" id="btnMixerDigits4" onclick="window.setMixerDigits(4)" class="flex-1 py-1 font-bold rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-xs cursor-pointer">4 số</button>
                                        </div>
                                    </div>
                                </div>

                                <!-- Quy tắc sinh mã đề & Xem trước -->
                                <div>
                                    <div class="flex items-center justify-between mb-1">
                                        <label class="text-[11px] font-bold text-gray-600 dark:text-gray-400">Quy tắc sinh mã đề</label>
                                        <select id="mixerCodeStyle" onchange="window.updateMixerPreviewCodes()" class="text-[11px] font-medium px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none">
                                            <option value="consecutive" selected>Liên tiếp (1001, 1002...)</option>
                                            <option value="random">Ngẫu nhiên</option>
                                            <option value="even">Số chẵn</option>
                                            <option value="odd">Số lẻ</option>
                                        </select>
                                    </div>
                                    <input type="text" id="mixerCodesPreview" value="1001, 1002, 1003, 1004" title="Danh sách mã đề phân cách bằng dấu phẩy" class="w-full px-2.5 py-1.5 text-xs font-bold border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none">
                                </div>

                                <!-- Các tùy chọn đảo -->
                                <div class="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs">
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" id="mixerShuffleQuestions" checked class="rounded text-primary-600 focus:ring-primary-500">
                                        <span class="text-gray-700 dark:text-gray-300 font-bold">Đảo câu hỏi (Hỗ trợ khóa ##)</span>
                                    </label>
                                    <div class="pl-5">
                                        <label class="block text-[11px] text-gray-500 mb-0.5">Phân nhóm mức độ ID6:</label>
                                        <select id="mixerPhanNhom" class="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none">
                                            <option value="Không phân nhóm" selected>Không phân nhóm (Đảo tự do toàn bộ)</option>
                                            <option value="2 nhóm">2 nhóm: Dễ (NB, TH) &lt; Khó (VD, VDC)</option>
                                            <option value="3 nhóm: Biết < Hiểu < VD, VDC">3 nhóm: Biết &lt; Hiểu &lt; VD, VDC</option>
                                            <option value="3 nhóm: Biết < Hiểu, VD < VDC">3 nhóm: Biết &lt; Hiểu, VD &lt; VDC</option>
                                            <option value="4 nhóm">4 nhóm: Biết &lt; Hiểu &lt; VD &lt; VDC</option>
                                        </select>
                                    </div>
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" id="mixerShuffleOptions" checked class="rounded text-primary-600 focus:ring-primary-500">
                                        <span class="text-gray-700 dark:text-gray-300 font-bold">Đảo 4 phương án trắc nghiệm A, B, C, D</span>
                                    </label>
                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" id="mixerShuffleTf" checked class="rounded text-primary-600 focus:ring-primary-500">
                                        <span class="text-gray-700 dark:text-gray-300 font-bold">Đảo mệnh đề Đúng/Sai (Đồng bộ lời giải \\itemch)</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- CỘT PHẢI: Cấu hình Tiêu đề đề thi -->
                        <div class="space-y-3.5" style="min-width: 0;">
                            <div class="p-3.5 bg-gray-50/70 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700/80 space-y-3">
                                <div class="flex items-center justify-between">
                                    <label class="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                        <i class="fa-solid fa-heading text-gray-600 dark:text-gray-300"></i> Tiêu đề đề thi (Header)
                                    </label>
                                    <select id="mixerHeaderStyle" class="text-xs font-bold px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none">
                                        <option value="standard_gov" selected>🏛️ Mẫu 1: Chuẩn Sở / Bộ GD</option>
                                        <option value="brand_center">⭐ Mẫu 2: Trung tâm / QMath</option>
                                        <option value="compact">📄 Mẫu 3: Tiêu đề Rút gọn</option>
                                    </select>
                                </div>

                                <div class="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-700">
                                    <div class="grid grid-cols-2 gap-2">
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Sở GD / Cơ quan</label>
                                            <input type="text" id="mixerAgencyName" value="SỞ GD&ĐT HÀ NỘI" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Trường / Đơn vị</label>
                                            <input type="text" id="mixerSchoolName" value="TRƯỜNG THPT TRẦN QUANG KHẢI" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-2 gap-2">
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Tên đề thi / Bài KT</label>
                                            <input type="text" id="mixerTitleInput" value="KIỂM TRA HỌC KỲ I" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Loại đề</label>
                                            <input type="text" id="mixerExamType" value="(ĐỀ CHÍNH THỨC)" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                    </div>

                                    <div class="grid grid-cols-3 gap-2">
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Môn thi</label>
                                            <input type="text" id="mixerSubject" value="TOÁN HỌC" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Khối</label>
                                            <input type="text" id="mixerGrade" value="9" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 outline-none">
                                        </div>
                                        <div>
                                            <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-0.5">Thời gian</label>
                                            <div class="flex items-center gap-1">
                                                <input type="number" id="mixerDuration" value="90" class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-center font-bold outline-none">
                                                <span class="text-[11px] text-gray-400">ph</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Định dạng đầu ra -->
                                    <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
                                        <label class="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">Định dạng file xuất trong gói ZIP</label>
                                        <select id="mixerOutputFormat" class="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none">
                                            <option value="both" selected>📦 Đầy đủ: Word (.docx) + TeX + Excel SmartTest/YoungMix + Mã QR</option>
                                            <option value="word">📄 File Word (.docx) + Excel SmartTest/YoungMix + Mã QR</option>
                                            <option value="tex">📐 File LaTeX (.tex) + Excel SmartTest/YoungMix + Mã QR</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- Thanh thông báo tiến trình -->
                    <div id="mixerProgressBox" class="hidden p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-1.5">
                        <div class="flex items-center justify-between text-xs font-bold">
                            <span id="mixerProgressText" class="text-gray-700 dark:text-gray-300">Đang tiến hành trộn đề...</span>
                            <span id="mixerProgressPercent" class="text-primary-600">0%</span>
                        </div>
                        <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div id="mixerProgressBar" class="h-full bg-primary-600 transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>

                </div>

                <!-- Footer Modal -->
                <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
                    <button type="button" onclick="window.closeExamMixerModal()" class="px-4 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition cursor-pointer">Đóng</button>
                    <button type="button" id="btnStartMixingExams" onclick="window.startMixingExamsAction()" class="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer" style="background-color: var(--primary-color, #ea580c); color: #ffffff;">
                        <i class="fa-solid fa-shuffle"></i> Bắt đầu Trộn &amp; Tải ZIP
                    </button>
                </div>
            </div>`;
            document.body.appendChild(modal);
        }

        // Khởi tạo danh sách đề thi từ Bank nếu có
        const bankSelect = document.getElementById('mixerBankSelect');
        if (bankSelect && Array.isArray(window.examData)) {
            bankSelect.innerHTML = '<option value="">-- Chọn đề thi từ Ngân hàng của bạn --</option>';
            window.examData.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = `${e.title || 'Đề thi'} (${e.subject || 'Toán'} - ${e.grade || ''})`;
                bankSelect.appendChild(opt);
            });
        }

        modal.classList.remove('hidden');
    }

    function closeExamMixerModal() {
        const modal = document.getElementById('examMixerModal');
        if (modal) modal.classList.add('hidden');
    }

    window.switchMixerInputTab = function(tab) {
        window._activeMixerTab = tab;
        const bFile = document.getElementById('btnMixerTabFile');
        const bPaste = document.getElementById('btnMixerTabPaste');
        const bBank = document.getElementById('btnMixerTabBank');
        const aFile = document.getElementById('mixerInputAreaFile');
        const aPaste = document.getElementById('mixerInputAreaPaste');
        const aBank = document.getElementById('mixerInputAreaBank');

        const activeCls = "px-3 py-1.5 font-bold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 transition-colors";
        const inactiveCls = "px-3 py-1.5 font-medium rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors";

        if (bFile) bFile.className = tab === 'file' ? activeCls : inactiveCls;
        if (bPaste) bPaste.className = tab === 'paste' ? activeCls : inactiveCls;
        if (bBank) bBank.className = tab === 'bank' ? activeCls : inactiveCls;

        if (aFile) aFile.className = tab === 'file' ? 'p-3 bg-gray-50/70 dark:bg-gray-800/60 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center' : 'hidden';
        if (aPaste) aPaste.className = tab === 'paste' ? '' : 'hidden';
        if (aBank) aBank.className = tab === 'bank' ? '' : 'hidden';
    };

    window._mixerDigits = 4;
    window.setMixerDigits = function(digits) {
        window._mixerDigits = digits;
        const b3 = document.getElementById('btnMixerDigits3');
        const b4 = document.getElementById('btnMixerDigits4');
        if (b3 && b4) {
            if (digits === 3) {
                b3.className = "flex-1 py-1 font-bold rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-xs cursor-pointer";
                b4.className = "flex-1 py-1 font-medium rounded-md text-gray-600 dark:text-gray-400 cursor-pointer";
            } else {
                b4.className = "flex-1 py-1 font-bold rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-xs cursor-pointer";
                b3.className = "flex-1 py-1 font-medium rounded-md text-gray-600 dark:text-gray-400 cursor-pointer";
            }
        }
        window.updateMixerPreviewCodes();
    };

    window.updateMixerPreviewCodes = function() {
        const count = parseInt(document.getElementById('mixerExamCount')?.value || 4, 10);
        const digits = window._mixerDigits || 4;
        const style = document.getElementById('mixerCodeStyle')?.value || 'consecutive';
        const codes = ExamMixerEngine.generateExamCodes(count, digits, style);
        const previewInput = document.getElementById('mixerCodesPreview');
        if (previewInput) {
            previewInput.value = codes.join(', ');
        }
    };

    window._mixerUploadedFile = null;
    window.handleMixerFileSelected = function(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        window._mixerUploadedFile = file;
        const statusBox = document.getElementById('mixerFileStatus');
        if (statusBox) {
            statusBox.textContent = `Đã chọn file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            statusBox.classList.remove('hidden');
        }
        const ext = file.name.split('.').pop().toLowerCase();
        const outputFmt = document.getElementById('mixerOutputFormat');
        if (outputFmt) {
            if (ext === 'docx') {
                outputFmt.value = 'word';
            } else if (ext === 'tex') {
                outputFmt.value = 'tex';
            }
        }
    };

    window.startMixingExamsAction = async function() {
        const btn = document.getElementById('btnStartMixingExams');
        const pBox = document.getElementById('mixerProgressBox');
        const pBar = document.getElementById('mixerProgressBar');
        const pText = document.getElementById('mixerProgressText');
        const pPct = document.getElementById('mixerProgressPercent');

        const activeTab = window._activeMixerTab || 'file';
        let inputData = null;

        try {
            if (activeTab === 'file') {
                if (!window._mixerUploadedFile) {
                    alert("Vui lòng chọn file .tex hoặc .docx để trộn!");
                    return;
                }
                const ext = window._mixerUploadedFile.name.split('.').pop().toLowerCase();
                if (ext === 'tex') {
                    inputData = await window._mixerUploadedFile.text();
                } else if (ext === 'docx') {
                    inputData = await window._mixerUploadedFile.arrayBuffer();
                } else {
                    alert("Định dạng file không được hỗ trợ. Vui lòng chọn file .tex hoặc .docx!");
                    return;
                }
            } else if (activeTab === 'paste') {
                const text = document.getElementById('mixerPasteInput')?.value || '';
                if (!text.trim()) {
                    alert("Vui lòng dán nội dung mã nguồn LaTeX!");
                    return;
                }
                inputData = text;
            } else if (activeTab === 'bank') {
                const examId = document.getElementById('mixerBankSelect')?.value;
                if (!examId) {
                    alert("Vui lòng chọn một đề thi từ ngân hàng!");
                    return;
                }
                const examObj = (window.examData || []).find(e => e.id === examId);
                if (!examObj) {
                    alert("Không tìm thấy dữ liệu đề thi đã chọn!");
                    return;
                }
                inputData = examObj.questions || [];
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang trộn đề thi...';
            if (pBox) pBox.classList.remove('hidden');

            const count = parseInt(document.getElementById('mixerExamCount')?.value || 4, 10);
            const codesStr = document.getElementById('mixerCodesPreview')?.value || '1001, 1002, 1003, 1004';
            const maDeList = codesStr.split(',').map(s => s.trim()).filter(Boolean);

            const engine = new ExamMixerEngine(inputData, {
                so_de: count,
                ma_de_list: maDeList,
                ma_de_digits: window._mixerDigits || 4,
                dao_cau: document.getElementById('mixerShuffleQuestions')?.checked !== false,
                dao_pa: document.getElementById('mixerShuffleOptions')?.checked !== false,
                dao_y_tf: document.getElementById('mixerShuffleTf')?.checked !== false,
                phannhom: document.getElementById('mixerPhanNhom')?.value || 'Không phân nhóm',
                output_format: document.getElementById('mixerOutputFormat')?.value || 'both',
                header: {
                    style: document.getElementById('mixerHeaderStyle')?.value || 'standard_gov',
                    agency: document.getElementById('mixerAgencyName')?.value || 'SỞ GD&ĐT HÀ NỘI',
                    school: document.getElementById('mixerSchoolName')?.value || 'TRƯỜNG THPT TRẦN QUANG KHẢI',
                    title: document.getElementById('mixerTitleInput')?.value || 'KIỂM TRA HỌC KỲ I',
                    examType: document.getElementById('mixerExamType')?.value || '(ĐỀ CHÍNH THỨC)',
                    subject: document.getElementById('mixerSubject')?.value || 'TOÁN HỌC',
                    grade: document.getElementById('mixerGrade')?.value || '9',
                    duration: parseInt(document.getElementById('mixerDuration')?.value || 90, 10),
                    candidateInfo: true
                }
            });

            const result = await engine.mix((pct, msg) => {
                if (pBar) pBar.style.width = pct + '%';
                if (pPct) pPct.textContent = pct + '%';
                if (pText) pText.textContent = msg;
            });

            // Tự động tải file ZIP
            const safeTitle = (document.getElementById('mixerTitleInput')?.value || 'De_Thi').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
            const zipName = `Bo_De_Tron_${safeTitle}_${maDeList.length}_MaDe.zip`;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(result.zipBlob);
            a.download = zipName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            if (window.showToast) window.showToast(`Trộn thành công ${maDeList.length} mã đề thi! Đang tải file ZIP...`, 'success');
            else if (window.showNotification) window.showNotification(`Trộn thành công ${maDeList.length} mã đề thi!`, 'success');

            setTimeout(() => {
                window.closeExamMixerModal();
            }, 1200);

        } catch (err) {
            console.error("[ExamMixer] Lỗi:", err);
            alert("Lỗi trộn đề: " + (err.message || err.toString()));
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-shuffle"></i> Bắt đầu Trộn &amp; Tải ZIP';
        }
    };

    // Exports
    window.DocxDirectMixer = DocxDirectMixer;
    window.ExamMixerEngine = ExamMixerEngine;
    window.openExamMixerModal = openExamMixerModal;
    window.closeExamMixerModal = closeExamMixerModal;

})(typeof window !== 'undefined' ? window : this);
