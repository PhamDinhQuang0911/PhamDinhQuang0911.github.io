/**
 * word-mathtype-exporter.js
 * Module xuất đề thi sang Microsoft Word (.docx) chuẩn MathType OLE / TeX
 * Theo tiêu chuẩn BTN Group / Bộ Giáo dục & Đào tạo (BTPRO)
 * Tác giả: Thầy Choang Choang (Phạm Đình Quang) - https://www.qmath.io.vn
 *
 * Tính năng chính:
 * 1. Tạo file Word .docx nền trắng hoàn toàn (Không header/footer rác, không watermark).
 * 2. Căn lề chuẩn A4 BTN Group: Trái 2.0cm, Phải 1.0cm, Trên 1.0cm, Dưới 1.0cm. Font Times New Roman 12pt.
 * 3. Thụt lề Câu 1.75cm (Hanging indent 1.75cm).
 * 4. Tự động chia 4 cột (Tab 6.0 - 10.0 - 14.0 cm), 2 cột (Tab 10.0 cm) hoặc 1 dòng cho phương án A, B, C, D.
 * 5. Tương thích 100% với MathType (nhấn Alt+\ hoặc ribbon "Convert Equations" trong Word để chuyển thành MathType OLE).
 * 6. Hỗ trợ xuất 3 chế độ: Chỉ Đề bài (Học sinh), Bản Đầy đủ có lời giải (Giáo viên), hoặc Cả 2 bản (.ZIP).
 */

