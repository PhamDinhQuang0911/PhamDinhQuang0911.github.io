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
        return rawAns.replace(/[\$\s\~]|\\,|\\;/g, '').replace(/\{,\}/g, ',').replace(/\./g, ',').trim();
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
    // 3. ĐỘNG CƠ TRỘN ĐỀ HOÀN CHỈNH (EXAM MIXER ENGINE)
    // =======================================================
    class ExamMixerEngine {
        constructor(inputData, config = {}) {
            this.inputData = inputData; // raw tex string, docx buffer, or questions array
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
         * Chạy tiến trình trộn đề
         */
        async mix(progressCallback = null) {
            const report = (pct, msg) => {
                if (typeof progressCallback === 'function') progressCallback(pct, msg);
            };

            report(5, "Đang khởi tạo dữ liệu đề gốc...");

            let texContent = "";
            let parsedQuestions = [];

            if (typeof this.inputData === 'string') {
                texContent = this.inputData;
            } else if (Array.isArray(this.inputData)) {
                parsedQuestions = this.inputData;
                // Chuyển danh sách câu hỏi thành TeX
                texContent = this.convertQuestionsArrayToTex(parsedQuestions);
            } else if (this.inputData instanceof ArrayBuffer || this.inputData instanceof Blob) {
                report(10, "Đang phân tích file Word DOCX...");
                if (window.QuestionImporter && typeof window.QuestionImporter.parseWordFile === 'function') {
                    parsedQuestions = await window.QuestionImporter.parseWordFile(this.inputData);
                    texContent = this.convertQuestionsArrayToTex(parsedQuestions);
                } else {
                    throw new Error("Không tìm thấy bộ phân tích Word (QuestionImporter).");
                }
            }

            // Chuẩn hóa và trích xuất các khối câu hỏi {ex} và {bt}
            texContent = texContent.replace(/\\%/g, 'DPSpercent');
            const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
            const btRegex = /\\begin\{bt\}([\s\S]*?)\\end\{bt\}/g;

            const exRaw = [];
            let m;
            while ((m = exRegex.exec(texContent)) !== null) exRaw.push(m[1]);

            const btBlocks = [];
            while ((m = btRegex.exec(texContent)) !== null) btBlocks.push(m[1]);

            if (exRaw.length === 0 && btBlocks.length === 0) {
                throw new Error("Không tìm thấy câu hỏi \\begin{ex} hoặc \\begin{bt} nào trong nội dung đầu vào!");
            }

            // Phân nhóm câu hỏi gốc
            const degocCh = [];
            const degocTF = [];
            const degocSh = [];

            for (const ex of exRaw) {
                if (ex.includes('\\choiceTF')) degocTF.push(ex);
                else if (ex.includes('\\shortans') || ex.includes('\\SA')) degocSh.push(ex);
                else if (ex.includes('\\choice')) degocCh.push(ex);
                else degocCh.push(ex);
            }

            const maDeList = this.config.ma_de_list || ['1001', '1002', '1003', '1004'];
            const cacDeDaTron = {};
            const matrixData = [];
            const totalExams = maDeList.length;

            report(20, `Bắt đầu trộn ${totalExams} mã đề thi...`);

            for (let idx = 0; idx < totalExams; idx++) {
                const maDe = maDeList[idx];
                const pct = 20 + Math.floor((idx / totalExams) * 50);
                report(pct, `Đang trộn đề mã ${maDe} (${idx + 1}/${totalExams})...`);

                let currCh = [...degocCh];
                let currTf = [...degocTF];
                let currSh = [...degocSh];

                // 1. Đảo câu hỏi nếu bật
                if (this.config.dao_cau) {
                    currCh = smartShuffleQuestions(currCh, this.config.phannhom);
                    currTf = smartShuffleQuestions(currTf, this.config.phannhom);
                    currSh = smartShuffleQuestions(currSh, this.config.phannhom);
                }

                // 2. Đảo phương án trắc nghiệm
                if (this.config.dao_pa) {
                    currCh = currCh.map(ex => shuffleOptionsInQuestion(ex));
                }

                // 3. Đảo ý Đúng / Sai kèm đồng bộ lời giải \itemch
                if (this.config.dao_y_tf) {
                    currTf = currTf.map(ex => shuffleOptionsInQuestion(ex));
                }

                // 4. Thu thập đáp án ma trận
                const ansP1 = currCh.map(ex => getAnswerChoice(ex));
                const ansP2 = currTf.map(ex => getAnswerChoiceTF(ex));
                const ansP3Raw = currSh.map(ex => getAnswerShortRaw(ex));

                matrixData.push({
                    made: maDe,
                    p1: ansP1,
                    p2: ansP2,
                    p3_raw: ansP3Raw,
                    p3: ansP3Raw.map(r => cleanShortAnswer(r))
                });

                // 5. Gom các phần đề thi hoàn chỉnh
                const orderedBlocks = [];
                if (currCh.length > 0) {
                    orderedBlocks.push(`\\subsection{Câu trắc nghiệm nhiều phương án lựa chọn}\n\\noindent \\textit{Thí sinh trả lời từ câu 1 đến câu ${currCh.length}. Mỗi câu hỏi, thí sinh chỉ chọn một phương án trả lời.}\n\n\\setcounter{ex}{0}\n` +
                        currCh.map(ex => `\\begin{ex}${ex}\\end{ex}`).join('\n\n'));
                }
                if (currTf.length > 0) {
                    orderedBlocks.push(`\\subsection{Câu trắc nghiệm Đúng/Sai}\n\\noindent \\textit{Thí sinh trả lời từ câu 1 đến câu ${currTf.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.}\n\n\\setcounter{ex}{0}\n` +
                        currTf.map(ex => `\\begin{ex}${ex}\\end{ex}`).join('\n\n'));
                }
                if (currSh.length > 0) {
                    orderedBlocks.push(`\\subsection{Câu trắc nghiệm trả lời ngắn}\n\\noindent \\textit{Thí sinh trả lời từ câu 1 đến câu ${currSh.length}.}\n\n\\setcounter{ex}{0}\n` +
                        currSh.map(ex => `\\begin{ex}${ex}\\end{ex}`).join('\n\n'));
                }
                if (btBlocks.length > 0) {
                    orderedBlocks.push(`\\subsection{Bài tập tự luận}\n\\setcounter{bt}{0}\n` +
                        btBlocks.map(bt => `\\begin{bt}${bt}\\end{bt}`).join('\n\n'));
                }

                cacDeDaTron[maDe] = orderedBlocks;
            }

            report(75, "Đang tạo bảng ma trận đáp án và file đóng gói ZIP...");

            // Tạo gói ZIP xuất ra cho người dùng
            const zip = new JSZip();

            // 1. Xuất file Excel ma trận đáp án
            const xlsxBlob = this.buildMasterAnswerExcel(matrixData);
            zip.file("Bang_Dap_An_Tong_Hop.xlsx", xlsxBlob);

            // 2. Xuất các file LaTeX (.tex) cho từng mã đề
            const dataFolder = zip.folder("data");
            const headerCfg = this.config.header || {};

            for (const maDe of maDeList) {
                const blocks = cacDeDaTron[maDe];
                let texFile = `\\newpage\n\\setcounter{page}{1}\n\\madethi{${maDe}}\n\\setcounter{ex}{0}\\setcounter{bt}{0}\n\n`;
                texFile += blocks.join('\n\n');
                texFile += `\n\n\\begin{center}\\bf\n----- HẾT -----\n\\end{center}\n\\label{${maDe}}\n`;
                dataFolder.file(`${maDe}.tex`, texFile.replace(/DPSpercent/g, '\\%'));
            }

            // File Main đề bài và đáp án
            zip.file("Main_de_bai.tex", this.buildMainTex(maDeList, headerCfg, false));
            zip.file("Main_dap_an.tex", this.buildMainTex(maDeList, headerCfg, true));
            zip.file("BangDapAn.tex", this.buildBangDapAnTex(matrixData));

            // 3. Nếu người dùng chọn xuất Word (.docx): Tạo file Word cho từng mã đề
            if (this.config.output_format === 'word' || this.config.output_format === 'both') {
                report(85, "Đang xuất các file Word (.docx) từng mã đề...");
                const wordFolder = zip.folder("docx");

                for (let i = 0; i < maDeList.length; i++) {
                    const maDe = maDeList[i];
                    report(85 + Math.floor((i / maDeList.length) * 12), `Đang tạo file Word mã ${maDe}...`);
                    const examBlocks = cacDeDaTron[maDe];
                    const fullLatexExam = examBlocks.join('\n\n').replace(/DPSpercent/g, '\\%');

                    try {
                        const hConfig = {
                            style: headerCfg.style || 'standard_gov',
                            agency: headerCfg.agency || 'SỞ GD&ĐT HÀ NỘI',
                            school: headerCfg.school || 'TRƯỜNG THPT TRẦN QUANG KHẢI',
                            exam_type: headerCfg.examType || '(ĐỀ CHÍNH THỨC)',
                            title: headerCfg.title || 'ĐỀ THI',
                            subject: headerCfg.subject || 'TOÁN HỌC',
                            grade: headerCfg.grade || '9',
                            duration: headerCfg.duration || 90,
                            exam_code: maDe,
                            candidate_info: headerCfg.candidateInfo !== false
                        };

                        if (window.exportExamToWord) {
                            // Tạo docx blob bằng JS exporter hoặc Pyodide
                            const blobDocx = await window.createDocxBlob({
                                title: `${headerCfg.title || 'De_Thi'}_${maDe}`,
                                questions: fullLatexExam,
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
                                    includeCandidateInfo: hConfig.candidate_info
                                }
                            });
                            wordFolder.file(`De_${maDe}.docx`, blobDocx);
                        }
                    } catch (wErr) {
                        console.warn(`[Mixer] Không thể tạo file Word cho mã ${maDe}:`, wErr);
                    }
                }
            }

            report(98, "Đang nén file ZIP...");
            const finalZipBlob = await zip.generateAsync({ type: "blob" });
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

        buildMasterAnswerExcel(matrixData) {
            // Dùng SheetJS nếu có, hoặc tạo OpenXML thuần
            if (typeof XLSX !== 'undefined') {
                const wb = XLSX.utils.book_new();

                // Sheet 1: Ma trận đáp án
                const maxQ = Math.max(...matrixData.map(d => d.p1.length + d.p2.length + d.p3.length), 0);
                const headerRow = ["Câu \\ Mã đề", ...matrixData.map(d => d.made)];
                const rows = [headerRow];

                for (let q = 0; q < maxQ; q++) {
                    const row = [`Câu ${q + 1}`];
                    for (const d of matrixData) {
                        const totalList = [...d.p1, ...d.p2.map(s => s.split('').join('.')), ...d.p3];
                        row.push(q < totalList.length ? totalList[q] : "");
                    }
                    rows.push(row);
                }

                const ws1 = XLSX.utils.aoa_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws1, "Ma Trận Đáp Án");

                // Sheet 2: Định dạng SmartTest
                const stRows = [["Câu\\Mã đề", ...matrixData.map(d => d.made)]];
                for (let q = 0; q < 40; q++) {
                    stRows.push([q + 1, ...matrixData.map(d => (q < d.p1.length ? d.p1[q] : ""))]);
                }
                for (let q = 0; q < 8; q++) {
                    stRows.push([q + 1, ...matrixData.map(d => (q < d.p2.length ? d.p2[q] : ""))]);
                }
                for (let q = 0; q < 8; q++) {
                    stRows.push([q + 1, ...matrixData.map(d => (q < d.p3.length ? d.p3[q] : ""))]);
                }
                const ws2 = XLSX.utils.aoa_to_sheet(stRows);
                XLSX.utils.book_append_sheet(wb, ws2, "SmartTest");

                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                return new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            }

            // Fallback CSV nếu không có SheetJS
            let csv = "Cau\\Ma de," + matrixData.map(d => d.made).join(",") + "\n";
            return new Blob([csv], { type: "text/csv;charset=utf-8;" });
        }

        buildMainTex(maDeList, headerCfg, isDapAn = false) {
            const inputs = maDeList.map(md => `\\input{data/${md}}`).join('\n');
            const daInputs = isDapAn ? "\n\\newpage\n\\input{BangDapAn}\n" : "";
            return `\\documentclass[12pt,a4paper]{article}
\\usepackage{amsmath,amssymb,geometry}
\\usepackage[book]{ex_test}
\\geometry{top=1.5cm, bottom=1.8cm, left=1.5cm, right=1.5cm}
\\begin{document}
${inputs}
${daInputs}
\\end{document}`;
        }

        buildBangDapAnTex(matrixData) {
            if (!matrixData || matrixData.length === 0) return "";
            const maxQ = Math.max(...matrixData.map(d => d.p1.length + d.p2.length + d.p3.length), 0);
            let tex = "\\centerline{\\Large\\textbf{BẢNG ĐÁP ÁN CÁC MÃ ĐỀ THI}}\n\\vspace{0.3cm}\n\\begin{center}\n";
            tex += "\\begin{tabular}{|c|" + "c|".repeat(matrixData.length) + "}\n\\hline\n";
            tex += "\\textbf{Câu} & " + matrixData.map(d => `\\textbf{${d.made}}`).join(' & ') + " \\\\\n\\hline\n";

            for (let q = 0; q < maxQ; q++) {
                const cells = [String(q + 1)];
                for (const d of matrixData) {
                    const totalList = [...d.p1, ...d.p2.map(s => s.split('').join('.')), ...d.p3];
                    cells.push(q < totalList.length ? totalList[q] : "");
                }
                tex += cells.join(' & ') + " \\\\\n\\hline\n";
            }
            tex += "\\end{tabular}\n\\end{center}\n";
            return tex;
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
                            <p class="text-[11px] text-gray-500 dark:text-gray-400">Đảo câu hỏi, đảo phương án, phân nhóm ID6, xuất ma trận đáp án Excel &amp; file Word/TeX</p>
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
                                            <option value="both" selected>📦 Đầy đủ: Word (.docx) + LaTeX (.tex) + Excel ma trận</option>
                                            <option value="word">📄 File Word (.docx) + Excel ma trận</option>
                                            <option value="tex">📐 File LaTeX (.tex) + Excel ma trận</option>
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
    window.ExamMixerEngine = ExamMixerEngine;
    window.openExamMixerModal = openExamMixerModal;
    window.closeExamMixerModal = closeExamMixerModal;

})(typeof window !== 'undefined' ? window : this);
