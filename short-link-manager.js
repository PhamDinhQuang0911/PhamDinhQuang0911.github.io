(function (global) {
    'use strict';

    const STORAGE_COPY_MODE_KEY = 'qmath_shortlink_copy_mode';

    const state = {
        items: [],
        loading: false,
        saving: false,
        error: '',
        search: '',
        sortBy: 'newest',
        copyMode: loadInitialCopyMode(),
        editingSlug: '',
        confirmDeleteSlug: '',
        confirmDeleteTimer: null,
        lastCreatedSlug: '',
        copiedSlug: '',
        copiedTimer: null,
        qrSlug: '',
        initialized: false
    };

    function getCore() {
        return global.QMathShortLinkCore;
    }

    function loadInitialCopyMode() {
        try {
            return localStorage.getItem(STORAGE_COPY_MODE_KEY) === 'go' ? 'go' : 'clean';
        } catch (e) {
            return 'clean';
        }
    }

    function saveCopyMode(mode) {
        state.copyMode = mode === 'go' ? 'go' : 'clean';
        try {
            localStorage.setItem(STORAGE_COPY_MODE_KEY, state.copyMode);
        } catch (e) {}
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function notify(msg, type) {
        if (typeof global.showToast === 'function') {
            global.showToast(msg, type || 'info');
        }
    }

    function restHeaders(prefer) {
        const core = getCore();
        const headers = {
            'apikey': core.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + core.SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        };
        if (prefer) headers['Prefer'] = prefer;
        return headers;
    }

    async function fetchAllShortLinks() {
        const core = getCore();
        if (global.supabase) {
            const { data, error } = await global.supabase
                .from('configurations')
                .select('id, raw_data, updated_at')
                .like('id', core.CONFIG_PREFIX + '%');
            if (!error && Array.isArray(data)) {
                return data
                    .filter((r) => String(r.id || '').startsWith(core.CONFIG_PREFIX))
                    .map((r) => core.normalizeRecord(r))
                    .filter(Boolean);
            }
        }

        const endpoint = `${core.SUPABASE_URL}/rest/v1/configurations?id=like.${encodeURIComponent(core.CONFIG_PREFIX + '*')}&select=id,raw_data,updated_at`;
        const res = await fetch(endpoint, {
            method: 'GET',
            cache: 'no-store',
            headers: restHeaders()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        return (Array.isArray(rows) ? rows : [])
            .filter((r) => String(r.id || '').startsWith(core.CONFIG_PREFIX))
            .map((r) => core.normalizeRecord(r))
            .filter(Boolean);
    }

    async function saveShortLinkRecord(record) {
        const core = getCore();
        const nowIso = new Date().toISOString();
        const confId = core.CONFIG_PREFIX + record.slug;
        const payload = {
            id: confId,
            raw_data: {
                id: record.slug,
                slug: record.slug,
                targetUrl: record.targetUrl,
                title: record.title || '',
                active: record.active !== false,
                clicks: Number(record.clicks) || 0,
                createdAt: record.createdAt || nowIso,
                updatedAt: nowIso,
                lastClickedAt: record.lastClickedAt || null,
                createdBy: record.createdBy || '',
                createdByName: record.createdByName || ''
            },
            updated_at: nowIso
        };

        if (global.supabase) {
            const { error } = await global.supabase
                .from('configurations')
                .upsert(payload, { onConflict: 'id' });
            if (error) throw error;
            return core.normalizeRecord(payload);
        }

        const endpoint = `${core.SUPABASE_URL}/rest/v1/configurations?on_conflict=id`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: restHeaders('resolution=merge-duplicates,return=representation'),
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        return core.normalizeRecord((Array.isArray(rows) && rows[0]) || payload);
    }

    async function deleteShortLinkRecord(slug) {
        const core = getCore();
        const confId = core.CONFIG_PREFIX + slug;
        if (global.supabase) {
            const { error } = await global.supabase
                .from('configurations')
                .delete()
                .eq('id', confId);
            if (error) throw error;
            return true;
        }
        const endpoint = `${core.SUPABASE_URL}/rest/v1/configurations?id=eq.${encodeURIComponent(confId)}`;
        const res = await fetch(endpoint, {
            method: 'DELETE',
            headers: restHeaders()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
    }

    function getCurrentTeacherMeta() {
        const u = global.currentUser || global.auth?.currentUser || {};
        const admin = global.currentAdminProfile || {};
        return {
            uid: String(u.uid || admin.uid || 'teacher'),
            name: String(admin.displayName || u.displayName || 'Giáo viên')
        };
    }

    function formatShortDate(iso) {
        if (!iso) return '--';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '--';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }

    async function copyText(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {}
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.top = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) {
            return false;
        }
    }

    function ensureModalDom() {
        let modal = document.getElementById('qmathShortLinkModal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'qmathShortLinkModal';
        modal.className = 'hidden fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'slModalTitle');

        modal.innerHTML = `
            <div id="slModalPanel" class="relative w-full max-w-4xl bg-white dark:bg-[#1E1B29] rounded-2xl border border-slate-200 dark:border-[#38344D] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 dark:text-slate-100">
                <header class="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-[#38344D] flex items-center justify-between gap-3 bg-white dark:bg-[#1E1B29] shrink-0">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800/60 flex items-center justify-center shrink-0">
                            <i class="fa-solid fa-link text-base"></i>
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <h2 id="slModalTitle" class="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white truncate">Tạo Link Rút Gọn QMath</h2>
                                <span id="slTotalBadge" class="px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums bg-slate-100 text-slate-700 dark:bg-[#262335] dark:text-slate-300 border border-slate-200 dark:border-[#38344D]">0 link</span>
                            </div>
                            <p class="text-xs text-slate-600 dark:text-slate-400 truncate">Tạo link ngắn tên miền <span class="font-mono font-semibold text-sky-700 dark:text-sky-400">qmath.io.vn/...</span> kèm mã QR</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        <button type="button" id="slRefreshBtn" class="w-9 h-9 rounded-xl border border-slate-200 dark:border-[#38344D] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#262335] flex items-center justify-center transition-colors cursor-pointer" title="Tải lại danh sách">
                            <i class="fa-solid fa-arrows-rotate text-sm"></i>
                        </button>
                        <button type="button" id="slCloseBtn" class="w-9 h-9 rounded-xl border border-slate-200 dark:border-[#38344D] text-slate-600 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer" title="Đóng">
                            <i class="fa-solid fa-xmark text-base"></i>
                        </button>
                    </div>
                </header>

                <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                    <form id="slCreateForm" class="rounded-xl bg-slate-50/90 dark:bg-[#262335] border border-slate-200 dark:border-[#38344D] p-3.5 sm:p-4 space-y-3" novalidate>
                        <div class="flex items-center justify-between gap-2">
                            <span id="slFormModeLabel" class="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                                <i class="fa-solid fa-wand-magic-sparkles text-sky-600 dark:text-sky-400"></i> Tạo đường dẫn mới
                            </span>
                            <button type="button" id="slCancelEditBtn" class="hidden text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white px-2.5 py-1 rounded-lg bg-white dark:bg-[#1E1B29] border border-slate-200 dark:border-[#38344D] cursor-pointer">
                                Hủy chỉnh sửa
                            </button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div class="md:col-span-7">
                                <label for="slTargetUrl" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Link gốc cần rút gọn <span class="text-rose-600">*</span></label>
                                <input id="slTargetUrl" type="url" autocomplete="off" spellcheck="false"
                                    placeholder="https://drive.google.com/file/d/... hoặc link đề, bài tập"
                                    class="w-full h-10 px-3 rounded-xl text-sm bg-white dark:bg-[#1E1B29] border border-slate-300 dark:border-[#38344D] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500">
                            </div>
                            <div class="md:col-span-5">
                                <label for="slTitle" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tiêu đề / Ghi chú (tuỳ chọn)</label>
                                <input id="slTitle" type="text" maxlength="100"
                                    placeholder="VD: Đề ôn HK1 Toán 9"
                                    class="w-full h-10 px-3 rounded-xl text-sm bg-white dark:bg-[#1E1B29] border border-slate-300 dark:border-[#38344D] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500">
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                            <div class="md:col-span-8">
                                <label for="slSlugInput" class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Đuôi link tuỳ chỉnh (để trống sẽ tự tạo ngắn gọn)</label>
                                <div class="flex items-stretch h-10 rounded-xl bg-white dark:bg-[#1E1B29] border border-slate-300 dark:border-[#38344D] overflow-hidden focus-within:ring-2 focus-within:ring-sky-500">
                                    <span class="px-3 text-xs sm:text-sm font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#312D44] border-r border-slate-200 dark:border-[#38344D] flex items-center select-none shrink-0">qmath.io.vn/</span>
                                    <input id="slSlugInput" type="text" maxlength="64" autocomplete="off" spellcheck="false"
                                        placeholder="de-on-9"
                                        class="flex-1 min-w-0 px-2.5 text-sm font-mono font-semibold bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed">
                                    <button type="button" id="slRandomSlugBtn"
                                        class="px-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#312D44] border-l border-slate-200 dark:border-[#38344D] flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                                        title="Tạo mã đuôi ngẫu nhiên 5 ký tự">
                                        <i class="fa-solid fa-shuffle text-xs"></i> <span class="hidden sm:inline">Ngẫu nhiên</span>
                                    </button>
                                </div>
                            </div>
                            <div class="md:col-span-4 flex items-center justify-end">
                                <button type="submit" id="slSubmitBtn"
                                    class="w-full h-10 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm">
                                    <i class="fa-solid fa-plus"></i> <span>Tạo link rút gọn</span>
                                </button>
                            </div>
                        </div>

                        <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div id="slSlugPreview" class="text-slate-600 dark:text-slate-400 font-medium">
                                Đường dẫn: <span class="font-mono font-bold text-sky-700 dark:text-sky-400">qmath.io.vn/...</span> (tự sinh mã nếu để trống)
                            </div>
                        </div>

                        <div id="slFormError" class="hidden px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
                            <i class="fa-solid fa-circle-exclamation shrink-0"></i>
                            <span id="slFormErrorText"></span>
                        </div>

                        <div id="slCreatedBanner" class="hidden px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 flex flex-wrap items-center justify-between gap-2">
                            <div class="min-w-0">
                                <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">Đã sẵn sàng sử dụng</span>
                                <a id="slCreatedLink" href="#" target="_blank" rel="noopener" class="font-mono font-extrabold text-sm text-emerald-900 dark:text-emerald-200 hover:underline break-all"></a>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0">
                                <button type="button" id="slBannerCopyClean" class="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                                    <i class="fa-regular fa-copy"></i> Sao chép
                                </button>
                                <button type="button" id="slBannerCopyGo" class="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E1B29] border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 cursor-pointer" title="Dùng khi gửi qua Zalo/hệ thống cần mã HTTP 200 OK">
                                    /go/?
                                </button>
                                <button type="button" id="slBannerQr" class="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#1E1B29] border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40 cursor-pointer" title="Hiện mã QR">
                                    <i class="fa-solid fa-qrcode"></i> QR
                                </button>
                            </div>
                        </div>
                    </form>

                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div class="relative flex-1">
                            <i class="fa-solid fa-magnifying-glass text-xs text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"></i>
                            <input id="slSearchInput" type="search" placeholder="Tìm theo đuôi link, tiêu đề hoặc URL gốc..."
                                class="w-full h-9 pl-8 pr-3 rounded-xl text-sm bg-white dark:bg-[#262335] border border-slate-200 dark:border-[#38344D] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500">
                        </div>
                        <div class="flex items-center gap-2 shrink-0 flex-wrap">
                            <select id="slSortSelect" aria-label="Sắp xếp link" class="h-9 px-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#262335] border border-slate-200 dark:border-[#38344D] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer">
                                <option value="newest">Mới nhất</option>
                                <option value="clicks">Nhiều lượt mở</option>
                            </select>
                            <select id="slCopyModeSelect" aria-label="Định dạng sao chép mặc định" title="qmath.io.vn/<slug> gọn đẹp nhất; /go/?<slug> trả HTTP 200 OK cho Zalo/webhook" class="h-9 px-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#262335] border border-slate-200 dark:border-[#38344D] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer">
                                <option value="clean">Chép: qmath.io.vn/slug</option>
                                <option value="go">Chép: qmath.io.vn/go/?slug (200 OK)</option>
                            </select>
                        </div>
                    </div>

                    <div id="slListContainer" class="rounded-xl border border-slate-200 dark:border-[#38344D] bg-white dark:bg-[#1E1B29] divide-y divide-slate-200 dark:divide-[#38344D] overflow-hidden"></div>
                </div>

                <div id="slQrOverlay" class="hidden absolute inset-0 z-20 bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4">
                    <div class="w-full max-w-xs bg-white dark:bg-[#1E1B29] rounded-2xl border border-slate-200 dark:border-[#38344D] shadow-2xl p-5 text-center space-y-3.5">
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-sm font-extrabold text-slate-900 dark:text-white">Mã QR QMath</span>
                            <button type="button" id="slQrCloseBtn" class="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-[#262335] text-slate-500 dark:text-slate-300 flex items-center justify-center cursor-pointer" title="Đóng QR">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div class="p-3 bg-white rounded-xl border border-slate-200 inline-flex items-center justify-center mx-auto">
                            <div id="slQrCanvasBox" class="w-[180px] h-[180px] flex items-center justify-center"></div>
                        </div>
                        <div class="space-y-0.5">
                            <div id="slQrTitle" class="text-xs font-bold text-slate-700 dark:text-slate-300 truncate"></div>
                            <div id="slQrUrlLabel" class="text-xs font-mono font-bold text-sky-700 dark:text-sky-400 break-all"></div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 pt-1">
                            <button type="button" id="slQrCopyBtn" class="h-9 rounded-xl border border-slate-200 dark:border-[#38344D] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#262335] flex items-center justify-center gap-1.5 cursor-pointer">
                                <i class="fa-regular fa-copy"></i> Sao chép
                            </button>
                            <button type="button" id="slQrDownloadBtn" class="h-9 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                                <i class="fa-solid fa-download"></i> Tải PNG
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        bindModalEvents(modal);
        return modal;
    }

    function setFormError(msg) {
        const box = document.getElementById('slFormError');
        const txt = document.getElementById('slFormErrorText');
        if (!box || !txt) return;
        if (msg) {
            txt.textContent = msg;
            box.classList.remove('hidden');
        } else {
            txt.textContent = '';
            box.classList.add('hidden');
        }
    }

    function updateSlugPreview() {
        const core = getCore();
        const slugInput = document.getElementById('slSlugInput');
        const previewEl = document.getElementById('slSlugPreview');
        if (!slugInput || !previewEl || !core) return;

        const raw = slugInput.value.trim();
        if (!raw) {
            previewEl.innerHTML = 'Đường dẫn: <span class="font-mono font-bold text-sky-700 dark:text-sky-400">qmath.io.vn/...</span> (sẽ tự tạo mã 5 ký tự)';
            return;
        }
        const check = core.validateSlug(raw);
        if (!check.valid) {
            previewEl.innerHTML = `Xem trước: <span class="font-mono font-bold text-rose-700 dark:text-rose-400">qmath.io.vn/${escapeHtml(check.slug || raw)}</span> — <span class="text-rose-700 dark:text-rose-300">${escapeHtml(check.error)}</span>`;
        } else {
            const existsInList = !state.editingSlug && state.items.some((it) => it.slug === check.slug);
            if (existsInList) {
                previewEl.innerHTML = `Xem trước: <span class="font-mono font-bold text-amber-700 dark:text-amber-400">qmath.io.vn/${escapeHtml(check.slug)}</span> — <span class="text-amber-700 dark:text-amber-300">Đuôi này đã tồn tại</span>`;
            } else {
                previewEl.innerHTML = `Xem trước: <span class="font-mono font-bold text-sky-700 dark:text-sky-400">https://qmath.io.vn/${escapeHtml(check.slug)}</span>`;
            }
        }
    }

    function showCreatedBanner(slug) {
        const core = getCore();
        const banner = document.getElementById('slCreatedBanner');
        const linkEl = document.getElementById('slCreatedLink');
        if (!banner || !linkEl || !core) return;
        if (!slug) {
            banner.classList.add('hidden');
            return;
        }
        state.lastCreatedSlug = slug;
        const url = core.buildShortUrl(slug, state.copyMode);
        linkEl.href = url;
        linkEl.textContent = url;
        banner.classList.remove('hidden');
    }

    function enterEditMode(item) {
        if (!item) return;
        state.editingSlug = item.slug;
        setFormError('');
        showCreatedBanner('');

        document.getElementById('slTargetUrl').value = item.targetUrl || '';
        document.getElementById('slTitle').value = item.title || '';
        const slugInput = document.getElementById('slSlugInput');
        slugInput.value = item.slug;
        slugInput.disabled = true;
        document.getElementById('slRandomSlugBtn').disabled = true;

        document.getElementById('slFormModeLabel').innerHTML = `<i class="fa-solid fa-pen-to-square text-amber-600 dark:text-amber-400"></i> Đang sửa <span class="font-mono text-sky-700 dark:text-sky-400">qmath.io.vn/${escapeHtml(item.slug)}</span>`;
        document.getElementById('slCancelEditBtn').classList.remove('hidden');
        document.getElementById('slSubmitBtn').innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Lưu thay đổi</span>';
        updateSlugPreview();
        document.getElementById('slTargetUrl').focus();
    }

    function resetFormMode(keepBanner) {
        state.editingSlug = '';
        setFormError('');
        if (!keepBanner) showCreatedBanner('');

        const form = document.getElementById('slCreateForm');
        if (form) form.reset();
        const slugInput = document.getElementById('slSlugInput');
        if (slugInput) slugInput.disabled = false;
        const randBtn = document.getElementById('slRandomSlugBtn');
        if (randBtn) randBtn.disabled = false;

        const modeLabel = document.getElementById('slFormModeLabel');
        if (modeLabel) modeLabel.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles text-sky-600 dark:text-sky-400"></i> Tạo đường dẫn mới';
        const cancelBtn = document.getElementById('slCancelEditBtn');
        if (cancelBtn) cancelBtn.classList.add('hidden');
        const submitBtn = document.getElementById('slSubmitBtn');
        if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span>Tạo link rút gọn</span>';
        updateSlugPreview();
    }

    function getFilteredItems() {
        const q = state.search.trim().toLowerCase();
        const list = state.items.filter((item) => {
            if (!q) return true;
            return item.slug.includes(q)
                || item.targetUrl.toLowerCase().includes(q)
                || item.title.toLowerCase().includes(q);
        });
        list.sort((a, b) => {
            if (state.sortBy === 'clicks') {
                const diff = (Number(b.clicks) || 0) - (Number(a.clicks) || 0);
                if (diff !== 0) return diff;
            }
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
        return list;
    }

    function renderList() {
        const core = getCore();
        const container = document.getElementById('slListContainer');
        const badge = document.getElementById('slTotalBadge');
        if (!container || !core) return;

        if (badge) {
            badge.textContent = `${state.items.length} link`;
        }

        if (state.loading) {
            container.innerHTML = `
                <div class="py-10 px-4 text-center text-sm text-slate-600 dark:text-slate-400 flex items-center justify-center gap-2.5">
                    <i class="fa-solid fa-circle-notch fa-spin text-sky-600"></i> Đang tải danh sách link rút gọn...
                </div>`;
            return;
        }

        if (state.error) {
            container.innerHTML = `
                <div class="py-10 px-4 text-center space-y-2.5">
                    <p class="text-sm font-semibold text-rose-700 dark:text-rose-300">${escapeHtml(state.error)}</p>
                    <button type="button" data-action="reload" class="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#262335] dark:hover:bg-[#312D44] text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                        <i class="fa-solid fa-rotate-right mr-1"></i> Thử lại
                    </button>
                </div>`;
            return;
        }

        if (state.items.length === 0) {
            container.innerHTML = `
                <div class="py-10 px-4 text-center space-y-1.5">
                    <i class="fa-solid fa-link-slash text-2xl text-slate-400"></i>
                    <p class="text-sm font-bold text-slate-700 dark:text-slate-200">Chưa có link rút gọn nào</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Dán đường dẫn dài ở ô phía trên để tạo link <span class="font-mono font-semibold">qmath.io.vn/...</span> đầu tiên.</p>
                </div>`;
            return;
        }

        const filtered = getFilteredItems();
        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="py-8 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
                    Không tìm thấy link nào khớp từ khóa "<span class="font-semibold text-slate-700 dark:text-slate-200">${escapeHtml(state.search)}</span>".
                </div>`;
            return;
        }

        container.innerHTML = filtered.map((item) => {
            const shortUrl = core.buildShortUrl(item.slug, state.copyMode);
            const isCopied = state.copiedSlug === item.slug;
            const isConfirmDelete = state.confirmDeleteSlug === item.slug;
            const pausedBadge = !item.active
                ? '<span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Tạm khóa</span>'
                : '';
            const titleChip = item.title
                ? `<span class="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[220px]" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>`
                : '';

            return `
                <div class="px-3.5 py-3 hover:bg-slate-50/75 dark:hover:bg-[#262335]/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5" data-slug="${escapeHtml(item.slug)}">
                    <div class="min-w-0 flex-1 space-y-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <a href="${escapeHtml(shortUrl)}" target="_blank" rel="noopener"
                               class="font-mono font-extrabold text-sm text-sky-700 dark:text-sky-400 hover:underline break-all">
                               qmath.io.vn/${escapeHtml(item.slug)}
                            </a>
                            ${pausedBadge}
                            ${titleChip}
                        </div>
                        <div class="text-xs text-slate-600 dark:text-slate-400 truncate" title="${escapeHtml(item.targetUrl)}">
                            <i class="fa-solid fa-arrow-turn-up fa-rotate-90 text-[10px] mr-1 text-slate-400"></i>${escapeHtml(item.targetUrl)}
                        </div>
                        <div class="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            <span class="tabular-nums"><i class="fa-regular fa-eye mr-1"></i>${Number(item.clicks) || 0} lượt mở</span>
                            <span class="tabular-nums"><i class="fa-regular fa-calendar mr-1"></i>${formatShortDate(item.createdAt)}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <button type="button" data-action="copy" data-slug="${escapeHtml(item.slug)}"
                            class="h-8 px-2.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${isCopied ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-700 dark:text-emerald-300' : 'bg-white dark:bg-[#262335] border-slate-200 dark:border-[#38344D] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#312D44]'}"
                            title="Sao chép ${escapeHtml(shortUrl)}">
                            <i class="fa-solid ${isCopied ? 'fa-check' : 'fa-copy'} text-[11px]"></i>
                            <span>${isCopied ? 'Đã chép' : 'Sao chép'}</span>
                        </button>
                        <button type="button" data-action="qr" data-slug="${escapeHtml(item.slug)}"
                            class="w-8 h-8 rounded-lg border border-slate-200 dark:border-[#38344D] bg-white dark:bg-[#262335] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#312D44] flex items-center justify-center transition-colors cursor-pointer"
                            title="Tạo mã QR">
                            <i class="fa-solid fa-qrcode text-xs"></i>
                        </button>
                        <button type="button" data-action="toggle" data-slug="${escapeHtml(item.slug)}"
                            class="w-8 h-8 rounded-lg border border-slate-200 dark:border-[#38344D] bg-white dark:bg-[#262335] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#312D44] flex items-center justify-center transition-colors cursor-pointer"
                            title="${item.active ? 'Tạm khóa đường dẫn' : 'Mở lại đường dẫn'}">
                            <i class="fa-solid ${item.active ? 'fa-pause' : 'fa-play'} text-xs"></i>
                        </button>
                        <button type="button" data-action="edit" data-slug="${escapeHtml(item.slug)}"
                            class="w-8 h-8 rounded-lg border border-slate-200 dark:border-[#38344D] bg-white dark:bg-[#262335] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#312D44] flex items-center justify-center transition-colors cursor-pointer"
                            title="Sửa link gốc / tiêu đề">
                            <i class="fa-solid fa-pen text-xs"></i>
                        </button>
                        <button type="button" data-action="delete" data-slug="${escapeHtml(item.slug)}"
                            class="h-8 ${isConfirmDelete ? 'px-2.5 bg-rose-600 text-white border-rose-600 hover:bg-rose-700' : 'w-8 bg-white dark:bg-[#262335] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#38344D] hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-300'} rounded-lg border text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            title="${isConfirmDelete ? 'Bấm lần nữa để xoá vĩnh viễn' : 'Xoá link rút gọn'}">
                            <i class="fa-solid fa-trash-can text-xs"></i>${isConfirmDelete ? '<span>Xoá?</span>' : ''}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function handleCopySlug(slug, forceMode) {
        const core = getCore();
        const mode = forceMode || state.copyMode;
        const url = core.buildShortUrl(slug, mode);
        const ok = await copyText(url);
        if (!ok) {
            notify('Trình duyệt không cho phép tự sao chép, hãy copy thủ công.', 'warning');
            return;
        }
        state.copiedSlug = slug;
        if (state.copiedTimer) clearTimeout(state.copiedTimer);
        state.copiedTimer = setTimeout(() => {
            state.copiedSlug = '';
            renderList();
        }, 1600);
        renderList();
        notify(`Đã sao chép: ${url}`, 'success');
    }

    function openQrOverlay(slug) {
        const core = getCore();
        const item = state.items.find((it) => it.slug === slug);
        if (!item || !core) return;

        state.qrSlug = slug;
        const overlay = document.getElementById('slQrOverlay');
        const box = document.getElementById('slQrCanvasBox');
        const titleEl = document.getElementById('slQrTitle');
        const urlEl = document.getElementById('slQrUrlLabel');
        if (!overlay || !box) return;

        const shortUrl = core.buildShortUrl(slug, state.copyMode);
        titleEl.textContent = item.title || 'Liên kết rút gọn QMath';
        urlEl.textContent = shortUrl;
        box.innerHTML = '';

        if (typeof global.QRCode === 'function') {
            new global.QRCode(box, {
                text: shortUrl,
                width: 180,
                height: 180,
                colorDark: '#0f172a',
                colorLight: '#ffffff',
                correctLevel: global.QRCode.CorrectLevel ? global.QRCode.CorrectLevel.M : 0
            });
        } else {
            box.innerHTML = '<span class="text-xs text-rose-600 font-semibold">Thiếu thư viện QRCode</span>';
        }
        overlay.classList.remove('hidden');
    }

    function closeQrOverlay() {
        state.qrSlug = '';
        const overlay = document.getElementById('slQrOverlay');
        if (overlay) overlay.classList.add('hidden');
    }

    function downloadQrPng() {
        const core = getCore();
        const box = document.getElementById('slQrCanvasBox');
        if (!box || !state.qrSlug || !core) return;
        const srcCanvas = box.querySelector('canvas');
        const srcImg = box.querySelector('img');

        const pad = 32;
        const captionH = 44;
        const qrSize = 360;
        const out = document.createElement('canvas');
        out.width = qrSize + pad * 2;
        out.height = qrSize + pad * 2 + captionH;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, out.width, out.height);

        if (srcCanvas) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(srcCanvas, pad, pad, qrSize, qrSize);
        } else if (srcImg) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(srcImg, pad, pad, qrSize, qrSize);
        } else {
            notify('Không tạo được ảnh QR để tải về.', 'error');
            return;
        }

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 18px "Be Vietnam Pro", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`qmath.io.vn/${state.qrSlug}`, out.width / 2, qrSize + pad + 28);

        const a = document.createElement('a');
        a.download = `qmath-qr-${state.qrSlug}.png`;
        a.href = out.toDataURL('image/png');
        a.click();
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        if (state.saving) return;

        const core = getCore();
        const urlInput = document.getElementById('slTargetUrl');
        const titleInput = document.getElementById('slTitle');
        const slugInput = document.getElementById('slSlugInput');
        const submitBtn = document.getElementById('slSubmitBtn');

        setFormError('');
        const isEditing = Boolean(state.editingSlug);
        let slugToSave = state.editingSlug;

        if (!isEditing) {
            const rawSlug = slugInput.value.trim();
            if (rawSlug) {
                const slugRes = core.validateSlug(rawSlug);
                if (!slugRes.valid) {
                    setFormError(slugRes.error);
                    slugInput.focus();
                    return;
                }
                slugToSave = slugRes.slug;
            } else {
                const existingSet = new Set(state.items.map((it) => it.slug));
                let candidate = core.generateRandomSlug(5);
                let tries = 0;
                while (existingSet.has(candidate) && tries < 20) {
                    candidate = core.generateRandomSlug(5);
                    tries++;
                }
                slugToSave = candidate;
            }
        }

        const urlRes = core.normalizeTargetUrl(urlInput.value, slugToSave);
        if (!urlRes.valid) {
            setFormError(urlRes.error);
            urlInput.focus();
            return;
        }

        state.saving = true;
        submitBtn.disabled = true;

        try {
            const teacher = getCurrentTeacherMeta();
            let saved;
            if (isEditing) {
                const current = state.items.find((it) => it.slug === slugToSave) || {};
                saved = await saveShortLinkRecord({
                    ...current,
                    slug: slugToSave,
                    targetUrl: urlRes.url,
                    title: titleInput.value.trim(),
                    active: current.active !== false
                });
                const idx = state.items.findIndex((it) => it.slug === slugToSave);
                if (idx >= 0) state.items[idx] = saved;
                else state.items.unshift(saved);
                resetFormMode(true);
                showCreatedBanner(slugToSave);
                notify(`Đã cập nhật qmath.io.vn/${slugToSave}`, 'success');
            } else {
                const existingRemote = await core.fetchShortLink(slugToSave);
                if (existingRemote) {
                    setFormError(`Đuôi "${slugToSave}" đã có người tạo trước đó. Hãy chọn đuôi khác hoặc bấm Ngẫu nhiên.`);
                    slugInput.focus();
                    return;
                }
                saved = await saveShortLinkRecord({
                    slug: slugToSave,
                    targetUrl: urlRes.url,
                    title: titleInput.value.trim(),
                    active: true,
                    clicks: 0,
                    createdAt: new Date().toISOString(),
                    createdBy: teacher.uid,
                    createdByName: teacher.name
                });
                state.items.unshift(saved);
                resetFormMode(true);
                showCreatedBanner(slugToSave);
                const shortUrl = core.buildShortUrl(slugToSave, state.copyMode);
                const copied = await copyText(shortUrl);
                notify(copied ? `Đã tạo & sao chép: ${shortUrl}` : `Đã tạo: ${shortUrl}`, 'success');
            }
            renderList();
        } catch (err) {
            setFormError('Không lưu được lên máy chủ: ' + (err && err.message ? err.message : 'Lỗi kết nối'));
        } finally {
            state.saving = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function handleToggleActive(slug) {
        const idx = state.items.findIndex((it) => it.slug === slug);
        if (idx < 0) return;
        const curr = state.items[idx];
        const nextActive = !curr.active;
        try {
            const updated = await saveShortLinkRecord({ ...curr, active: nextActive });
            state.items[idx] = updated;
            renderList();
            notify(nextActive ? `Đã mở lại qmath.io.vn/${slug}` : `Đã tạm khóa qmath.io.vn/${slug}`, 'info');
        } catch (err) {
            notify('Không cập nhật được trạng thái: ' + (err.message || 'Lỗi kết nối'), 'error');
        }
    }

    async function handleDeleteSlug(slug) {
        if (state.confirmDeleteSlug !== slug) {
            state.confirmDeleteSlug = slug;
            if (state.confirmDeleteTimer) clearTimeout(state.confirmDeleteTimer);
            state.confirmDeleteTimer = setTimeout(() => {
                state.confirmDeleteSlug = '';
                renderList();
            }, 3500);
            renderList();
            return;
        }
        state.confirmDeleteSlug = '';
        if (state.confirmDeleteTimer) clearTimeout(state.confirmDeleteTimer);
        try {
            await deleteShortLinkRecord(slug);
            state.items = state.items.filter((it) => it.slug !== slug);
            if (state.editingSlug === slug) resetFormMode(false);
            if (state.lastCreatedSlug === slug) showCreatedBanner('');
            renderList();
            notify(`Đã xoá link qmath.io.vn/${slug}`, 'success');
        } catch (err) {
            notify('Không xoá được link: ' + (err.message || 'Lỗi kết nối'), 'error');
        }
    }

    async function loadLinks() {
        state.loading = true;
        state.error = '';
        renderList();
        try {
            state.items = await fetchAllShortLinks();
            updateSlugPreview();
        } catch (err) {
            state.error = 'Không tải được danh sách link từ máy chủ. Kiểm tra mạng và thử lại.';
        } finally {
            state.loading = false;
            renderList();
        }
    }

    function bindModalEvents(modal) {
        if (state.initialized) return;
        state.initialized = true;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const m = document.getElementById('qmathShortLinkModal');
            if (!m || m.classList.contains('hidden')) return;
            const qr = document.getElementById('slQrOverlay');
            if (qr && !qr.classList.contains('hidden')) {
                closeQrOverlay();
                return;
            }
            closeModal();
        });

        document.getElementById('slCloseBtn').addEventListener('click', closeModal);
        document.getElementById('slRefreshBtn').addEventListener('click', loadLinks);
        document.getElementById('slCancelEditBtn').addEventListener('click', () => resetFormMode(false));
        document.getElementById('slCreateForm').addEventListener('submit', handleFormSubmit);

        document.getElementById('slSlugInput').addEventListener('input', () => {
            setFormError('');
            updateSlugPreview();
        });
        document.getElementById('slTargetUrl').addEventListener('input', () => setFormError(''));

        document.getElementById('slRandomSlugBtn').addEventListener('click', () => {
            const core = getCore();
            const existing = new Set(state.items.map((it) => it.slug));
            let code = core.generateRandomSlug(5);
            let tries = 0;
            while (existing.has(code) && tries < 20) {
                code = core.generateRandomSlug(5);
                tries++;
            }
            const input = document.getElementById('slSlugInput');
            input.value = code;
            setFormError('');
            updateSlugPreview();
            input.focus();
        });

        document.getElementById('slBannerCopyClean').addEventListener('click', () => {
            if (state.lastCreatedSlug) handleCopySlug(state.lastCreatedSlug, 'clean');
        });
        document.getElementById('slBannerCopyGo').addEventListener('click', () => {
            if (state.lastCreatedSlug) handleCopySlug(state.lastCreatedSlug, 'go');
        });
        document.getElementById('slBannerQr').addEventListener('click', () => {
            if (state.lastCreatedSlug) openQrOverlay(state.lastCreatedSlug);
        });

        document.getElementById('slSearchInput').addEventListener('input', (e) => {
            state.search = e.target.value || '';
            renderList();
        });
        document.getElementById('slSortSelect').addEventListener('change', (e) => {
            state.sortBy = e.target.value === 'clicks' ? 'clicks' : 'newest';
            renderList();
        });

        const copyModeSel = document.getElementById('slCopyModeSelect');
        copyModeSel.value = state.copyMode;
        copyModeSel.addEventListener('change', (e) => {
            saveCopyMode(e.target.value);
            if (state.lastCreatedSlug) showCreatedBanner(state.lastCreatedSlug);
            renderList();
        });

        document.getElementById('slListContainer').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const slug = btn.dataset.slug;
            if (action === 'reload') loadLinks();
            else if (action === 'copy') handleCopySlug(slug);
            else if (action === 'qr') openQrOverlay(slug);
            else if (action === 'toggle') handleToggleActive(slug);
            else if (action === 'edit') enterEditMode(state.items.find((it) => it.slug === slug));
            else if (action === 'delete') handleDeleteSlug(slug);
        });

        document.getElementById('slQrOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'slQrOverlay') closeQrOverlay();
        });
        document.getElementById('slQrCloseBtn').addEventListener('click', closeQrOverlay);
        document.getElementById('slQrDownloadBtn').addEventListener('click', downloadQrPng);
        document.getElementById('slQrCopyBtn').addEventListener('click', () => {
            if (state.qrSlug) handleCopySlug(state.qrSlug);
        });
    }

    function openShortLinkModal(prefill) {
        if (!getCore()) {
            notify('Chưa nạp module QMathShortLinkCore!', 'error');
            return;
        }
        const modal = ensureModalDom();
        modal.classList.remove('hidden');
        closeQrOverlay();
        resetFormMode(false);

        if (prefill && typeof prefill === 'object') {
            if (prefill.targetUrl) document.getElementById('slTargetUrl').value = prefill.targetUrl;
            if (prefill.title) document.getElementById('slTitle').value = prefill.title;
            if (prefill.slug) document.getElementById('slSlugInput').value = prefill.slug;
            updateSlugPreview();
        }

        loadLinks();
        setTimeout(() => {
            const el = document.getElementById('slTargetUrl');
            if (el) el.focus();
        }, 60);
    }

    function closeModal() {
        const modal = document.getElementById('qmathShortLinkModal');
        if (modal) modal.classList.add('hidden');
        closeQrOverlay();
    }

    global.openShortLinkModal = openShortLinkModal;
    global.closeShortLinkModal = closeModal;
})(typeof window !== 'undefined' ? window : globalThis);