(function(window) {
    'use strict';

    // Hàm mã hóa chuỗi an toàn cho OpenXML
    function escapeXml(unsafe) {
        if (unsafe === undefined || unsafe === null) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    // Làm sạch HTML và ký tự đặc biệt sang text/LaTeX
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

    // Tách văn bản thành các run (text thường, in đậm, in nghiêng, công thức)
    function parseRunsFromText(rawText, baseBold = false, baseItalic = false) {
        if (!rawText) return [];
        const text = String(rawText);
        const tokens = text.split(/(\\textbf\{[^{}]*\}|\\textit\{[^{}]*\}|\\underline\{[^{}]*\}|\$\$.*?\$\$|\$[^\$]+?\$|\\\[.*?\\\]|\\\(.*?\\\))/g);
        const runs = [];

        for (const tok of tokens) {
            if (!tok) continue;
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
            // Math formula or plain text
            runs.push({ text: tok, bold: baseBold, italic: baseItalic });
        }
        return runs;
    }

    // Chuyển danh sách runs thành các thẻ <w:r>
    function renderRunsToXml(runs, extraColor = null) {
        return runs.map(r => {
            const bTag = r.bold ? '<w:b/>' : '';
            const iTag = r.italic ? '<w:i/>' : '';
            const uTag = r.underline ? '<w:u w:val="single"/>' : '';
            const colTag = (extraColor || r.color) ? `<w:color w:val="${extraColor || r.color}"/>` : '';
            return `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>${bTag}${iTag}${uTag}${colTag}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(r.text)}</w:t></w:r>`;
        }).join('');
    }

    /**
     * Tạo file XML tài liệu chính của Word (word/document.xml)
     */
    function buildDocumentXml({ title, questions, mode = 'questions', options = {} }) {
        const {
            schoolName = 'HỆ THỐNG GIÁO DỤC QMATH',
            examCode = '001',
            duration = 90,
            includeAnswerTable = true,
            includeCccd = false
        } = options;

        let bodyXml = '';

        // 1. HEADER ĐỀ THI CHUẨN BỘ GD & BTPRO
        bodyXml += `
        <w:p>
          <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(schoolName.toUpperCase())}</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>
          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>${escapeXml(title.toUpperCase())}</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr>
          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Môn: TOÁN - Thời gian làm bài: ${duration} phút (Không kể thời gian phát đề) - Mã đề: ${escapeXml(examCode)}</w:t></w:r>
        </w:p>
        <w:p>
          <w:pPr><w:spacing w:after="240"/><w:jc w:val="both"/></w:pPr>
          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Họ và tên thí sinh: ............................................................................ Số báo danh: ............................</w:t></w:r>
        </w:p>`;

        // Phân loại các câu hỏi theo 4 phần
        const part1 = []; // Trắc nghiệm 4 lựa chọn
        const part2 = []; // Trắc nghiệm Đúng / Sai
        const part3 = []; // Trắc nghiệm Trả lời ngắn
        const part4 = []; // Tự luận

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

        // Hàm render tiêu đề phần thi
        const renderSectionHeader = (roman, titleText, descText) => `
        <w:p>
          <w:pPr><w:spacing w:before="240" w:after="60"/></w:pPr>
          <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t>PHẦN ${roman}. ${escapeXml(titleText.toUpperCase())}</w:t></w:r>
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

                // Paragraph câu hỏi (thụt lề 1.75cm)
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
                  ${renderRunsToXml(runs)}
                </w:p>`;

                // Options (A, B, C, D)
                const options = Array.isArray(q.options) ? q.options : [];
                if (options.length > 0) {
                    const letters = ['A', 'B', 'C', 'D'];
                    const cleanOpts = options.map(o => cleanHtmlToWordText(typeof o === 'object' ? (o.text || '') : o));
                    const maxLen = Math.max(...cleanOpts.map(o => o.length));
                    const correctIdx = typeof q.correct === 'number' ? q.correct : (q.correctAnswer ? ['A','B','C','D'].indexOf(String(q.correctAnswer).trim().toUpperCase()) : -1);

                    if (cleanOpts.length === 4 && maxLen <= 24) {
                        // 4 cột: Tab 6.0cm, 10.0cm, 14.0cm
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
                            ${renderRunsToXml(parseRunsFromText(optText))}`;
                        });
                        bodyXml += `</w:p>`;
                    } else if (cleanOpts.length === 4 && maxLen <= 45) {
                        // 2 cột: Tab 10.0cm
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
                                ${renderRunsToXml(parseRunsFromText(cleanOpts[oIdx]))}`;
                            }
                            bodyXml += `</w:p>`;
                        }
                    } else {
                        // 1 cột (Mỗi dòng một đáp án)
                        cleanOpts.forEach((optText, oIdx) => {
                            const isCorrect = (oIdx === correctIdx);
                            const isTeacherMode = (mode === 'full');
                            const bTag = isTeacherMode && isCorrect ? '<w:b/><w:u w:val="single"/>' : '<w:b/>';
                            bodyXml += `
                            <w:p>
                              <w:pPr><w:ind w:left="992"/><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr>
                              <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>${bTag}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${letters[oIdx] || ''}. </w:t></w:r>
                              ${renderRunsToXml(parseRunsFromText(optText))}
                            </w:p>`;
                        });
                    }
                }

                // Lời giải (khi ở chế độ Full)
                if (mode === 'full' && (q.solution || q.loigiai || q.explanation)) {
                    const sol = cleanHtmlToWordText(q.solution || q.loigiai || q.explanation);
                    bodyXml += `
                    <w:p>
                      <w:pPr>
                        <w:ind w:left="992" w:hanging="992"/>
                        <w:spacing w:before="60" w:after="60" w:line="276" w:lineRule="auto"/>
                        <w:jc w:val="both"/>
                      </w:pPr>
                      <w:r>
                        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="0066CC"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                        <w:t xml:space="preserve">Lời giải: </w:t>
                      </w:r>
                      ${renderRunsToXml(parseRunsFromText(sol), false, false)}
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
                    <w:spacing w:before="80" w:after="40" w:line="276" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                    <w:t xml:space="preserve">${escapeXml(cccdTag)}Câu ${qNum}. </w:t>
                  </w:r>
                  ${renderRunsToXml(parseRunsFromText(qContent))}
                </w:p>`;

                const stmts = Array.isArray(q.statements) ? q.statements : (Array.isArray(q.options) ? q.options.map((t, idx) => ({ text: t, isTrue: (q.correctAnswer || '').split(',')[idx] === 'D' })) : []);
                const letters = ['a', 'b', 'c', 'd'];

                stmts.forEach((st, sIdx) => {
                    const stText = cleanHtmlToWordText(typeof st === 'object' ? (st.text || st.content || '') : st);
                    const isTrue = (st.isTrue === true || st.isCorrect === true || st.correct === true);
                    const statusStr = (mode === 'full') ? (isTrue ? ' [ĐÚNG]' : ' [SAI]') : '';
                    const statusColor = isTrue ? '008000' : 'DC2626';

                    bodyXml += `
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${letters[sIdx]}) </w:t></w:r>
                      ${renderRunsToXml(parseRunsFromText(stText))}
                      ${mode === 'full' ? `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${statusColor}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${statusStr}</w:t></w:r>` : ''}
                    </w:p>`;
                });

                if (mode === 'full' && (q.solution || q.loigiai || q.explanation)) {
                    const sol = cleanHtmlToWordText(q.solution || q.loigiai || q.explanation);
                    bodyXml += `
                    <w:p>
                      <w:pPr>
                        <w:ind w:left="992" w:hanging="992"/>
                        <w:spacing w:before="60" w:after="60" w:line="276" w:lineRule="auto"/>
                        <w:jc w:val="both"/>
                      </w:pPr>
                      <w:r>
                        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="0066CC"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                        <w:t xml:space="preserve">Lời giải: </w:t>
                      </w:r>
                      ${renderRunsToXml(parseRunsFromText(sol))}
                    </w:p>`;
                }
            });
        }

        // ================= PHẦN III: TRẢ LỜI NGẮN =================
        if (part3.length > 0) {
            bodyXml += renderSectionHeader(
                romanNumerals[currentRoman - 1],
                'CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN',
                `Thí sinh trả lời từ câu 1 đến câu ${part3.length}.`
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
                    <w:spacing w:before="80" w:after="40" w:line="276" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                    <w:t xml:space="preserve">${escapeXml(cccdTag)}Câu ${qNum}. </w:t>
                  </w:r>
                  ${renderRunsToXml(parseRunsFromText(qContent))}
                </w:p>`;

                const ans = String(q.answer !== undefined && q.answer !== null ? q.answer : (q.correctAnswer || '')).trim();
                if (mode === 'full' && ans) {
                    bodyXml += `
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:after="40" w:line="276" w:lineRule="auto"/></w:pPr>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="008000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">Đáp số: </w:t></w:r>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(ans)}</w:t></w:r>
                    </w:p>`;
                } else if (mode === 'questions') {
                    bodyXml += `
                    <w:p>
                      <w:pPr><w:ind w:left="992"/><w:spacing w:after="60" w:line="276" w:lineRule="auto"/></w:pPr>
                      <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Đáp số: ....................................................................</w:t></w:r>
                    </w:p>`;
                }

                if (mode === 'full' && (q.solution || q.loigiai || q.explanation)) {
                    const sol = cleanHtmlToWordText(q.solution || q.loigiai || q.explanation);
                    bodyXml += `
                    <w:p>
                      <w:pPr>
                        <w:ind w:left="992" w:hanging="992"/>
                        <w:spacing w:before="60" w:after="60" w:line="276" w:lineRule="auto"/>
                        <w:jc w:val="both"/>
                      </w:pPr>
                      <w:r>
                        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="0066CC"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                        <w:t xml:space="preserve">Lời giải: </w:t>
                      </w:r>
                      ${renderRunsToXml(parseRunsFromText(sol))}
                    </w:p>`;
                }
            });
        }

        // ================= PHẦN IV: TỰ LUẬN =================
        if (part4.length > 0) {
            bodyXml += renderSectionHeader(
                romanNumerals[currentRoman - 1],
                'TỰ LUẬN',
                `Thí sinh trả lời từ câu 1 đến câu ${part4.length}.`
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
                    <w:spacing w:before="80" w:after="40" w:line="276" w:lineRule="auto"/>
                    <w:jc w:val="both"/>
                  </w:pPr>
                  <w:r>
                    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                    <w:t xml:space="preserve">${escapeXml(cccdTag)}Câu ${qNum}. </w:t>
                  </w:r>
                  ${renderRunsToXml(parseRunsFromText(qContent))}
                </w:p>`;

                if (mode === 'full' && (q.solution || q.loigiai || q.explanation)) {
                    const sol = cleanHtmlToWordText(q.solution || q.loigiai || q.explanation);
                    bodyXml += `
                    <w:p>
                      <w:pPr>
                        <w:ind w:left="992" w:hanging="992"/>
                        <w:spacing w:before="60" w:after="60" w:line="276" w:lineRule="auto"/>
                        <w:jc w:val="both"/>
                      </w:pPr>
                      <w:r>
                        <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="0066CC"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
                        <w:t xml:space="preserve">Lời giải: </w:t>
                      </w:r>
                      ${renderRunsToXml(parseRunsFromText(sol))}
                    </w:p>`;
                }
            });
        }

        // ================= BẢNG ĐÁP ÁN (ANSWER KEY TABLE) =================
        if (includeAnswerTable && (mode === 'full' || mode === 'both')) {
            bodyXml += `
            <w:p><w:pPr><w:pageBreakBefore/><w:jc w:val="center"/><w:spacing w:before="120" w:after="120"/></w:pPr>
              <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>BẢNG ĐÁP ÁN THAM KHẢO</w:t></w:r>
            </w:p>`;

            // Table Phần I (10 cột / dòng)
            if (part1.length > 0) {
                bodyXml += `
                <w:p><w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr>
                  <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Phần I: Câu trắc nghiệm nhiều phương án lựa chọn</w:t></w:r>
                </w:p>`;

                const letters = ['A', 'B', 'C', 'D'];
                const chunkSize = 10;
                for (let i = 0; i < part1.length; i += chunkSize) {
                    const chunk = part1.slice(i, i + chunkSize);
                    bodyXml += `
                    <w:tbl>
                      <w:tblPr>
                        <w:tblW w:w="5000" w:type="pct"/>
                        <w:jc w:val="center"/>
                        <w:tblBorders>
                          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                        </w:tblBorders>
                      </w:tblPr>
                      <w:tblGrid>
                        ${chunk.map(() => `<w:gridCol w:w="${Math.floor(9200 / chunk.length)}"/>`).join('')}
                      </w:tblGrid>
                      <w:tr>
                        ${chunk.map((_, cIdx) => `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${i + cIdx + 1}</w:t></w:r></w:p></w:tc>`).join('')}
                      </w:tr>
                      <w:tr>
                        ${chunk.map(q => {
                            const cIdx = typeof q.correct === 'number' ? q.correct : (q.correctAnswer ? ['A','B','C','D'].indexOf(String(q.correctAnswer).trim().toUpperCase()) : -1);
                            const ansChar = cIdx >= 0 ? letters[cIdx] : (q.correctAnswer || '-');
                            return `<w:tc><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="DC2626"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(ansChar)}</w:t></w:r></w:p></w:tc>`;
                        }).join('')}
                      </w:tr>
                    </w:tbl>`;
                }
            }

            // Table Phần II (Đúng / Sai)
            if (part2.length > 0) {
                bodyXml += `
                <w:p><w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr>
                  <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Phần II: Câu trắc nghiệm đúng sai</w:t></w:r>
                </w:p>
                <w:tbl>
                  <w:tblPr>
                    <w:tblW w:w="5000" w:type="pct"/>
                    <w:jc w:val="center"/>
                    <w:tblBorders>
                      <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                      <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                      <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                    </w:tblBorders>
                  </w:tblPr>
                  <w:tblGrid>
                    <w:gridCol w:w="1600"/>
                    <w:gridCol w:w="1900"/>
                    <w:gridCol w:w="1900"/>
                    <w:gridCol w:w="1900"/>
                    <w:gridCol w:w="1900"/>
                  </w:tblGrid>
                  <w:tr>
                    <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Câu</w:t></w:r></w:p></w:tc>
                    <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Ý a)</w:t></w:r></w:p></w:tc>
                    <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Ý b)</w:t></w:r></w:p></w:tc>
                    <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Ý c)</w:t></w:r></w:p></w:tc>
                    <w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Ý d)</w:t></w:r></w:p></w:tc>
                  </w:tr>
                  ${part2.map((q, pIdx) => {
                      const stmts = Array.isArray(q.statements) ? q.statements : (Array.isArray(q.options) ? q.options.map((t, idx) => ({ text: t, isTrue: (q.correctAnswer || '').split(',')[idx] === 'D' })) : []);
                      const getDs = (idx) => {
                          if (!stmts[idx]) return '-';
                          const isTrue = (stmts[idx].isTrue === true || stmts[idx].isCorrect === true || stmts[idx].correct === true);
                          return isTrue ? 'Đ' : 'S';
                      };
                      return `
                      <w:tr>
                        <w:tc><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Câu ${pIdx + 1}</w:t></w:r></w:p></w:tc>
                        <w:tc><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${getDs(0) === 'Đ' ? '008000' : 'DC2626'}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${getDs(0)}</w:t></w:r></w:p></w:tc>
                        <w:tc><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${getDs(1) === 'Đ' ? '008000' : 'DC2626'}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${getDs(1)}</w:t></w:r></w:p></w:tc>
                        <w:tc><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${getDs(2) === 'Đ' ? '008000' : 'DC2626'}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${getDs(2)}</w:t></w:r></w:p></w:tc>
                        <w:tc><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="${getDs(3) === 'Đ' ? '008000' : 'DC2626'}"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${getDs(3)}</w:t></w:r></w:p></w:tc>
                      </w:tr>`;
                  }).join('')}
                </w:tbl>`;
            }

            // Table Phần III (Trả lời ngắn)
            if (part3.length > 0) {
                bodyXml += `
                <w:p><w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr>
                  <w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Phần III: Câu trắc nghiệm trả lời ngắn</w:t></w:r>
                </w:p>`;

                const chunkSize = 10;
                for (let i = 0; i < part3.length; i += chunkSize) {
                    const chunk = part3.slice(i, i + chunkSize);
                    bodyXml += `
                    <w:tbl>
                      <w:tblPr>
                        <w:tblW w:w="5000" w:type="pct"/>
                        <w:jc w:val="center"/>
                        <w:tblBorders>
                          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
                        </w:tblBorders>
                      </w:tblPr>
                      <w:tblGrid>
                        ${chunk.map(() => `<w:gridCol w:w="${Math.floor(9200 / chunk.length)}"/>`).join('')}
                      </w:tblGrid>
                      <w:tr>
                        ${chunk.map((_, cIdx) => `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="E5E7EB"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>${i + cIdx + 1}</w:t></w:r></w:p></w:tc>`).join('')}
                      </w:tr>
                      <w:tr>
                        ${chunk.map(q => {
                            const ans = String(q.answer !== undefined && q.answer !== null ? q.answer : (q.correctAnswer || '-')).trim();
                            return `<w:tc><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="20" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:b/><w:color w:val="008000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>${escapeXml(ans)}</w:t></w:r></w:p></w:tc>`;
                        }).join('')}
                      </w:tr>
                    </w:tbl>`;
                }
            }
        }

        // Thiết lập kích thước A4 và căn lề BTN Group (L:2cm, R:1cm, T:1cm, B:1cm)
        bodyXml += `
        <w:sectPr>
          <w:pgSz w:w="11906" w:h="16838"/>
          <w:pgMar w:top="567" w:right="567" w:bottom="567" w:left="1134" w:header="340" w:footer="340"/>
        </w:sectPr>`;

        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`;
    }

    /**
     * Tạo file .docx hoàn chỉnh dạng Blob
     */
    async function createDocxBlob({ title, questions, mode, options }) {
        if (typeof JSZip === 'undefined') {
            throw new Error('Thư viện JSZip chưa được tải!');
        }

        const zip = new JSZip();

        // 1. [Content_Types].xml
        zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);

        // 2. _rels/.rels
        zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

        // 3. word/_rels/document.xml.rels
        zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

        // 4. word/styles.xml
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
        <w:spacing w:line="276" w:lineRule="auto" w:after="40"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`);

        // 5. word/document.xml
        const docXml = buildDocumentXml({ title, questions, mode, options });
        zip.file('word/document.xml', docXml);

        return await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
    }

    // Tự động tải file blob về máy
    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // Tạo slug an toàn cho tên file
    function sanitizeFilename(name) {
        if (!name) return 'De_Thi';
        return name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-zA-Z0-9_\- ]/g, '')
            .trim()
            .replace(/\s+/g, '_');
    }

    /**
     * Xuất đề thi ra Word theo cấu hình
     */
    async function exportExamToWord(examData, options = {}) {
        if (!examData) {
            throw new Error('Dữ liệu đề thi không hợp lệ!');
        }

        const title = examData.title || 'Đề thi';
        const questions = Array.isArray(examData.questions) ? examData.questions : [];
        const baseName = sanitizeFilename(title);
        const mode = options.mode || 'questions'; // 'questions' | 'full' | 'both'

        if (mode === 'both') {
            // Tạo cả 2 bản và nén vào 1 file ZIP
            const qBlob = await createDocxBlob({ title, questions, mode: 'questions', options });
            const fullBlob = await createDocxBlob({ title, questions, mode: 'full', options });

            const zip = new JSZip();
            zip.file(`${baseName}_De_Bai.docx`, qBlob);
            zip.file(`${baseName}_De_Va_Loi_Giai.docx`, fullBlob);

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            triggerDownload(zipBlob, `${baseName}_Word_MathType.zip`);
        } else if (mode === 'full') {
            const blob = await createDocxBlob({ title, questions, mode: 'full', options });
            triggerDownload(blob, `${baseName}_De_Va_Loi_Giai.docx`);
        } else {
            const blob = await createDocxBlob({ title, questions, mode: 'questions', options });
            triggerDownload(blob, `${baseName}_De_Bai.docx`);
        }
    }

    // Modal UI tương tác khi người dùng bấm "Xuất Word"
    function openExportWordModal(examOrId, preloadedQuestions = null) {
        let modal = document.getElementById('exportWordModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'exportWordModal';
            modal.className = 'fixed inset-0 z-[160] bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 transition-opacity';
            modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-5 border border-gray-100 dark:border-gray-700 animate-scale-in">
                <div class="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
                    <div class="flex items-center gap-2.5">
                        <span class="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg">
                            <i class="fa-solid fa-file-word"></i>
                        </span>
                        <div>
                            <h3 class="font-bold text-gray-800 dark:text-gray-100 text-sm sm:text-base">Xuất Word (MathType BTPRO)</h3>
                            <p class="text-[11px] text-gray-400">Chuẩn A4, Times New Roman 12pt, Nền trắng</p>
                        </div>
                    </div>
                    <button type="button" onclick="window.closeExportWordModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg text-lg">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="py-4 space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Tên đề thi</label>
                        <input type="text" id="exportWordTitleInput" class="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>

                    <div>
                        <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Chế độ xuất file</label>
                        <div class="grid grid-cols-1 gap-2">
                            <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 cursor-pointer transition">
                                <input type="radio" name="exportWordMode" value="questions" checked class="text-blue-600 focus:ring-blue-500">
                                <div>
                                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">📝 Chỉ Đề bài (Học sinh)</p>
                                    <p class="text-[10px] text-gray-400">Ẩn lời giải, chỉ giữ nội dung câu hỏi và các phương án</p>
                                </div>
                            </label>
                            <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 cursor-pointer transition">
                                <input type="radio" name="exportWordMode" value="full" class="text-blue-600 focus:ring-blue-500">
                                <div>
                                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">📘 Bản Đầy đủ có lời giải (Giáo viên)</p>
                                    <p class="text-[10px] text-gray-400">Gạch chân đáp án đúng và kèm toàn bộ lời giải chi tiết</p>
                                </div>
                            </label>
                            <label class="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 cursor-pointer transition">
                                <input type="radio" name="exportWordMode" value="both" class="text-blue-600 focus:ring-blue-500">
                                <div>
                                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">📦 Xuất cả 2 bản (.ZIP)</p>
                                    <p class="text-[10px] text-gray-400">Tải về cùng lúc 1 file Đề bài và 1 file Đề có lời giải</p>
                                </div>
                            </label>
                        </div>
                    </div>

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

                    <div class="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900/50 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
                        <i class="fa-solid fa-circle-info mt-0.5 text-blue-600"></i>
                        <span>File xuất tương thích 100% với MathType. Mở trong Word nhấn <b>Alt+\\</b> hoặc chọn MathType ➔ Convert Equations để chuyển thành công thức MathType OLE.</span>
                    </div>
                </div>

                <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <button type="button" onclick="window.closeExportWordModal()" class="px-3.5 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition cursor-pointer">Hủy</button>
                    <button type="button" id="btnConfirmExportWord" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-sm flex items-center gap-1.5 cursor-pointer">
                        <i class="fa-solid fa-download"></i> Tải file Word (.docx)
                    </button>
                </div>
            </div>`;
            document.body.appendChild(modal);
        }

        // Tìm dữ liệu đề thi
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

        const btnConfirm = document.getElementById('btnConfirmExportWord');
        if (btnConfirm) {
            btnConfirm.onclick = async () => {
                try {
                    btnConfirm.disabled = true;
                    btnConfirm.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang xuất Word...';

                    let fullExam = examObj;
                    // Nạp đầy đủ câu hỏi nếu thiếu
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
                    const incTable = document.getElementById('exportWordIncludeAnswerTable')?.checked !== false;
                    const incCccd = document.getElementById('exportWordIncludeCccd')?.checked === true;

                    await exportExamToWord(fullExam, {
                        mode: selectedMode,
                        includeAnswerTable: incTable,
                        includeCccd: incCccd,
                        schoolName: 'HỆ THỐNG GIÁO DỤC QMATH',
                        examCode: fullExam.examCode || '001',
                        duration: fullExam.duration || 90
                    });

                    if (window.showToast) window.showToast('Xuất file Word thành công!', 'success');
                    else if (window.showNotification) window.showNotification('Xuất file Word thành công!', 'success');
                    window.closeExportWordModal();
                } catch (err) {
                    console.error('Lỗi xuất Word:', err);
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
                        options: { schoolName: 'HỆ THỐNG GIÁO DỤC QMATH', duration: fullDoc.duration || 90 }
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

    // Đưa vào window scope
    window.WordMathTypeExporter = {
        buildDocumentXml,
        createDocxBlob,
        exportExamToWord,
        openExportWordModal,
        closeExportWordModal
    };
    window.openExportWordModal = openExportWordModal;
    window.closeExportWordModal = closeExportWordModal;
    window.exportExamToWord = (id) => openExportWordModal(id);

})(typeof window !== 'undefined' ? window : this);
