(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.QMathShortLinkCore = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEFAULT_ORIGIN = 'https://qmath.io.vn';
    const SUPABASE_URL = 'https://cuniqanbumcrqcdlcvad.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE4MTMsImV4cCI6MjEwNDUxNzgxM30.MWSv1QKVlQ9r-8r0hkrqWsmm75hULq_VjPCbTqXDe-o';
    const CONFIG_PREFIX = 'surl_';

    // Chặn các đường dẫn trùng với trang HTML / thư mục thật trên GitHub Pages qmath.io.vn
    const RESERVED_SLUGS = new Set([
        'index', 'dashboard', 'student', 'exam', 'exams', 'practice',
        'omr', 'omr-grader', 'tex2mathtype', 'exam-editor', 'exam-mixer', 'exam-print',
        'course-manager', 'course-player', 'book-manager', 'homework-player',
        'live-monitor', 'parent-watch', 'topic-bank', 'topic-builder', 'dashboard-mapid',
        'go', 'l', 's', 'api', 'data', 'san-choi', 'tools', 'ui',
        'camscanner', 'mathtype', 'n8n', 'functions', 'outputs', 'backups',
        'work', 'scripts', 'cloudflare-worker-hls', 'node_modules',
        'sw', 'manifest', 'favicon', 'robots', 'cname', '404',
        'assets', 'admin', 'login', 'register'
    ]);

    const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
    const RANDOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
    const STATIC_FILE_EXT_RE = /\.(?:html?|css|js|mjs|json|png|jpe?g|gif|webp|svg|ico|pdf|xml|txt|woff2?|ttf|eot|map)$/i;

    function normalizeSlug(raw) {
        return String(raw || '')
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/-{2,}/g, '-')
            .replace(/^[-_]+|[-_]+$/g, '');
    }

    function validateSlug(raw, options) {
        const opts = options || {};
        const shouldNormalize = opts.normalize !== false;
        const rawTrimmed = String(raw || '').trim();
        const slug = shouldNormalize ? normalizeSlug(rawTrimmed) : rawTrimmed.toLowerCase();

        if (!slug) {
            return { valid: false, slug: '', error: 'Slug không được để trống.' };
        }
        if (slug.length < 2) {
            return { valid: false, slug: slug, error: 'Slug cần tối thiểu 2 ký tự (ví dụ: de9, g1).' };
        }
        if (slug.length > 64) {
            return { valid: false, slug: slug, error: 'Slug tối đa 64 ký tự.' };
        }
        if (!SLUG_REGEX.test(slug)) {
            return { valid: false, slug: slug, error: 'Slug chỉ dùng chữ thường a-z, số 0-9, gạch ngang (-) hoặc gạch dưới (_).' };
        }
        if (RESERVED_SLUGS.has(slug)) {
            return { valid: false, slug: slug, error: `Tên "${slug}" trùng với trang hệ thống của QMath. Hãy chọn tên khác.` };
        }
        return { valid: true, slug: slug, error: '' };
    }

    function generateRandomSlug(length) {
        const size = Math.max(4, Math.min(12, Number(length) || 5));
        for (let attempt = 0; attempt < 20; attempt++) {
            let out = '';
            for (let i = 0; i < size; i++) {
                out += RANDOM_ALPHABET[Math.floor(Math.random() * RANDOM_ALPHABET.length)];
            }
            if (!RESERVED_SLUGS.has(out)) return out;
        }
        return 'q' + Date.now().toString(36).slice(-5);
    }

    function isSafeHttpUrl(urlStr) {
        try {
            const u = new URL(String(urlStr || '').trim());
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
            if (!u.hostname) return false;
            return u.hostname === 'localhost' || u.hostname.includes('.');
        } catch (e) {
            return false;
        }
    }

    function extractSlugFromLocation(href) {
        try {
            const url = new URL(href || (typeof window !== 'undefined' ? window.location.href : DEFAULT_ORIGIN));
            const explicit = url.searchParams.get('slug') || url.searchParams.get('c') || url.searchParams.get('s');
            if (explicit) {
                const norm = String(explicit).trim().toLowerCase();
                return (SLUG_REGEX.test(norm) && norm.length >= 2 && !RESERVED_SLUGS.has(norm)) ? norm : '';
            }

            const pathname = url.pathname || '/';
            const cleanPath = pathname.replace(/\/index\.html$/i, '').replace(/^\/+|\/+$/g, '');
            const segments = cleanPath ? cleanPath.split('/').filter(Boolean) : [];

            const isGoRoot = segments.length === 1 && (segments[0].toLowerCase() === 'go' || segments[0].toLowerCase() === 'l');
            if (isGoRoot) {
                const rawQuery = (url.search || '').replace(/^\?/, '');
                if (rawQuery) {
                    const firstToken = rawQuery.split('&')[0];
                    if (firstToken && !firstToken.includes('=')) {
                        const normQ = decodeURIComponent(firstToken).trim().toLowerCase();
                        if (SLUG_REGEX.test(normQ) && normQ.length >= 2 && !RESERVED_SLUGS.has(normQ)) {
                            return normQ;
                        }
                    }
                }
                const hashToken = (url.hash || '').replace(/^#\/?/, '').trim().toLowerCase();
                if (hashToken && SLUG_REGEX.test(hashToken) && hashToken.length >= 2 && !RESERVED_SLUGS.has(hashToken)) {
                    return hashToken;
                }
                return '';
            }

            let candidate = '';
            if (segments.length === 2 && (segments[0].toLowerCase() === 'go' || segments[0].toLowerCase() === 'l')) {
                candidate = decodeURIComponent(segments[1]);
            } else if (segments.length === 1) {
                const seg = decodeURIComponent(segments[0]);
                if (!STATIC_FILE_EXT_RE.test(seg)) {
                    candidate = seg;
                }
            }

            const normCand = String(candidate || '').trim().toLowerCase();
            if (!normCand || normCand.length < 2 || !SLUG_REGEX.test(normCand) || RESERVED_SLUGS.has(normCand)) {
                return '';
            }
            return normCand;
        } catch (e) {
            return '';
        }
    }

    function normalizeTargetUrl(raw, selfSlug) {
        const trimmed = String(raw || '').trim();
        if (!trimmed) {
            return { valid: false, url: '', error: 'Vui lòng nhập đường dẫn gốc cần rút gọn.' };
        }
        if (/^(?:javascript|data|vbscript|file|blob|about):/i.test(trimmed)) {
            return { valid: false, url: '', error: 'Đường dẫn này không được hỗ trợ vì lý do bảo mật.' };
        }

        const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : ('https://' + trimmed);
        let parsed;
        try {
            parsed = new URL(withProto);
        } catch (e) {
            return { valid: false, url: '', error: 'Đường dẫn gốc không đúng định dạng URL.' };
        }

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, url: '', error: 'Chỉ hỗ trợ đường dẫn http:// hoặc https://.' };
        }
        if (!parsed.hostname || (parsed.hostname !== 'localhost' && !parsed.hostname.includes('.'))) {
            return { valid: false, url: '', error: 'Tên miền trong đường dẫn gốc chưa hợp lệ.' };
        }

        const ownSlug = String(selfSlug || '').trim().toLowerCase();
        const hostLower = parsed.hostname.toLowerCase();
        if (ownSlug && (hostLower === 'qmath.io.vn' || hostLower === 'www.qmath.io.vn')) {
            if (extractSlugFromLocation(parsed.href) === ownSlug) {
                return { valid: false, url: '', error: 'Link đích không thể trỏ vòng lại chính link rút gọn này.' };
            }
        }

        return { valid: true, url: parsed.href, error: '' };
    }

    function buildShortUrl(slug, mode, origin) {
        const cleanSlug = String(slug || '').trim().toLowerCase();
        const base = String(origin || DEFAULT_ORIGIN).replace(/\/+$/, '');
        if (!cleanSlug) return base + '/';
        if (mode === 'go') return base + '/go/?' + encodeURIComponent(cleanSlug);
        return base + '/' + encodeURIComponent(cleanSlug);
    }

    function normalizeRecord(row) {
        if (!row) return null;
        const raw = (row.raw_data && typeof row.raw_data === 'object') ? row.raw_data : row;
        const idStr = String(row.id || raw.id || '');
        const cleanSlug = String(raw.slug || (idStr.startsWith(CONFIG_PREFIX) ? idStr.slice(CONFIG_PREFIX.length) : idStr)).trim().toLowerCase();
        if (!cleanSlug) return null;
        return {
            id: cleanSlug,
            slug: cleanSlug,
            targetUrl: String(raw.targetUrl || raw.url || '').trim(),
            title: String(raw.title || '').trim(),
            active: raw.active !== false,
            clicks: Number.isFinite(Number(raw.clicks)) ? Number(raw.clicks) : 0,
            createdAt: raw.createdAt || row.updated_at || new Date().toISOString(),
            updatedAt: raw.updatedAt || row.updated_at || new Date().toISOString(),
            lastClickedAt: raw.lastClickedAt || null,
            createdBy: String(raw.createdBy || ''),
            createdByName: String(raw.createdByName || '')
        };
    }

    function restHeaders(prefer) {
        const h = {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        };
        if (prefer) h['Prefer'] = prefer;
        return h;
    }

    async function fetchShortLink(slug) {
        const cleanSlug = String(slug || '').trim().toLowerCase();
        if (!cleanSlug) return null;
        const confId = CONFIG_PREFIX + cleanSlug;
        const endpoint = `${SUPABASE_URL}/rest/v1/configurations?id=eq.${encodeURIComponent(confId)}&select=id,raw_data,updated_at`;
        const res = await fetch(endpoint, {
            method: 'GET',
            cache: 'no-store',
            headers: restHeaders()
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const rec = normalizeRecord(rows[0]);
        return rec ? { record: rec, rawData: rows[0].raw_data || {} } : null;
    }

    async function recordClickBestEffort(record, rawData) {
        if (!record || !record.slug) return false;
        const confId = CONFIG_PREFIX + record.slug;
        const nowIso = new Date().toISOString();
        const nextRaw = Object.assign({}, rawData || {}, {
            id: record.slug,
            slug: record.slug,
            targetUrl: record.targetUrl,
            clicks: (Number(record.clicks) || 0) + 1,
            lastClickedAt: nowIso
        });
        try {
            const endpoint = `${SUPABASE_URL}/rest/v1/configurations?id=eq.${encodeURIComponent(confId)}`;
            const res = await fetch(endpoint, {
                method: 'PATCH',
                keepalive: true,
                headers: restHeaders('return=minimal'),
                body: JSON.stringify({
                    raw_data: nextRaw,
                    updated_at: nowIso
                })
            });
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function bootRedirectPage(els) {
        const ui = els || {};
        const showCard = (opts) => {
            if (ui.card) ui.card.classList.add('is-visible');
            if (ui.badge) ui.badge.textContent = opts.badge || 'QMath Link';
            if (ui.badge) ui.badge.dataset.state = opts.state || 'info';
            if (ui.title) ui.title.textContent = opts.title || '';
            if (ui.desc) ui.desc.textContent = opts.desc || '';
            if (ui.spinner) ui.spinner.style.display = opts.loading ? 'inline-block' : 'none';
            if (ui.actions) ui.actions.style.display = opts.showActions ? 'flex' : 'none';
            if (ui.manualWrap) ui.manualWrap.style.display = opts.manualUrl ? 'block' : 'none';
            if (ui.manualLink && opts.manualUrl) {
                ui.manualLink.href = opts.manualUrl;
                ui.manualLink.textContent = opts.manualUrl;
            }
            if (ui.retryBtn) ui.retryBtn.style.display = opts.showRetry ? 'inline-flex' : 'none';
        };

        const slug = extractSlugFromLocation(typeof window !== 'undefined' ? window.location.href : '');
        if (!slug) {
            showCard({
                state: 'error',
                badge: '404 • Không tìm thấy',
                title: 'Đường dẫn này không tồn tại',
                desc: 'Liên kết bạn truy cập không hợp lệ hoặc trang không còn trên QMath.',
                showActions: true
            });
            return;
        }

        try {
            const found = await fetchShortLink(slug);
            if (!found || !found.record) {
                showCard({
                    state: 'error',
                    badge: '404 • Liên kết trống',
                    title: 'Không tìm thấy link rút gọn',
                    desc: `Đường dẫn qmath.io.vn/${slug} chưa được tạo hoặc đã bị xoá bởi giáo viên.`,
                    showActions: true
                });
                return;
            }

            const rec = found.record;
            if (!rec.active) {
                showCard({
                    state: 'paused',
                    badge: 'Tạm ngưng',
                    title: 'Liên kết đang tạm khóa',
                    desc: `Giáo viên đã tạm dừng đường dẫn qmath.io.vn/${slug}.`,
                    showActions: true
                });
                return;
            }

            if (!isSafeHttpUrl(rec.targetUrl)) {
                showCard({
                    state: 'error',
                    badge: 'Không an toàn',
                    title: 'Link đích không hợp lệ',
                    desc: 'Đích đến của liên kết này không phải đường dẫn web chuẩn http/https.',
                    showActions: true
                });
                return;
            }

            showCard({
                state: 'redirecting',
                badge: 'Đang mở',
                title: rec.title ? rec.title : 'Đang chuyển tới nội dung...',
                desc: `QMath đang mở liên kết qmath.io.vn/${slug}`,
                loading: true,
                manualUrl: rec.targetUrl
            });

            await Promise.race([recordClickBestEffort(rec, found.rawData), delay(120)]);
            window.location.replace(rec.targetUrl);
        } catch (err) {
            showCard({
                state: 'error',
                badge: 'Lỗi kết nối',
                title: 'Không tải được đường dẫn',
                desc: 'Kết nối máy chủ tạm thời gián đoạn. Vui lòng thử lại sau vài giây.',
                showActions: true,
                showRetry: true
            });
        }
    }

    return {
        DEFAULT_ORIGIN,
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        CONFIG_PREFIX,
        RESERVED_SLUGS,
        normalizeSlug,
        validateSlug,
        generateRandomSlug,
        isSafeHttpUrl,
        normalizeTargetUrl,
        extractSlugFromLocation,
        buildShortUrl,
        normalizeRecord,
        fetchShortLink,
        recordClickBestEffort,
        bootRedirectPage
    };
}));
