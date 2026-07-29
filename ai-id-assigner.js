/**
 * ai-id-assigner.js
 * Module dùng chung: Gán ID câu hỏi bằng AI (Gemini 3.5 Flash / 3.6 Flash)
 * Được gọi sau khi parse file .tex thành mảng câu hỏi.
 * Tích hợp với globalIdTree (từ Firestore "configurations/map_id_tree")
 * và window.aiKeys (từ Firestore "configurations/ai_keys").
 *
 * API công khai:
 *   window.checkAndAssignMissingIds(questions, options?)
 *   Trả về Promise<questions[]> (mảng câu hỏi đã được gán ID đầy đủ)
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 1: BUILD MAP-CONTEXT TỪ CÂY GLOBALIDTREE (THAY FILE TXT)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Duyệt cây globalIdTree đệ quy và sinh ra context string cho AI prompt.
     * Cấu trúc node: { id, name, level, children[] }
     */
    function buildMapContextFromTree(tree) {
        if (!tree || tree.length === 0) return '';

        let ctx = '--- Cấu trúc MapID (cây phân cấp, mỗi node có dạng [ID] Tên) ---\n';

        function traverse(nodes, depth) {
            for (const node of nodes) {
                ctx += '  '.repeat(depth) + `[${node.id}] ${node.name}\n`;
                if (node.children && node.children.length > 0) {
                    traverse(node.children, depth + 1);
                }
            }
        }
        traverse(tree, 0);

        ctx += `\n--- Định nghĩa chi tiết mức độ ---\n`;
        ctx += `[N] Nhận biết (Điểm 1-4): Câu hỏi dễ nhất. Học sinh nhớ lại, nhận ra, xác định thông tin đã học. Chỉ cần liệt kê, mô tả cơ bản.\n`;
        ctx += `[H] Thông hiểu (Điểm 3-7): Yêu cầu hiểu ý nghĩa, giải thích, so sánh. Vận dụng trực tiếp công thức vào tình huống quen thuộc.\n`;
        ctx += `[V] Vận dụng (Điểm 7-8.4): Sử dụng kiến thức giải quyết vấn đề trong tình huống mới. Tính toán qua nhiều bước.\n`;
        ctx += `[C] Vận dụng cao (Điểm 8.5-10): Câu hỏi khó. Suy luận logic, tổng hợp, tình huống mới lạ, đòi hỏi tư duy sáng tạo.\n`;
        ctx += `--------------------------------------\n`;

        return ctx;
    }

    /**
     * Duyệt cây tìm node theo id, trả về full path [{id,name}]
     */
    function findPathById(tree, targetId, path = []) {
        for (const node of tree) {
            const newPath = [...path, { id: node.id, name: node.name, level: node.level }];
            if (node.id === targetId) return newPath;
            if (node.children && node.children.length > 0) {
                const found = findPathById(node.children, targetId, newPath);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Tìm tên node theo id
     */
    function findNameById(tree, targetId) {
        const path = findPathById(tree, targetId);
        if (!path) return null;
        return path[path.length - 1].name;
    }

    /**
     * Tìm tất cả node ID và name để AI kiểm tra
     */
    function getAllNodeIds(tree, result = []) {
        for (const node of tree) {
            result.push({ id: node.id, name: node.name, level: node.level });
            if (node.children && node.children.length > 0) {
                getAllNodeIds(node.children, result);
            }
        }
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 2: GỌI API GEMINI (GIỮ NGUYÊN LOGIC TỪ BẢN GỐC)
    // ═══════════════════════════════════════════════════════════════

    const delay = ms => new Promise(res => setTimeout(res, ms));

    async function callGeminiApi(prompt, systemPrompt, apiKey, modelId) {
        const model = modelId || 'gemini-3.5-flash';
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        topicId:  { type: 'STRING' }, // ID node trong cây (bao gồm cả ID bài & dạng)
                        mucdo:    { type: 'STRING' }, // N / H / V / C
                        reason:   { type: 'STRING' }  // Lý do ngắn
                    },
                    required: ['topicId', 'mucdo', 'reason']
                }
            }
        };

        let retries = 3;
        let wait = 1000;
        while (retries > 0) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.status === 429 || response.status >= 500) {
                    throw new Error(`HTTP error ${response.status}`);
                }

                const result = await response.json();
                if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
                    return JSON.parse(result.candidates[0].content.parts[0].text);
                } else {
                    throw new Error('Phản hồi AI rỗng hoặc bị chặn.');
                }
            } catch (e) {
                retries--;
                if (retries === 0) throw e;
                await delay(wait);
                wait *= 2;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 3: VALIDATE VÀ COMPOSE ID TỪ KẾT QUẢ AI
    // ═══════════════════════════════════════════════════════════════

    /**
     * AI trả về { topicId, mucdo, reason }.
     * topicId là ID của node trong cây (ví dụ "9D11-3" hoặc "9D11").
     * Hàm này tạo ra mapId dạng: <topicId nhưng chèn mức độ vào đúng vị trí>
     *
     * Cấu trúc ID chuẩn theo mapid-manager: ID do người dùng định nghĩa tự do
     * (không có quy tắc cố định về vị trí mức độ).
     * → Vì vậy ta lưu topicId + mucdo riêng, rồi compose:
     *   mapId = topicId (giữ nguyên)
     *   level / mucdo lưu vào thuộc tính riêng
     *
     * Thực tế trong exam-editor, mapId được dùng như chuỗi nhận dạng.
     * Ta sẽ tạo composite: <topicId>.<mucdo> để vừa tra được trong cây,
     * vừa mã hoá mức độ.
     */
    function validateAndBuildId(aiResponse, allNodeIds) {
        const { topicId, mucdo } = aiResponse || {};
        if (!topicId || !mucdo) return null;

        const validLevels = ['N', 'H', 'V', 'C'];
        if (!validLevels.includes(mucdo)) return null;

        // Kiểm tra topicId có tồn tại trong cây không
        const exists = allNodeIds.some(n => n.id === topicId);
        if (!exists) return null;

        return { topicId, mucdo };
    }

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 4: HIỂN THỊ MÔ TẢ ĐẦY ĐỦ CHO 1 CÂU HỎI
    // ═══════════════════════════════════════════════════════════════

    function describeId(topicId, mucdo, tree) {
        const levelMap = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' };
        const levelColor = { N: '#16a34a', H: '#2563eb', V: '#ea580c', C: '#dc2626' };

        const path = findPathById(tree, topicId);
        if (!path) return { text: `ID: ${topicId} | Mức: ${levelMap[mucdo] || mucdo}`, path: [] };

        const names = path.map(p => p.name);
        const text = names.join(' → ') + ` | Mức: ${levelMap[mucdo] || mucdo}`;
        return { text, path, levelName: levelMap[mucdo] || mucdo, levelColor: levelColor[mucdo] || '#6b7280' };
    }

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 5: MODAL TỔNG KẾT & CHỈNH SỬA THỦ CÔNG
    // ═══════════════════════════════════════════════════════════════

    function injectStyles() {
        if (document.getElementById('ai-id-assigner-styles')) return;
        const style = document.createElement('style');
        style.id = 'ai-id-assigner-styles';
        style.textContent = `
            #aiIdModal { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.55); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
            #aiIdModalBox { background:#fff; border-radius:16px; box-shadow:0 25px 50px rgba(0,0,0,0.25); width:100%; max-width:780px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; }
            #aiIdModalHeader { padding:20px 24px 16px; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
            #aiIdModalHeader h2 { font-size:18px; font-weight:800; color:#1e293b; margin:0; display:flex; align-items:center; gap:8px; }
            #aiIdModalBody { flex:1; overflow-y:auto; padding:16px 24px; }
            #aiIdModalFooter { padding:16px 24px; border-top:1px solid #f1f5f9; display:flex; justify-content:flex-end; gap:10px; flex-shrink:0; }
            .ai-id-question-row { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; margin-bottom:10px; }
            .ai-id-question-row.has-error { border-color:#fca5a5; background:#fff5f5; }
            .ai-id-question-row.is-processing { opacity:0.6; }
            .ai-id-q-header { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
            .ai-id-q-num { font-weight:800; font-size:12px; background:#3b82f6; color:#fff; padding:2px 8px; border-radius:6px; }
            .ai-id-q-type { font-size:11px; font-weight:700; background:#e2e8f0; color:#475569; padding:2px 8px; border-radius:6px; }
            .ai-id-q-preview { font-size:12px; color:#64748b; font-style:italic; margin-bottom:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .ai-id-desc-bar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:8px 10px; border-radius:8px; background:#eff6ff; border:1px solid #bfdbfe; margin-bottom:8px; }
            .ai-id-desc-bar.has-error { background:#fef2f2; border-color:#fecaca; }
            .ai-id-level-badge { font-size:11px; font-weight:800; padding:2px 10px; border-radius:999px; color:#fff; }
            .ai-id-path-chip { font-size:11px; background:#fff; border:1px solid #cbd5e1; border-radius:6px; padding:2px 8px; color:#334155; font-weight:600; }
            .ai-id-edit-btn { margin-left:auto; font-size:11px; font-weight:700; color:#6366f1; cursor:pointer; background:#eef2ff; border:1px solid #c7d2fe; border-radius:6px; padding:3px 10px; white-space:nowrap; transition:background .15s; }
            .ai-id-edit-btn:hover { background:#e0e7ff; }
            .ai-id-manual-form { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:12px; margin-top:8px; display:none; }
            .ai-id-manual-form.open { display:block; }
            .ai-id-manual-form select, .ai-id-manual-form input { width:100%; padding:7px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; font-weight:600; color:#1e293b; background:#f8fafc; margin-bottom:6px; }
            .ai-id-manual-apply { font-size:12px; font-weight:700; color:#fff; background:#6366f1; border:none; border-radius:8px; padding:6px 16px; cursor:pointer; }
            .ai-id-manual-apply:hover { background:#4f46e5; }
            .ai-id-progress-bar-wrap { background:#e2e8f0; border-radius:999px; height:6px; overflow:hidden; margin-bottom:12px; }
            .ai-id-progress-bar { height:100%; background:linear-gradient(90deg,#6366f1,#3b82f6); border-radius:999px; transition:width .3s; }
            #aiIdProgressText { font-size:12px; color:#64748b; font-weight:600; margin-bottom:6px; }
        `;
        document.head.appendChild(style);
    }

    // ─────────────────────────────────────────────
    // MODAL BƯỚC 1: Lựa chọn cấu hình gán AI
    // ─────────────────────────────────────────────
    function showConfigModal(tree, missingCount, totalCount) {
        injectStyles();
        return new Promise((resolve, reject) => {
            const allNodes = getAllNodeIds(tree);
            // Nhóm node theo level
            const byLevel = {};
            allNodes.forEach(n => {
                if (!byLevel[n.level]) byLevel[n.level] = [];
                byLevel[n.level].push(n);
            });

            const buildSelect = (lv, placeholder) => {
                const opts = (byLevel[lv] || []).map(n => `<option value="${n.id}">[${n.id}] ${n.name}</option>`).join('');
                return `<option value="">${placeholder}</option>${opts}`;
            };

            // Tìm các level con nhất để xác định level max
            const levels = Object.keys(byLevel).map(Number).sort((a,b)=>a-b);
            const leafLevel = levels[levels.length - 1] || 4;

            const modal = document.createElement('div');
            modal.id = 'aiIdConfigModal';
            modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
            modal.innerHTML = `
                <div style="background:#fff;border-radius:16px;box-shadow:0 25px 50px rgba(0,0,0,0.25);width:100%;max-width:560px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
                    <div style="padding:20px 24px 16px;border-bottom:1px solid #f1f5f9;">
                        <h2 style="font-size:17px;font-weight:800;color:#1e293b;margin:0;display:flex;align-items:center;gap:8px;">
                            <span style="width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;">
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
                            </span>
                            Gán ID bằng AI — Cấu hình
                        </h2>
                        <p style="font-size:13px;color:#64748b;margin:6px 0 0;">Phát hiện <strong style="color:#ef4444;">${missingCount}</strong> / ${totalCount} câu hỏi chưa có ID hợp lệ.</p>
                    </div>

                    <div style="flex:1;overflow-y:auto;padding:20px 24px;">
                        <!-- Phương thức gán -->
                        <div style="margin-bottom:16px;">
                            <label style="font-size:13px;font-weight:700;color:#374151;display:block;margin-bottom:8px;">Phương thức gán:</label>
                            <div style="display:flex;gap:10px;">
                                <label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;transition:border .15s;" id="lbl-missing">
                                    <input type="radio" name="assignMode" value="missing" checked style="accent-color:#6366f1;">
                                    <div><div style="font-size:13px;font-weight:700;color:#1e293b;">Chỉ câu thiếu ID</div><div style="font-size:11px;color:#94a3b8;">Giữ nguyên câu đã có ID</div></div>
                                </label>
                                <label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 12px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;transition:border .15s;" id="lbl-all">
                                    <input type="radio" name="assignMode" value="all" style="accent-color:#6366f1;">
                                    <div><div style="font-size:13px;font-weight:700;color:#1e293b;">Ghi đè tất cả</div><div style="font-size:11px;color:#94a3b8;">Kể cả câu đã có ID</div></div>
                                </label>
                            </div>
                        </div>

                        <!-- Giá trị mặc định -->
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;">
                            <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:4px;">Giá trị mặc định (tùy chọn)</div>
                            <div style="font-size:11px;color:#94a3b8;margin-bottom:12px;">Nếu chọn mặc định, AI chỉ cần suy luận các trường còn lại.</div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                                ${levels.map(lv => `
                                <div>
                                    <label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">Cấp ${lv + 1} (Level ${lv}):</label>
                                    <select id="def-lv-${lv}" style="width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-weight:600;color:#1e293b;background:#fff;">
                                        ${buildSelect(lv, '--- Không mặc định ---')}
                                    </select>
                                </div>
                                `).join('')}
                                <div>
                                    <label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">Mức độ:</label>
                                    <select id="def-mucdo" style="width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-weight:600;color:#1e293b;background:#fff;">
                                        <option value="">--- Không mặc định ---</option>
                                        <option value="N">N — Nhận biết</option>
                                        <option value="H">H — Thông hiểu</option>
                                        <option value="V">V — Vận dụng</option>
                                        <option value="C">C — Vận dụng cao</option>
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size:11px;font-weight:700;color:#64748b;display:block;margin-bottom:3px;">Mô hình AI:</label>
                                    <select id="def-model" style="width:100%;padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;font-weight:600;color:#1e293b;background:#fff;">
                                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (Khuyến nghị)</option>
                                        <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0;">
                        <button id="aiCfgCancel" style="padding:9px 20px;background:#f1f5f9;color:#475569;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:13px;">Hủy</button>
                        <button id="aiCfgStart" style="padding:9px 22px;background:linear-gradient(135deg,#6366f1,#3b82f6);color:#fff;font-weight:800;border:none;border-radius:10px;cursor:pointer;font-size:13px;box-shadow:0 4px 12px rgba(99,102,241,0.3);">
                            ✨ Bắt đầu gán bằng AI
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Radio style update
            modal.querySelectorAll('input[name="assignMode"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    document.getElementById('lbl-missing').style.borderColor = '';
                    document.getElementById('lbl-all').style.borderColor = '';
                    const lbl = modal.querySelector(`#lbl-${radio.value}`);
                    if (lbl) lbl.style.borderColor = '#6366f1';
                });
            });
            document.getElementById('lbl-missing').style.borderColor = '#6366f1';

            document.getElementById('aiCfgCancel').onclick = () => {
                modal.remove();
                reject(new Error('User cancelled'));
            };

            document.getElementById('aiCfgStart').onclick = () => {
                const assignMode = modal.querySelector('input[name="assignMode"]:checked')?.value || 'missing';
                const defaults = {};
                levels.forEach(lv => {
                    const val = modal.querySelector(`#def-lv-${lv}`)?.value;
                    if (val) defaults[`level${lv}`] = val;
                });
                const defMucdo = modal.querySelector('#def-mucdo')?.value || '';
                const modelId = modal.querySelector('#def-model')?.value || 'gemini-3.5-flash';
                modal.remove();
                resolve({ assignMode, defaults, defMucdo, modelId, levels });
            };
        });
    }

    // ─────────────────────────────────────────────
    // MODAL BƯỚC 2: Tiến trình + Tổng kết & chỉnh sửa
    // ─────────────────────────────────────────────
    function showResultModal(questions, tree, allNodeIds) {
        injectStyles();

        return new Promise((resolve) => {
            const levelMap = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' };
            const levelColorMap = { N: '#16a34a', H: '#2563eb', V: '#ea580c', C: '#dc2626' };
            const typeLabel = { mc: 'Trắc nghiệm', tf: 'Đúng/Sai', short: 'Trả lời ngắn', essay: 'Tự luận' };

            const buildNodeSelect = (lv) => {
                const nodes = getAllNodeIds(tree).filter(n => n.level === lv);
                return nodes.map(n => `<option value="${n.id}">[${n.id}] ${n.name}</option>`).join('');
            };

            const renderRow = (q, idx) => {
                const preview = (q.content || '').replace(/<[^>]+>/g, '').substring(0, 80) + '...';
                const hasId = q._aiTopicId && q._aiMucdo;
                const desc = hasId ? describeId(q._aiTopicId, q._aiMucdo, tree) : null;

                const levels = [...new Set(getAllNodeIds(tree).map(n => n.level))].sort((a,b)=>a-b);

                const manualSelects = levels.map(lv => {
                    const currentMatch = hasId ? (findPathById(tree, q._aiTopicId) || []).find(p => p.level === lv) : null;
                    return `
                    <div>
                        <label style="font-size:10px;font-weight:700;color:#94a3b8;display:block;margin-bottom:2px;">Cấp ${lv+1}:</label>
                        <select class="ai-manual-lv" data-qidx="${idx}" data-level="${lv}" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:7px;font-size:11px;font-weight:600;color:#1e293b;background:#fff;margin-bottom:4px;">
                            <option value="">---</option>
                            ${buildNodeSelect(lv)}
                        </select>
                    </div>`;
                }).join('');

                return `
                <div class="ai-id-question-row ${hasId ? '' : 'has-error'}" id="ai-row-${idx}">
                    <div class="ai-id-q-header">
                        <span class="ai-id-q-num">Câu ${idx + 1}</span>
                        <span class="ai-id-q-type">${typeLabel[q.type] || q.type || 'Khác'}</span>
                        ${q._aiStatus === 'processing' ? '<span style="font-size:11px;color:#6366f1;font-weight:700;animation:pulse 1s infinite;">⏳ Đang xử lý...</span>' : ''}
                        ${q._aiStatus === 'error' ? '<span style="font-size:11px;color:#ef4444;font-weight:700;">⚠ Gán thất bại</span>' : ''}
                        ${q._aiStatus === 'done' ? '<span style="font-size:11px;color:#16a34a;font-weight:700;">✓ Đã gán</span>' : ''}
                        ${q._aiStatus === 'skipped' ? '<span style="font-size:11px;color:#94a3b8;font-weight:700;">— Bỏ qua</span>' : ''}
                    </div>
                    <div class="ai-id-q-preview">${preview}</div>
                    ${hasId ? `
                    <div class="ai-id-desc-bar" id="ai-desc-${idx}">
                        <span class="ai-id-level-badge" style="background:${desc.levelColor}">${desc.levelName}</span>
                        ${(desc.path || []).map(p => `<span class="ai-id-path-chip">${p.name}</span>`).join('<span style="color:#94a3b8;font-size:10px;">›</span>')}
                        <button class="ai-id-edit-btn" onclick="document.getElementById('ai-manual-${idx}').classList.toggle('open')">✏ Sửa</button>
                    </div>
                    ` : `
                    <div class="ai-id-desc-bar has-error" id="ai-desc-${idx}" style="color:#dc2626;font-size:12px;font-weight:600;">
                        Chưa xác định được ID. Vui lòng chỉnh sửa thủ công.
                        <button class="ai-id-edit-btn" style="border-color:#fca5a5;color:#dc2626;background:#fff5f5;" onclick="document.getElementById('ai-manual-${idx}').classList.add('open')">✏ Sửa</button>
                    </div>
                    `}
                    <div class="ai-id-manual-form" id="ai-manual-${idx}">
                        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">Chỉnh sửa thủ công:</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                            ${manualSelects}
                            <div>
                                <label style="font-size:10px;font-weight:700;color:#94a3b8;display:block;margin-bottom:2px;">Mức độ:</label>
                                <select class="ai-manual-mucdo" data-qidx="${idx}" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:7px;font-size:11px;font-weight:600;color:#1e293b;background:#fff;margin-bottom:4px;">
                                    <option value="">---</option>
                                    <option value="N" ${q._aiMucdo==='N'?'selected':''}>N — Nhận biết</option>
                                    <option value="H" ${q._aiMucdo==='H'?'selected':''}>H — Thông hiểu</option>
                                    <option value="V" ${q._aiMucdo==='V'?'selected':''}>V — Vận dụng</option>
                                    <option value="C" ${q._aiMucdo==='C'?'selected':''}>C — Vận dụng cao</option>
                                </select>
                            </div>
                        </div>
                        <button class="ai-id-manual-apply" onclick="window._aiAssignerApplyManual(${idx})">Áp dụng</button>
                    </div>
                </div>`;
            };

            const modal = document.createElement('div');
            modal.id = 'aiIdModal';
            modal.innerHTML = `
                <div id="aiIdModalBox">
                    <div id="aiIdModalHeader">
                        <h2>
                            <span style="width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;">
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
                            </span>
                            Kết quả Gán ID bằng AI
                        </h2>
                        <span id="aiIdSummaryBadge" style="font-size:12px;font-weight:700;background:#eff6ff;color:#3b82f6;padding:4px 12px;border-radius:8px;border:1px solid #bfdbfe;">Đang xử lý...</span>
                    </div>
                    <div id="aiIdModalBody">
                        <div id="aiIdProgressText">Đang chuẩn bị...</div>
                        <div class="ai-id-progress-bar-wrap"><div class="ai-id-progress-bar" id="aiIdProgressBar" style="width:0%;"></div></div>
                        <div id="aiIdRowsContainer">
                            ${questions.map((q, idx) => renderRow(q, idx)).join('')}
                        </div>
                    </div>
                    <div id="aiIdModalFooter">
                        <button id="aiIdBtnCancel" style="padding:9px 20px;background:#f1f5f9;color:#475569;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:13px;">Hủy & Bỏ qua</button>
                        <button id="aiIdBtnConfirm" style="padding:9px 22px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:800;border:none;border-radius:10px;cursor:pointer;font-size:13px;box-shadow:0 4px 12px rgba(16,185,129,0.3);" disabled>
                            ✓ Xác nhận & Tiếp tục
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Hàm cập nhật 1 row sau khi AI trả kết quả
            window._aiAssignerUpdateRow = (idx, q) => {
                const row = document.getElementById(`ai-row-${idx}`);
                if (!row) return;
                row.outerHTML = renderRow(q, idx);

                // Restore event cho các select trong row mới
                const form = document.getElementById(`ai-manual-${idx}`);
                if (!form) return;
                // Pre-select current values
                const path = q._aiTopicId ? findPathById(tree, q._aiTopicId) : null;
                if (path) {
                    form.querySelectorAll('.ai-manual-lv').forEach(sel => {
                        const lv = parseInt(sel.dataset.level);
                        const pathNode = path.find(p => p.level === lv);
                        if (pathNode) sel.value = pathNode.id;
                    });
                }
            };

            // Hàm áp dụng chỉnh sửa thủ công
            window._aiAssignerApplyManual = (idx) => {
                const q = questions[idx];
                const form = document.getElementById(`ai-manual-${idx}`);
                if (!form) return;

                // Lấy node lá (level cao nhất) được chọn
                const lvSelects = [...form.querySelectorAll('.ai-manual-lv')].sort((a,b) => parseInt(b.dataset.level) - parseInt(a.dataset.level));
                let chosenId = '';
                for (const sel of lvSelects) {
                    if (sel.value) { chosenId = sel.value; break; }
                }

                const mucdo = form.querySelector('.ai-manual-mucdo')?.value;

                if (!chosenId || !mucdo) {
                    alert('Vui lòng chọn đủ ID node và Mức độ!');
                    return;
                }

                q._aiTopicId = chosenId;
                q._aiMucdo = mucdo;
                q._aiStatus = 'done';
                window._aiAssignerUpdateRow(idx, q);
                document.getElementById(`ai-manual-${idx}`)?.classList.remove('open');
                updateSummaryBadge();
            };

            function updateSummaryBadge() {
                const done = questions.filter(q => q._aiStatus === 'done' || q._aiStatus === 'skipped').length;
                const errors = questions.filter(q => q._aiStatus === 'error').length;
                const badge = document.getElementById('aiIdSummaryBadge');
                if (badge) {
                    badge.textContent = `${done}/${questions.length} xong${errors > 0 ? ` · ${errors} lỗi` : ''}`;
                    badge.style.background = errors > 0 ? '#fff5f5' : '#eff6ff';
                    badge.style.color = errors > 0 ? '#ef4444' : '#3b82f6';
                }
            }

            document.getElementById('aiIdBtnCancel').onclick = () => {
                modal.remove();
                delete window._aiAssignerUpdateRow;
                delete window._aiAssignerApplyManual;
                resolve(questions); // Trả về mảng dù chưa xong
            };

            document.getElementById('aiIdBtnConfirm').onclick = () => {
                modal.remove();
                delete window._aiAssignerUpdateRow;
                delete window._aiAssignerApplyManual;
                resolve(questions);
            };

            // Expose controls cho logic chạy nền
            modal._controls = {
                updateProgress: (done, total) => {
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    const bar = document.getElementById('aiIdProgressBar');
                    const txt = document.getElementById('aiIdProgressText');
                    if (bar) bar.style.width = `${pct}%`;
                    if (txt) txt.textContent = `Đang gán... (${done}/${total})`;
                },
                finishProgress: (successCount, failCount) => {
                    const txt = document.getElementById('aiIdProgressText');
                    const bar = document.getElementById('aiIdProgressBar');
                    if (txt) txt.textContent = `Hoàn tất! Thành công: ${successCount} · Thất bại: ${failCount}`;
                    if (bar) bar.style.width = '100%';
                    const btn = document.getElementById('aiIdBtnConfirm');
                    if (btn) btn.disabled = false;
                    updateSummaryBadge();
                }
            };

            resolve._modal = modal;
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 6: HÀM CHÍNH – PUBLIC API
    // ═══════════════════════════════════════════════════════════════

    /**
     * Hàm công khai:
     *   window.checkAndAssignMissingIds(questions, options?)
     *   options: { forceAll: bool, db: Firestore instance }
     *
     * Sau khi hoàn tất, mỗi q trong questions sẽ có:
     *   q._aiTopicId: ID node trong cây (ví dụ "9D11" hay "9D11-3")
     *   q._aiMucdo: 'N'|'H'|'V'|'C'
     *   q.mapId: Được gán theo định dạng <topicId> (để tra được trong cây)
     *   q.level: Tên mức độ tiếng Việt
     *   q.levelColor: Màu sắc badge
     */
    window.checkAndAssignMissingIds = async function (questions, options = {}) {
        if (!questions || questions.length === 0) return questions;

        const tree = window.globalIdTree || [];
        if (tree.length === 0) {
            console.warn('[ai-id-assigner] globalIdTree chưa được tải. Bỏ qua gán ID.');
            return questions;
        }

        const allNodeIds = getAllNodeIds(tree);

        // Kiểm tra câu nào chưa có ID
        const missingQuestions = questions.filter(q => !q.mapId || !q.mapId.trim());
        if (missingQuestions.length === 0) return questions;

        // Lấy API Key
        let apiKey = window.aiKeys && window.aiKeys.length > 0 ? window.aiKeys[0] : null;
        if (!apiKey && options.db) {
            try {
                const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');
                const snap = await getDoc(doc(options.db, 'configurations', 'ai_keys'));
                if (snap.exists() && snap.data().keys) {
                    window.aiKeys = snap.data().keys;
                    apiKey = window.aiKeys[0];
                }
            } catch (e) { console.warn('Không lấy được AI Key từ Firestore:', e); }
        }
        if (!apiKey) {
            const inp = prompt('Nhập API Key Gemini để gán ID bằng AI:');
            if (!inp) return questions;
            apiKey = inp.trim();
        }

        // BƯỚC 1: Modal cấu hình
        let config;
        try {
            config = await showConfigModal(tree, missingQuestions.length, questions.length);
        } catch (e) {
            return questions; // User cancel
        }

        const { assignMode, defaults, defMucdo, modelId } = config;

        // Xác định danh sách câu cần xử lý
        const toProcess = assignMode === 'all' ? questions : missingQuestions;

        // Build context map (dùng 1 lần cho toàn bộ)
        const mapContext = buildMapContextFromTree(tree);

        // Build "gợi ý mặc định" từ config
        let defaultHint = '';
        if (Object.keys(defaults).length > 0) {
            const hints = Object.entries(defaults).map(([lv, id]) => {
                const name = findNameById(tree, id);
                return `${name || id} (ID: ${id})`;
            });
            defaultHint = `\nNgười dùng đã ấn định sẵn: ${hints.join(', ')}. Chỉ cần suy luận các thành phần còn lại.`;
        }
        if (defMucdo) {
            defaultHint += `\nMức độ mặc định: ${defMucdo}. Chỉ gán mức độ khác nếu câu hỏi rõ ràng không phù hợp.`;
        }

        // System prompt (giữ nguyên tinh thần từ bản gốc)
        const systemPrompt = `Bạn là trợ lý gán ID câu hỏi Toán THCS cực kỳ chính xác.
Nhiệm vụ: Đọc nội dung câu hỏi LaTeX và MapID, trả về JSON gồm 3 trường:
  - topicId: ID của node phù hợp nhất trong cây MapID (phải tồn tại chính xác trong cây)
  - mucdo: Một trong N|H|V|C
  - reason: Lý do ngắn (1 câu)
${mapContext}${defaultHint}
Quy tắc bắt buộc:
1. topicId PHẢI là ID hợp lệ trong cây MapID được cung cấp.
2. Ưu tiên chọn node lá (sâu nhất) phù hợp với nội dung câu hỏi.
3. Nếu có gợi ý mặc định, hãy ưu tiên tuân theo trừ khi rõ ràng không phù hợp.
4. Trả về JSON thuần túy, KHÔNG giải thích thêm.`;

        // BƯỚC 2: Modal tiến trình + kết quả
        // Ta cần chạy AI song song TRONG KHI modal đang hiển thị
        // Nên ta tạo modal trước, rồi bắt đầu chạy AI

        // Init status
        toProcess.forEach(q => { q._aiStatus = 'processing'; });
        questions.filter(q => !toProcess.includes(q)).forEach(q => { q._aiStatus = 'skipped'; });

        let resolveModal;
        const modalPromise = new Promise(res => { resolveModal = res; });

        // Hiện modal
        const modalEl = document.createElement('div');
        modalEl.id = 'aiIdModal';
        // We'll use showResultModal but need its internal resolve
        // Instead, build modal inline and run AI simultaneously

        injectStyles();

        const levelMapL = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' };
        const levelColorMapL = { N: '#16a34a', H: '#2563eb', V: '#ea580c', C: '#dc2626' };
        const typeLabel = { mc: 'Trắc nghiệm', tf: 'Đúng/Sai', short: 'Trả lời ngắn', essay: 'Tự luận' };

        const buildNodeSelectInline = (lv) => {
            const nodes = allNodeIds.filter(n => n.level === lv);
            return `<option value="">---</option>` + nodes.map(n => `<option value="${n.id}">[${n.id}] ${n.name}</option>`).join('');
        };
        const allLevels = [...new Set(allNodeIds.map(n => n.level))].sort((a,b)=>a-b);

        const renderRowInline = (q, idx) => {
            const preview = (q.content || '').replace(/<[^>]+>/g, '').substring(0, 80) + '...';
            const hasId = q._aiTopicId && q._aiMucdo;
            let descHtml = '';
            if (hasId) {
                const d = describeId(q._aiTopicId, q._aiMucdo, tree);
                descHtml = `<div class="ai-id-desc-bar" id="ai-desc-${idx}">
                    <span class="ai-id-level-badge" style="background:${d.levelColor}">${d.levelName}</span>
                    ${(d.path || []).map(p => `<span class="ai-id-path-chip">${p.name}</span>`).join('<span style="color:#94a3b8;font-size:10px;">›</span>')}
                    <button class="ai-id-edit-btn" onclick="document.getElementById('ai-manual-${idx}').classList.toggle('open')">✏ Sửa</button>
                </div>`;
            } else if (q._aiStatus === 'error') {
                descHtml = `<div class="ai-id-desc-bar has-error" id="ai-desc-${idx}" style="color:#dc2626;font-size:12px;font-weight:600;">
                    Gán thất bại. Hãy chỉnh sửa thủ công.
                    <button class="ai-id-edit-btn" style="border-color:#fca5a5;color:#dc2626;background:#fff5f5;" onclick="document.getElementById('ai-manual-${idx}').classList.add('open')">✏ Sửa</button>
                </div>`;
            } else {
                descHtml = `<div class="ai-id-desc-bar" id="ai-desc-${idx}" style="color:#6366f1;font-size:12px;font-weight:600;">⏳ Đang xử lý...</div>`;
            }

            const manualSelects = allLevels.map(lv => {
                const pathOfQ = hasId ? (findPathById(tree, q._aiTopicId) || []) : [];
                const pathNode = pathOfQ.find(p => p.level === lv);
                return `<div>
                    <label style="font-size:10px;font-weight:700;color:#94a3b8;display:block;margin-bottom:2px;">Cấp ${lv+1}:</label>
                    <select class="ai-manual-lv" data-qidx="${idx}" data-level="${lv}" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:7px;font-size:11px;font-weight:600;color:#1e293b;background:#fff;margin-bottom:4px;">
                        ${buildNodeSelectInline(lv)}
                    </select>
                </div>`;
            }).join('');

            return `
            <div class="ai-id-question-row ${q._aiStatus === 'error' ? 'has-error' : ''}" id="ai-row-${idx}">
                <div class="ai-id-q-header">
                    <span class="ai-id-q-num">Câu ${idx + 1}</span>
                    <span class="ai-id-q-type">${typeLabel[q.type] || q.type || 'Khác'}</span>
                    ${q._aiStatus === 'processing' ? '<span style="font-size:11px;color:#6366f1;font-weight:700;">⏳ Đang xử lý...</span>' : ''}
                    ${q._aiStatus === 'error' ? '<span style="font-size:11px;color:#ef4444;font-weight:700;">⚠ Thất bại</span>' : ''}
                    ${q._aiStatus === 'done' ? '<span style="font-size:11px;color:#16a34a;font-weight:700;">✓ Đã gán</span>' : ''}
                    ${q._aiStatus === 'skipped' ? '<span style="font-size:11px;color:#94a3b8;font-weight:700;">— Bỏ qua</span>' : ''}
                </div>
                <div class="ai-id-q-preview">${preview}</div>
                ${descHtml}
                <div class="ai-id-manual-form" id="ai-manual-${idx}">
                    <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;">Chỉnh sửa thủ công:</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                        ${manualSelects}
                        <div>
                            <label style="font-size:10px;font-weight:700;color:#94a3b8;display:block;margin-bottom:2px;">Mức độ:</label>
                            <select class="ai-manual-mucdo" data-qidx="${idx}" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:7px;font-size:11px;font-weight:600;color:#1e293b;background:#fff;margin-bottom:4px;">
                                <option value="">---</option>
                                <option value="N" ${q._aiMucdo==='N'?'selected':''}>N — Nhận biết</option>
                                <option value="H" ${q._aiMucdo==='H'?'selected':''}>H — Thông hiểu</option>
                                <option value="V" ${q._aiMucdo==='V'?'selected':''}>V — Vận dụng</option>
                                <option value="C" ${q._aiMucdo==='C'?'selected':''}>C — Vận dụng cao</option>
                            </select>
                        </div>
                    </div>
                    <button class="ai-id-manual-apply" onclick="window._aiAssignerApplyManual(${idx})">Áp dụng</button>
                </div>
            </div>`;
        };

        const modal2 = document.createElement('div');
        modal2.id = 'aiIdModal';
        modal2.innerHTML = `
            <div id="aiIdModalBox">
                <div id="aiIdModalHeader">
                    <h2>
                        <span style="width:32px;height:32px;background:linear-gradient(135deg,#6366f1,#3b82f6);border-radius:8px;display:flex;align-items:center;justify-content:center;">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#fff" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/></svg>
                        </span>
                        Gán ID bằng AI — Kết quả
                    </h2>
                    <span id="aiIdSummaryBadge" style="font-size:12px;font-weight:700;background:#eff6ff;color:#3b82f6;padding:4px 12px;border-radius:8px;border:1px solid #bfdbfe;">Đang xử lý...</span>
                </div>
                <div id="aiIdModalBody">
                    <div id="aiIdProgressText" style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:6px;">Đang chuẩn bị...</div>
                    <div class="ai-id-progress-bar-wrap"><div class="ai-id-progress-bar" id="aiIdProgressBar" style="width:0%;"></div></div>
                    <div id="aiIdRowsContainer">
                        ${questions.map((q, idx) => renderRowInline(q, idx)).join('')}
                    </div>
                </div>
                <div id="aiIdModalFooter">
                    <button id="aiIdBtnCancel" style="padding:9px 20px;background:#f1f5f9;color:#475569;font-weight:700;border:none;border-radius:10px;cursor:pointer;font-size:13px;">Hủy & Bỏ qua</button>
                    <button id="aiIdBtnConfirm" style="padding:9px 22px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:800;border:none;border-radius:10px;cursor:pointer;font-size:13px;box-shadow:0 4px 12px rgba(16,185,129,0.3);" disabled>
                        ✓ Xác nhận & Tiếp tục
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal2);

        // Hàm update row sau AI
        window._aiAssignerUpdateRow = (idx, q) => {
            const container = document.getElementById('aiIdRowsContainer');
            if (!container) return;
            const oldRow = document.getElementById(`ai-row-${idx}`);
            if (oldRow) {
                const tmp = document.createElement('div');
                tmp.innerHTML = renderRowInline(q, idx);
                oldRow.replaceWith(tmp.firstElementChild);
            }
            // Pre-select values in manual form
            const form = document.getElementById(`ai-manual-${idx}`);
            if (!form || !q._aiTopicId) return;
            const path = findPathById(tree, q._aiTopicId);
            if (path) {
                form.querySelectorAll('.ai-manual-lv').forEach(sel => {
                    const lv = parseInt(sel.dataset.level);
                    const pNode = path.find(p => p.level === lv);
                    if (pNode) sel.value = pNode.id;
                });
            }
            if (q._aiMucdo) {
                const mSel = form.querySelector('.ai-manual-mucdo');
                if (mSel) mSel.value = q._aiMucdo;
            }
        };

        window._aiAssignerApplyManual = (idx) => {
            const q = questions[idx];
            const form = document.getElementById(`ai-manual-${idx}`);
            if (!form) return;
            const lvSelects = [...form.querySelectorAll('.ai-manual-lv')].sort((a,b) => parseInt(b.dataset.level) - parseInt(a.dataset.level));
            let chosenId = '';
            for (const sel of lvSelects) {
                if (sel.value) { chosenId = sel.value; break; }
            }
            const mucdo = form.querySelector('.ai-manual-mucdo')?.value;
            if (!chosenId || !mucdo) { alert('Vui lòng chọn đủ ID node và Mức độ!'); return; }
            q._aiTopicId = chosenId;
            q._aiMucdo = mucdo;
            q._aiStatus = 'done';
            applyIdToQuestion(q, tree, levelMapL, levelColorMapL);
            window._aiAssignerUpdateRow(idx, q);
            document.getElementById(`ai-manual-${idx}`)?.classList.remove('open');
            updateSummaryBadge2();
        };

        function updateSummaryBadge2() {
            const done = questions.filter(q => q._aiStatus === 'done').length;
            const errors = questions.filter(q => q._aiStatus === 'error').length;
            const skipped = questions.filter(q => q._aiStatus === 'skipped').length;
            const badge = document.getElementById('aiIdSummaryBadge');
            if (badge) {
                badge.textContent = `${done} gán xong · ${skipped} bỏ qua · ${errors} lỗi`;
                badge.style.background = errors > 0 ? '#fff5f5' : '#f0fdf4';
                badge.style.color = errors > 0 ? '#ef4444' : '#16a34a';
                badge.style.borderColor = errors > 0 ? '#fecaca' : '#bbf7d0';
            }
        }

        const confirmBtn = document.getElementById('aiIdBtnConfirm');
        const cancelBtn = document.getElementById('aiIdBtnCancel');

        const waitForUserConfirm = new Promise(resolveUser => {
            confirmBtn.onclick = () => {
                modal2.remove();
                delete window._aiAssignerUpdateRow;
                delete window._aiAssignerApplyManual;
                resolveUser();
            };
            cancelBtn.onclick = () => {
                modal2.remove();
                delete window._aiAssignerUpdateRow;
                delete window._aiAssignerApplyManual;
                resolveUser();
            };
        });

        // ── CHẠY AI SONG SONG ──
        const MAX_CONCURRENT = 8;
        let successCount = 0, failCount = 0, doneCount = 0;
        const total = toProcess.length;

        async function processOne(q, idx) {
            const promptText = getAiPromptContent(q);
            try {
                const aiRes = await callGeminiApi(promptText, systemPrompt, apiKey, modelId);
                const validated = validateAndBuildId(aiRes, allNodeIds);
                if (validated) {
                    q._aiTopicId = validated.topicId;
                    q._aiMucdo = validated.mucdo;
                    q._aiStatus = 'done';
                    applyIdToQuestion(q, tree, levelMapL, levelColorMapL);
                    successCount++;
                } else {
                    q._aiStatus = 'error';
                    failCount++;
                }
            } catch (e) {
                console.error(`[ai-id-assigner] Lỗi câu ${idx + 1}:`, e);
                q._aiStatus = 'error';
                failCount++;
            }
            doneCount++;

            // Update UI
            if (window._aiAssignerUpdateRow) window._aiAssignerUpdateRow(questions.indexOf(q), q);

            const pct = total > 0 ? Math.round((doneCount / total) * 100) : 100;
            const bar = document.getElementById('aiIdProgressBar');
            const txt = document.getElementById('aiIdProgressText');
            if (bar) bar.style.width = `${pct}%`;
            if (txt) txt.textContent = `Đang gán... (${doneCount}/${total})`;
            updateSummaryBadge2();
        }

        // Chạy theo batch
        (async () => {
            for (let i = 0; i < toProcess.length; i += MAX_CONCURRENT) {
                const batch = toProcess.slice(i, i + MAX_CONCURRENT);
                await Promise.all(batch.map((q) => processOne(q, questions.indexOf(q))));
            }
            // Done
            const txt = document.getElementById('aiIdProgressText');
            if (txt) txt.textContent = `Hoàn tất! Thành công: ${successCount} · Thất bại: ${failCount}`;
            if (confirmBtn) confirmBtn.disabled = false;
            updateSummaryBadge2();
        })();

        // Chờ user bấm Xác nhận
        await waitForUserConfirm;
        return questions;
    };

    // ═══════════════════════════════════════════════════════════════
    // PHẦN 7: HELPER - LẤY NỘI DUNG CÂU HỎI CHO AI PROMPT
    // ═══════════════════════════════════════════════════════════════

    function getAiPromptContent(q) {
        // Lấy nội dung thô, loại bỏ tag HTML nếu có
        let text = (q.rawLatex || q.content || '').replace(/<[^>]+>/g, '').trim();
        if (q.solution) text += '\n\n[Lời giải]: ' + q.solution.replace(/<[^>]+>/g, '').trim();
        if (q.options && q.options.length > 0) {
            text += '\n[Đáp án]: ' + q.options.map((o, i) => `${['A','B','C','D'][i]}. ${(o||'').replace(/<[^>]+>/g,'')}`).join(' | ');
        }
        return text.substring(0, 3000); // Giới hạn để tiết kiệm token
    }

    function applyIdToQuestion(q, tree, levelMapL, levelColorMapL) {
        if (!q._aiTopicId || !q._aiMucdo) return;
        // mapId: dùng topicId (ID node trong cây) làm định danh chính
        q.mapId = q._aiTopicId;
        q.level = levelMapL[q._aiMucdo] || q._aiMucdo;
        q.levelColor = levelColorMapL[q._aiMucdo] || 'gray';

        // Xác định subject từ path
        const path = findPathById(tree, q._aiTopicId);
        if (path && path.length > 0) {
            // Tìm node gốc (level 0) để lấy subject
            const rootNode = path.find(p => p.level === 0);
            if (rootNode) {
                const rootId = rootNode.id || '';
                if (rootId.includes('D') || rootNode.name.includes('Đại')) q.subject = 'Đại số';
                else if (rootId.includes('H') || rootNode.name.includes('Hình')) q.subject = 'Hình học';
                else if (rootId.includes('G') || rootNode.name.includes('Giải tích')) q.subject = 'Giải tích';
                else q.subject = rootNode.name;
            }
        }
    }

})();
