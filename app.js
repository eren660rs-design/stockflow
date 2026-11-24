// =====================================================================
// StockFlow — uygulama
// =====================================================================

const NEDENLER = {
    SKT_GECTI:        { label: 'SKT Geçti',        color: 'var(--chart-1)', badge: 'indigo' },
    BOZULMA:          { label: 'Bozulma',          color: 'var(--chart-4)', badge: 'red' },
    HAZIRLAMA_HATASI: { label: 'Hazırlama Hatası', color: 'var(--chart-3)', badge: 'amber' },
    GUN_SONU_KALAN:   { label: 'Gün Sonu Kalan',   color: 'var(--chart-2)', badge: 'blue' }
};
const HAREKETLER = {
    GIRIS:   { label: 'Giriş',   badge: 'green' },
    SATIS:   { label: 'Satış',   badge: 'blue' },
    TUKETIM: { label: 'Tüketim', badge: 'gray' }
};
const DURUMLAR = {
    TUKENDI: { label: 'Tükendi', badge: 'red' },
    KRITIK:  { label: 'Kritik',  badge: 'amber' },
    YETERLI: { label: 'Yeterli', badge: 'green' }
};
const PAGES = {
    genel:   { title: 'Genel Bakış',      sub: 'Şubelerin fire ve stok performansı' },
    fire:    { title: 'Fire Kayıtları',   sub: 'Zayi olan ürünler ve maliyetleri' },
    stok:    { title: 'Stok Durumu',      sub: 'Şube bazında anlık envanter ve kritik seviyeler' },
    hareket: { title: 'Stok Hareketleri', sub: 'Giriş, satış ve tüketim kayıtları' },
    urun:    { title: 'Ürünler',          sub: 'Ürün tanımları, maliyetler ve eşik değerleri' }
};
const DAY = 86400000;

// ---------- durum ----------
const state = {
    data: null,
    route: 'genel',
    isletme: 'all',
    period: 30,
    fire: { q: '', neden: 'all', sort: { key: 'kayit_tarihi', dir: -1 } },
    stok: { q: '', durum: 'all', sort: { key: 'durum', dir: 1 } },
    hareket: { q: '', tip: 'all', sort: { key: 'islem_tarihi', dir: -1 } },
    urun: { q: '', sort: { key: 'urun_adi', dir: 1 } },
    editingUrun: null
};
const PREFS_KEY = 'stockflow-prefs';
try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (p.isletme) state.isletme = p.isletme;
    if (p.period !== undefined) state.period = p.period;
} catch (_) {}
function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ isletme: state.isletme, period: state.period })); } catch (_) {}
}

// ---------- yardımcılar ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tl0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const pf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const dtf = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const dfl = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const fmtTL = v => tl.format(v || 0);
const fmtNum = v => nf.format(v || 0);
const icon = (id, cls = '') => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
const sum = (arr, f) => arr.reduce((a, x) => a + (typeof f === 'function' ? f(x) : x[f]) , 0);
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const norm = s => String(s ?? '').toLocaleLowerCase('tr');

function relTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return 'şimdi';
    if (m < 60) return `${m} dk önce`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} sa önce`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d} gün önce`;
    return df.format(new Date(iso));
}

function periodRange(days = state.period) {
    if (!days) return { since: -Infinity, prevSince: null };
    const since = startOfToday() - (days - 1) * DAY;
    return { since, prevSince: since - days * DAY };
}
const byIsletme = rows => state.isletme === 'all' ? rows : rows.filter(r => String(r.isletme_id) === String(state.isletme));
const inPeriod = (rows, field) => { const { since } = periodRange(); return rows.filter(r => new Date(r[field]).getTime() >= since); };
const periodLabel = () => state.period ? `Son ${state.period} gün` : 'Tüm zamanlar';

function sortRows(rows, { key, dir }, getters = {}) {
    const get = getters[key] || (r => r[key]);
    return [...rows].sort((a, b) => {
        const x = get(a), y = get(b);
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x ?? '').localeCompare(String(y ?? ''), 'tr') * dir;
    });
}
function th(label, key, sort, cls = '') {
    const active = sort.key === key;
    return `<th class="sortable ${cls}" data-sort="${key}">${label}<span class="arrow">${active ? (sort.dir > 0 ? '↑' : '↓') : ''}</span></th>`;
}
function bindSort(root, pageState, rerender) {
    $$('th[data-sort]', root).forEach(el => el.addEventListener('click', () => {
        const k = el.dataset.sort;
        pageState.sort = pageState.sort.key === k ? { key: k, dir: -pageState.sort.dir } : { key: k, dir: 1 };
        rerender();
    }));
}
function emptyState(ic, title, text, action = '') {
    return `<div class="empty"><div class="empty-icon">${icon(ic)}</div><h4>${esc(title)}</h4><p>${esc(text)}</p>${action}</div>`;
}

// ---------- bildirim ----------
function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="ti">${icon(type === 'success' ? 'check' : 'x')}</span><span>${esc(msg)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, type === 'error' ? 5500 : 3200);
}

function confirmDialog(title, text, okLabel = 'Sil') {
    const dlg = $('#confirm-modal');
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = okLabel;
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise(res => dlg.addEventListener('close', () => res(dlg.returnValue === 'ok'), { once: true }));
}

// =====================================================================
// VERİ
// =====================================================================
let loading = false;
async function reload({ silent = false } = {}) {
    if (loading) return;
    loading = true;
    const btn = $('#refresh-btn');
    btn.classList.add('spinning');
    try {
        state.data = await DB.loadAll();
        if (state.isletme !== 'all' && !state.data.isletmeler.some(i => String(i.id) === String(state.isletme))) state.isletme = 'all';
        renderShell();
        render();
    } catch (e) {
        if (!silent) toast(e.message, 'error');
        if (!state.data) $('#content').innerHTML = `<div class="card">${emptyState('alert', 'Veriler yüklenemedi', e.message,
            '<button class="btn btn-secondary" onclick="openConnModal()">Bağlantı ayarları</button>')}</div>`;
    } finally {
        loading = false;
        btn.classList.remove('spinning');
    }
}

let reloadTimer = null;
function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => reload({ silent: true }), 400);
}

// =====================================================================
// KABUK (menü, filtre, bağlantı)
// =====================================================================
function renderShell() {
    const d = state.data;
    const sel = $('#global-isletme');
    sel.innerHTML = `<option value="all">Tüm şubeler</option>` +
        d.isletmeler.map(i => `<option value="${i.id}">${esc(i.ad)}</option>`).join('');
    sel.value = state.isletme;

    const kritik = byIsletme(d.stok).filter(s => s.durum !== 'YETERLI').length;
    $('#nav-kritik-count').textContent = kritik || '';
    $('#nav-fire-count').textContent = byIsletme(d.fireler).length || '';
    renderConn();
}

function renderConn() {
    const btn = $('#conn-btn');
    const banner = $('#banner');
    btn.classList.remove('live', 'demo', 'error');
    btn.classList.add(DB.mode);
    if (DB.mode === 'live') {
        const cfg = DB.readConfig();
        $('#conn-title').textContent = 'Supabase · Canlı';
        $('#conn-sub').textContent = cfg ? cfg.url.replace(/^https?:\/\//, '') : '';
        banner.hidden = true;
    } else if (DB.mode === 'error') {
        $('#conn-title').textContent = 'Bağlantı hatası';
        $('#conn-sub').textContent = 'Demo verisi gösteriliyor';
        banner.className = 'banner error';
        banner.innerHTML = `${icon('alert')}<span><strong>Supabase'e bağlanılamadı:</strong> ${esc(DB.lastError)}</span><button class="btn btn-sm btn-secondary" onclick="openConnModal()">Ayarlar</button>`;
        banner.hidden = false;
    } else {
        $('#conn-title').textContent = 'Demo Modu';
        $('#conn-sub').textContent = 'Değişiklikler kaydedilmez';
        banner.className = 'banner demo';
        banner.innerHTML = `${icon('plug')}<span><strong>Demo modundasınız.</strong> Örnek veriler gösteriliyor; sayfayı yenileyince değişiklikler sıfırlanır.</span><button class="btn btn-sm btn-secondary" onclick="openConnModal()">Supabase'e bağlan</button>`;
        banner.hidden = false;
    }
}

function setRoute() {
    const r = (location.hash.match(/^#\/(\w+)/) || [])[1];
    state.route = PAGES[r] ? r : 'genel';
    $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === state.route));
    $('#page-title').textContent = PAGES[state.route].title;
    $('#page-sub').textContent = PAGES[state.route].sub;
    document.title = `${PAGES[state.route].title} · StockFlow`;
    closeSidebar();
    if (state.data) render();
    window.scrollTo(0, 0);
}

function render() {
    const root = $('#content');
    ({ genel: renderGenel, fire: renderFire, stok: renderStok, hareket: renderHareket, urun: renderUrun })[state.route](root);
}

function periodControl() {
    const opts = [[7, '7G'], [30, '30G'], [90, '90G'], [0, 'Tümü']];
    return `<div class="period" role="group" aria-label="Dönem">${opts.map(([v, l]) =>
        `<button type="button" data-period="${v}" class="${state.period === v ? 'active' : ''}">${l}</button>`).join('')}</div>`;
}
function bindPeriod(root) {
    $$('[data-period]', root).forEach(b => b.addEventListener('click', () => {
        state.period = Number(b.dataset.period); savePrefs(); render();
    }));
}

// =====================================================================
// SAYFA: GENEL BAKIŞ
// =====================================================================
function renderGenel(root) {
    const d = state.data;
    const fAll = byIsletme(d.fireler);
    const hAll = byIsletme(d.hareketler);
    const stok = byIsletme(d.stok);
    const { since, prevSince } = periodRange();

    const fNow = fAll.filter(f => new Date(f.kayit_tarihi).getTime() >= since);
    const zarar = sum(fNow, 'zarar_tl');
    let delta = '';
    if (prevSince !== null) {
        const prev = sum(fAll.filter(f => { const t = new Date(f.kayit_tarihi).getTime(); return t >= prevSince && t < since; }), 'zarar_tl');
        if (prev > 0) {
            const ch = (zarar - prev) / prev * 100;
            const cls = Math.abs(ch) < 0.5 ? 'flat' : ch > 0 ? 'up' : 'down';
            delta = `<span class="delta ${cls}">${ch > 0 ? '+' : ''}${pf.format(ch)}%</span> önceki döneme göre`;
        } else if (zarar > 0) delta = `Önceki dönemde fire yok`;
    }
    const giris = sum(hAll.filter(h => h.hareket_tipi === 'GIRIS' && new Date(h.islem_tarihi).getTime() >= since), 'tutar_tl');
    const oran = giris > 0 ? zarar / giris * 100 : null;
    const tukenen = stok.filter(s => s.durum === 'TUKENDI').length;
    const kritik = stok.filter(s => s.durum === 'KRITIK').length;
    const stokDegeri = sum(stok, s => Math.max(0, s.stok_degeri_tl));

    root.innerHTML = `
        <div class="section-bar">
            <h2>${esc(state.isletme === 'all' ? 'Tüm şubeler' : d.isletmeler.find(i => String(i.id) === String(state.isletme))?.ad)} <span class="faint" style="font-weight:500">· ${periodLabel()}</span></h2>
            ${periodControl()}
        </div>

        <div class="grid kpis">
            <div class="card kpi">
                <div class="kpi-top"><span class="kpi-label">Fire zararı</span><span class="kpi-icon red">${icon('trend')}</span></div>
                <div class="kpi-value">${fmtTL(zarar)}</div>
                <div class="kpi-foot">${delta || `${fNow.length} kayıt`}</div>
            </div>
            <div class="card kpi">
                <div class="kpi-top"><span class="kpi-label">Fire oranı</span><span class="kpi-icon indigo">${icon('percent')}</span></div>
                <div class="kpi-value">${oran === null ? '—' : '%' + pf.format(oran)}</div>
                <div class="kpi-foot">${giris > 0 ? `${tl0.format(giris)} mal girişine karşı` : 'Dönemde mal girişi yok'}</div>
            </div>
            <div class="card kpi">
                <div class="kpi-top"><span class="kpi-label">Dikkat gereken stok</span><span class="kpi-icon amber">${icon('alert')}</span></div>
                <div class="kpi-value">${tukenen + kritik} <span style="font-size:15px;font-weight:500" class="faint">kalem</span></div>
                <div class="kpi-foot">${tukenen ? `<span class="badge red plain">${tukenen} tükendi</span>` : ''}${kritik ? `<span class="badge amber plain">${kritik} kritik</span>` : ''}${!tukenen && !kritik ? 'Tüm stoklar yeterli' : ''}</div>
            </div>
            <div class="card kpi">
                <div class="kpi-top"><span class="kpi-label">Stok değeri</span><span class="kpi-icon green">${icon('box')}</span></div>
                <div class="kpi-value">${fmtTL(stokDegeri)}</div>
                <div class="kpi-foot">${stok.length} şube × ürün kalemi</div>
            </div>
        </div>

        <div class="grid cols-2">
            <div class="card">
                <div class="card-head"><div><h3>Günlük fire zararı</h3><p>${periodLabel()} · ₺ cinsinden</p></div></div>
                <div class="card-body"><div class="chart" id="daily-chart"></div></div>
            </div>
            <div class="card">
                <div class="card-head"><div><h3>Fire nedenleri</h3><p>Zarara göre dağılım</p></div></div>
                <div class="card-body">${reasonBars(fNow)}</div>
            </div>
        </div>

        <div class="grid cols-2-even">
            <div class="card">
                <div class="card-head"><div><h3>${state.isletme === 'all' ? 'Şube karşılaştırması' : 'Kategori dağılımı'}</h3><p>${state.isletme === 'all' ? 'Mal girişine oranla fire' : 'Kategorilere göre fire zararı'}</p></div></div>
                <div class="card-body">${state.isletme === 'all' ? branchTable(d, since) : categoryBars(fNow)}</div>
            </div>
            <div class="card">
                <div class="card-head"><div><h3>En çok zarar ettiren ürünler</h3><p>${periodLabel()}</p></div><a class="card-link" href="#/fire">Tümü →</a></div>
                <div class="card-body">${topProducts(fNow)}</div>
            </div>
        </div>

        <div class="grid cols-2-even" style="margin-bottom:0">
            <div class="card">
                <div class="card-head"><div><h3>Kritik stoklar</h3><p>Eşiğin altına düşen kalemler</p></div><a class="card-link" href="#/stok">Stok durumu →</a></div>
                <div class="card-body">${criticalList(stok)}</div>
            </div>
            <div class="card">
                <div class="card-head"><div><h3>Son fire kayıtları</h3><p>En son girilen 6 kayıt</p></div><a class="card-link" href="#/fire">Tümü →</a></div>
                <div class="card-body">${recentFires(fAll)}</div>
            </div>
        </div>`;

    bindPeriod(root);
    drawDailyChart($('#daily-chart', root), fNow);
}

function drawDailyChart(el, fires) {
    let days = state.period;
    if (!days) {
        const oldest = fires.reduce((m, f) => Math.min(m, new Date(f.kayit_tarihi).getTime()), Date.now());
        days = Math.min(180, Math.max(7, Math.ceil((startOfToday() - oldest) / DAY) + 1));
    }
    const start = startOfToday() - (days - 1) * DAY;
    const buckets = new Map();
    for (let i = 0; i < days; i++) buckets.set(dayKey(start + i * DAY), { t: start + i * DAY, v: 0, n: 0 });
    fires.forEach(f => { const b = buckets.get(dayKey(f.kayit_tarihi)); if (b) { b.v += f.zarar_tl; b.n++; } });
    const data = [...buckets.values()];
    if (!fires.length) { el.innerHTML = `<div class="chart-empty">Bu dönemde fire kaydı yok</div>`; return; }

    const W = 640, H = 230, pl = 52, pr = 8, pt = 10, pb = 26;
    const iw = W - pl - pr, ih = H - pt - pb;
    const max = Math.max(...data.map(x => x.v));
    const step = niceStep(max / 4);
    const top = Math.max(step, Math.ceil(max / step) * step);
    const bw = iw / data.length;
    const barW = Math.max(2, Math.min(28, bw * 0.62));
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    const labelEvery = Math.ceil(data.length / 8);

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Günlük fire zararı grafiği">
        ${ticks.map(v => { const y = pt + ih - v / top * ih; return `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text class="axis-text" x="${pl - 8}" y="${y + 4}" text-anchor="end">${tl0.format(v)}</text>`; }).join('')}
        ${data.map((x, i) => {
            const h = x.v / top * ih;
            const cx = pl + i * bw + bw / 2;
            const lbl = (data.length - 1 - i) % labelEvery === 0 ? `<text class="axis-text" x="${cx}" y="${H - 6}" text-anchor="middle">${df.format(x.t)}</text>` : '';
            return `<g class="bar-group" data-i="${i}">
                <rect class="bar-hit" x="${pl + i * bw}" y="${pt}" width="${bw}" height="${ih}" rx="3"/>
                ${x.v > 0 ? `<rect class="bar" x="${cx - barW / 2}" y="${pt + ih - h}" width="${barW}" height="${Math.max(h, 2)}" rx="${Math.min(4, barW / 3)}"/>` : ''}
                ${lbl}</g>`;
        }).join('')}
    </svg><div class="tooltip" hidden></div>`;

    const tip = $('.tooltip', el);
    const svg = $('svg', el);
    $$('.bar-group', el).forEach(g => {
        g.addEventListener('mouseenter', () => {
            const x = data[g.dataset.i];
            const r = $('.bar-hit', g).getBoundingClientRect(), base = el.getBoundingClientRect(), s = svg.getBoundingClientRect();
            const barTop = s.top + (pt + ih - x.v / top * ih) * (s.height / H);
            tip.innerHTML = `<strong>${fmtTL(x.v)}</strong>${dfl.format(x.t)} · ${x.n} kayıt`;
            tip.style.left = `${Math.min(Math.max(r.left + r.width / 2 - base.left, 70), base.width - 70)}px`;
            tip.style.top = `${barTop - base.top - 8}px`;
            tip.hidden = false;
        });
        g.addEventListener('mouseleave', () => { tip.hidden = true; });
    });
}
function niceStep(raw) {
    if (raw <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function reasonBars(fires) {
    if (!fires.length) return emptyState('check', 'Fire yok', 'Bu dönemde kayıt bulunmuyor.');
    const total = sum(fires, 'zarar_tl');
    const rows = Object.entries(NEDENLER).map(([k, n]) => {
        const fs = fires.filter(f => f.fire_nedeni === k);
        return { ...n, v: sum(fs, 'zarar_tl'), c: fs.length };
    }).sort((a, b) => b.v - a.v);
    return `<div class="hbars">${rows.map(r => `
        <div class="hbar-row">
            <div class="hbar-label"><span class="dot" style="background:${r.color}"></span><span class="t">${r.label}</span><span class="faint" style="font-size:12px">${r.c}</span></div>
            <div class="hbar-value">${tl0.format(r.v)}<small>%${pf.format(total ? r.v / total * 100 : 0)}</small></div>
            <div class="hbar-track"><div class="hbar-fill" style="width:${total ? r.v / total * 100 : 0}%;background:${r.color}"></div></div>
        </div>`).join('')}</div>`;
}

function categoryBars(fires) {
    if (!fires.length) return emptyState('check', 'Fire yok', 'Bu dönemde kayıt bulunmuyor.');
    const m = new Map();
    fires.forEach(f => m.set(f.kategori_adi, (m.get(f.kategori_adi) || 0) + f.zarar_tl));
    const rows = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const max = rows[0][1];
    return `<div class="hbars">${rows.map(([k, v]) => `
        <div class="hbar-row">
            <div class="hbar-label"><span class="t">${esc(k)}</span></div>
            <div class="hbar-value">${fmtTL(v)}</div>
            <div class="hbar-track"><div class="hbar-fill" style="width:${v / max * 100}%;background:var(--chart-1)"></div></div>
        </div>`).join('')}</div>`;
}

function branchTable(d, since) {
    const rows = d.isletmeler.map(i => {
        const giris = sum(d.hareketler.filter(h => h.isletme_id === i.id && h.hareket_tipi === 'GIRIS' && new Date(h.islem_tarihi).getTime() >= since), 'tutar_tl');
        const fire = sum(d.fireler.filter(f => f.isletme_id === i.id && new Date(f.kayit_tarihi).getTime() >= since), 'zarar_tl');
        return { i, giris, fire, oran: giris > 0 ? fire / giris * 100 : null };
    }).sort((a, b) => (b.oran ?? -1) - (a.oran ?? -1));
    const maxOran = Math.max(1, ...rows.map(r => r.oran || 0));
    return `<div class="table-wrap"><table class="branch-table">
        <thead><tr><th>Şube</th><th class="num">Giriş</th><th class="num">Fire</th><th class="num">Oran</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
            <td><div class="cell-main">${esc(r.i.ad)}</div><div class="cell-sub">${esc(r.i.konum || '')}</div></td>
            <td class="num muted">${tl0.format(r.giris)}</td>
            <td class="num">${tl0.format(r.fire)}</td>
            <td class="num"><div class="ratio"><div class="ratio-track"><div class="ratio-fill" style="width:${(r.oran || 0) / maxOran * 100}%"></div></div><strong>${r.oran === null ? '—' : '%' + pf.format(r.oran)}</strong></div></td>
        </tr>`).join('')}</tbody></table></div>`;
}

function topProducts(fires) {
    if (!fires.length) return emptyState('check', 'Fire yok', 'Bu dönemde kayıt bulunmuyor.');
    const m = new Map();
    fires.forEach(f => {
        const x = m.get(f.urun_id) || { ad: f.urun_adi, kat: f.kategori_adi, birim: f.birim, miktar: 0, v: 0 };
        x.miktar += f.fire_miktari; x.v += f.zarar_tl; m.set(f.urun_id, x);
    });
    const rows = [...m.values()].sort((a, b) => b.v - a.v).slice(0, 5);
    return `<div class="list">${rows.map((r, i) => `
        <div class="list-item">
            <span class="rank">${i + 1}</span>
            <div class="grow"><div class="cell-main">${esc(r.ad)}</div><div class="cell-sub">${fmtNum(r.miktar)} ${esc(r.birim)} · ${esc(r.kat)}</div></div>
            <strong class="num">${fmtTL(r.v)}</strong>
        </div>`).join('')}</div>`;
}

function criticalList(stok) {
    const rows = stok.filter(s => s.durum !== 'YETERLI')
        .sort((a, b) => (a.kalan_stok / (a.kritik_stok_esigi || 1)) - (b.kalan_stok / (b.kritik_stok_esigi || 1))).slice(0, 6);
    if (!rows.length) return emptyState('check', 'Her şey yolunda', 'Eşiğin altında stok bulunmuyor.');
    return `<div class="list">${rows.map(s => `
        <div class="list-item">
            <div class="grow"><div class="cell-main">${esc(s.urun_adi)}</div><div class="cell-sub">${esc(s.isletme_adi)}</div></div>
            <div style="width:120px">${meter(s)}</div>
            <span class="num" style="min-width:74px"><strong>${fmtNum(s.kalan_stok)}</strong> <span class="faint">/ ${fmtNum(s.kritik_stok_esigi)}</span></span>
            <button class="btn btn-sm btn-secondary" data-restock="${s.isletme_id}:${s.urun_id}" title="Stok girişi yap">${icon('plus')}Giriş</button>
        </div>`).join('')}</div>`;
}

function recentFires(fires) {
    if (!fires.length) return emptyState('trash', 'Henüz kayıt yok', 'İlk fire kaydını oluşturun.');
    return `<div class="list">${fires.slice(0, 6).map(f => `
        <div class="list-item">
            <div class="grow"><div class="cell-main">${esc(f.urun_adi)} <span class="faint" style="font-weight:400">· ${fmtNum(f.fire_miktari)} ${esc(f.birim)}</span></div>
                <div class="cell-sub">${esc(f.isletme_adi)} · ${relTime(f.kayit_tarihi)}</div></div>
            <span class="badge ${NEDENLER[f.fire_nedeni]?.badge || 'gray'}">${NEDENLER[f.fire_nedeni]?.label || esc(f.fire_nedeni)}</span>
            <strong class="num" style="min-width:84px">${fmtTL(f.zarar_tl)}</strong>
        </div>`).join('')}</div>`;
}

function meter(s) {
    const scale = Math.max(s.kritik_stok_esigi * 2.5, s.kalan_stok, 1);
    const pct = Math.max(0, Math.min(100, s.kalan_stok / scale * 100));
    const mark = s.kritik_stok_esigi / scale * 100;
    const cls = s.durum === 'TUKENDI' ? 'red' : s.durum === 'KRITIK' ? 'amber' : '';
    return `<div class="meter"><div class="meter-track"><div class="meter-fill ${cls}" style="width:${pct}%"></div><div class="meter-mark" style="left:${mark}%" title="Kritik eşik"></div></div></div>`;
}

// =====================================================================
// SAYFA: FİRE KAYITLARI
// =====================================================================
function renderFire(root) {
    const ps = state.fire;
    const base = inPeriod(byIsletme(state.data.fireler), 'kayit_tarihi');
    let rows = base;
    if (ps.neden !== 'all') rows = rows.filter(f => f.fire_nedeni === ps.neden);
    if (ps.q) { const q = norm(ps.q); rows = rows.filter(f => norm(`${f.urun_adi} ${f.isletme_adi} ${f.aciklama} ${f.kategori_adi}`).includes(q)); }
    rows = sortRows(rows, ps.sort);

    root.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <label class="search">${icon('search')}<input type="search" id="fq" placeholder="Ürün, şube veya açıklama ara…" value="${esc(ps.q)}"></label>
                <select id="fn" aria-label="Fire nedeni"><option value="all">Tüm nedenler</option>${Object.entries(NEDENLER).map(([k, n]) => `<option value="${k}" ${ps.neden === k ? 'selected' : ''}>${n.label}</option>`).join('')}</select>
                ${periodControl()}
                <span class="spacer"></span>
                <button class="btn btn-secondary" id="fire-csv" ${rows.length ? '' : 'disabled'}>${icon('download')}CSV</button>
                <button class="btn btn-primary" id="fire-add">${icon('plus')}Yeni kayıt</button>
            </div>
            ${rows.length ? `<div class="table-wrap"><table>
                <thead><tr>
                    ${th('Tarih', 'kayit_tarihi', ps.sort)}${th('Şube', 'isletme_adi', ps.sort)}${th('Ürün', 'urun_adi', ps.sort)}
                    ${th('Miktar', 'fire_miktari', ps.sort, 'num')}${th('Neden', 'fire_nedeni', ps.sort)}<th>Açıklama</th>${th('Zarar', 'zarar_tl', ps.sort, 'num')}<th></th>
                </tr></thead>
                <tbody>${rows.map(f => `<tr>
                    <td class="muted" style="white-space:nowrap">${dtf.format(new Date(f.kayit_tarihi))}</td>
                    <td>${esc(f.isletme_adi)}</td>
                    <td><div class="cell-main">${esc(f.urun_adi)}</div><div class="cell-sub">${esc(f.kategori_adi)}</div></td>
                    <td class="num">${fmtNum(f.fire_miktari)} <span class="faint">${esc(f.birim)}</span></td>
                    <td><span class="badge ${NEDENLER[f.fire_nedeni]?.badge || 'gray'}">${NEDENLER[f.fire_nedeni]?.label || esc(f.fire_nedeni)}</span></td>
                    <td class="muted wrap">${esc(f.aciklama || '—')}</td>
                    <td class="num"><strong>${fmtTL(f.zarar_tl)}</strong></td>
                    <td class="actions"><button class="icon-btn plain danger" data-del-fire="${f.id}" aria-label="Sil" title="Sil">${icon('trash')}</button></td>
                </tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="6">${rows.length} kayıt</td><td class="num">${fmtTL(sum(rows, 'zarar_tl'))}</td><td></td></tr></tfoot>
            </table></div>` : emptyState('trash', base.length ? 'Sonuç bulunamadı' : 'Bu dönemde fire kaydı yok',
                base.length ? 'Arama veya filtreyi değiştirmeyi deneyin.' : 'Yeni bir kayıt oluşturarak başlayın.')}
        </div>`;

    const fq = $('#fq', root);
    fq.addEventListener('input', () => { ps.q = fq.value; renderFire(root); const n = $('#fq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    $('#fn', root).addEventListener('change', e => { ps.neden = e.target.value; renderFire(root); });
    $('#fire-add', root).addEventListener('click', () => openFireModal());
    $('#fire-csv', root).addEventListener('click', () => exportCSV('fire-kayitlari', rows, [
        ['Tarih', f => new Date(f.kayit_tarihi).toLocaleString('tr-TR')], ['Şube', 'isletme_adi'], ['Ürün', 'urun_adi'], ['Kategori', 'kategori_adi'],
        ['Miktar', 'fire_miktari'], ['Birim', 'birim'], ['Neden', f => NEDENLER[f.fire_nedeni]?.label], ['Açıklama', 'aciklama'],
        ['Birim maliyet', 'birim_maliyet'], ['Zarar (TL)', 'zarar_tl']]));
    bindPeriod(root);
    bindSort(root, ps, () => renderFire(root));
}

// =====================================================================
// SAYFA: STOK DURUMU
// =====================================================================
function renderStok(root) {
    const ps = state.stok;
    const base = byIsletme(state.data.stok);
    const counts = { all: base.length, TUKENDI: 0, KRITIK: 0, YETERLI: 0 };
    base.forEach(s => counts[s.durum]++);
    let rows = ps.durum === 'all' ? base : base.filter(s => s.durum === ps.durum);
    if (ps.q) { const q = norm(ps.q); rows = rows.filter(s => norm(`${s.urun_adi} ${s.isletme_adi} ${s.kategori_adi}`).includes(q)); }
    const order = { TUKENDI: 0, KRITIK: 1, YETERLI: 2 };
    rows = sortRows(rows, ps.sort, { durum: s => order[s.durum] * 1e6 + s.kalan_stok / (s.kritik_stok_esigi || 1) });

    const chip = (k, l) => `<button class="chip ${ps.durum === k ? 'active' : ''}" data-durum="${k}">${l}<span class="c">${counts[k]}</span></button>`;
    root.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <div class="chips">${chip('all', 'Tümü')}${chip('TUKENDI', 'Tükendi')}${chip('KRITIK', 'Kritik')}${chip('YETERLI', 'Yeterli')}</div>
                <label class="search">${icon('search')}<input type="search" id="sq" placeholder="Ürün veya şube ara…" value="${esc(ps.q)}"></label>
                <span class="spacer"></span>
                <button class="btn btn-primary" id="stok-add">${icon('plus')}Stok hareketi</button>
            </div>
            ${rows.length ? `<div class="table-wrap"><table>
                <thead><tr>
                    ${th('Ürün', 'urun_adi', ps.sort)}${th('Şube', 'isletme_adi', ps.sort)}${th('Mevcut', 'kalan_stok', ps.sort, 'num')}
                    <th>Seviye</th>${th('Eşik', 'kritik_stok_esigi', ps.sort, 'num')}${th('Toplam fire', 'toplam_fire', ps.sort, 'num')}${th('Stok değeri', 'stok_degeri_tl', ps.sort, 'num')}${th('Durum', 'durum', ps.sort)}<th></th>
                </tr></thead>
                <tbody>${rows.map(s => `<tr>
                    <td><div class="cell-main">${esc(s.urun_adi)}</div><div class="cell-sub">${esc(s.kategori_adi)}</div></td>
                    <td>${esc(s.isletme_adi)}</td>
                    <td class="num"><strong>${fmtNum(s.kalan_stok)}</strong> <span class="faint">${esc(s.birim)}</span></td>
                    <td style="min-width:150px">${meter(s)}</td>
                    <td class="num muted">${fmtNum(s.kritik_stok_esigi)}</td>
                    <td class="num muted">${fmtNum(s.toplam_fire)}</td>
                    <td class="num">${fmtTL(s.stok_degeri_tl)}</td>
                    <td><span class="badge ${DURUMLAR[s.durum].badge}">${DURUMLAR[s.durum].label}</span></td>
                    <td class="actions"><button class="btn btn-sm btn-ghost" data-restock="${s.isletme_id}:${s.urun_id}">${icon('plus')}Giriş</button></td>
                </tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="6">${rows.length} kalem</td><td class="num">${fmtTL(sum(rows, 'stok_degeri_tl'))}</td><td colspan="2"></td></tr></tfoot>
            </table></div>` : emptyState('box', base.length ? 'Sonuç bulunamadı' : 'Stok kaydı yok',
                base.length ? 'Filtreyi değiştirmeyi deneyin.' : 'Stok hareketleri sayfasından mal girişi yapın.')}
        </div>`;

    $$('[data-durum]', root).forEach(b => b.addEventListener('click', () => { ps.durum = b.dataset.durum; renderStok(root); }));
    const sq = $('#sq', root);
    sq.addEventListener('input', () => { ps.q = sq.value; renderStok(root); const n = $('#sq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    $('#stok-add', root).addEventListener('click', () => openHareketModal());
    bindSort(root, ps, () => renderStok(root));
}

// =====================================================================
// SAYFA: STOK HAREKETLERİ
// =====================================================================
function renderHareket(root) {
    const ps = state.hareket;
    const base = inPeriod(byIsletme(state.data.hareketler), 'islem_tarihi');
    const counts = { all: base.length, GIRIS: 0, SATIS: 0, TUKETIM: 0 };
    base.forEach(h => counts[h.hareket_tipi]++);
    let rows = ps.tip === 'all' ? base : base.filter(h => h.hareket_tipi === ps.tip);
    if (ps.q) { const q = norm(ps.q); rows = rows.filter(h => norm(`${h.urun_adi} ${h.isletme_adi} ${h.aciklama}`).includes(q)); }
    rows = sortRows(rows, ps.sort);

    const chip = (k, l) => `<button class="chip ${ps.tip === k ? 'active' : ''}" data-tip="${k}">${l}<span class="c">${counts[k]}</span></button>`;
    root.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <div class="chips">${chip('all', 'Tümü')}${chip('GIRIS', 'Giriş')}${chip('SATIS', 'Satış')}${chip('TUKETIM', 'Tüketim')}</div>
                <label class="search">${icon('search')}<input type="search" id="hq" placeholder="Ürün veya şube ara…" value="${esc(ps.q)}"></label>
                ${periodControl()}
                <span class="spacer"></span>
                <button class="btn btn-secondary" id="har-csv" ${rows.length ? '' : 'disabled'}>${icon('download')}CSV</button>
                <button class="btn btn-primary" id="har-add">${icon('plus')}Hareket ekle</button>
            </div>
            ${rows.length ? `<div class="table-wrap"><table>
                <thead><tr>
                    ${th('Tarih', 'islem_tarihi', ps.sort)}${th('Şube', 'isletme_adi', ps.sort)}${th('Ürün', 'urun_adi', ps.sort)}${th('Tip', 'hareket_tipi', ps.sort)}
                    ${th('Miktar', 'miktar', ps.sort, 'num')}${th('Tutar', 'tutar_tl', ps.sort, 'num')}<th>Açıklama</th><th></th>
                </tr></thead>
                <tbody>${rows.map(h => `<tr>
                    <td class="muted" style="white-space:nowrap">${dtf.format(new Date(h.islem_tarihi))}</td>
                    <td>${esc(h.isletme_adi)}</td>
                    <td class="cell-main">${esc(h.urun_adi)}</td>
                    <td><span class="badge ${HAREKETLER[h.hareket_tipi].badge}">${HAREKETLER[h.hareket_tipi].label}</span></td>
                    <td class="num">${h.hareket_tipi === 'GIRIS' ? '+' : '−'}${fmtNum(h.miktar)} <span class="faint">${esc(h.birim)}</span></td>
                    <td class="num">${fmtTL(h.tutar_tl)}</td>
                    <td class="muted wrap">${esc(h.aciklama || '—')}</td>
                    <td class="actions"><button class="icon-btn plain danger" data-del-har="${h.id}" aria-label="Sil" title="Sil">${icon('trash')}</button></td>
                </tr>`).join('')}</tbody>
            </table></div>
            <div class="table-foot"><span>${rows.length} hareket</span><span>Giriş: <strong>${fmtTL(sum(rows.filter(h => h.hareket_tipi === 'GIRIS'), 'tutar_tl'))}</strong> · Çıkış: <strong>${fmtTL(sum(rows.filter(h => h.hareket_tipi !== 'GIRIS'), 'tutar_tl'))}</strong></span></div>`
            : emptyState('swap', base.length ? 'Sonuç bulunamadı' : 'Bu dönemde hareket yok', base.length ? 'Filtreyi değiştirmeyi deneyin.' : 'İlk stok girişini yapın.')}
        </div>`;

    $$('[data-tip]', root).forEach(b => b.addEventListener('click', () => { ps.tip = b.dataset.tip; renderHareket(root); }));
    const hq = $('#hq', root);
    hq.addEventListener('input', () => { ps.q = hq.value; renderHareket(root); const n = $('#hq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    $('#har-add', root).addEventListener('click', () => openHareketModal());
    $('#har-csv', root).addEventListener('click', () => exportCSV('stok-hareketleri', rows, [
        ['Tarih', h => new Date(h.islem_tarihi).toLocaleString('tr-TR')], ['Şube', 'isletme_adi'], ['Ürün', 'urun_adi'],
        ['Tip', h => HAREKETLER[h.hareket_tipi].label], ['Miktar', 'miktar'], ['Birim', 'birim'], ['Tutar (TL)', 'tutar_tl'], ['Açıklama', 'aciklama']]));
    bindPeriod(root);
    bindSort(root, ps, () => renderHareket(root));
}

// =====================================================================
// SAYFA: ÜRÜNLER
// =====================================================================
function renderUrun(root) {
    const ps = state.urun;
    const d = state.data;
    const stok = byIsletme(d.stok), fire = byIsletme(d.fireler);
    let rows = d.urunler.map(u => ({
        ...u,
        stok: sum(stok.filter(s => s.urun_id === u.id), 'kalan_stok'),
        fire: sum(fire.filter(f => f.urun_id === u.id), 'zarar_tl')
    }));
    if (ps.q) { const q = norm(ps.q); rows = rows.filter(u => norm(`${u.urun_adi} ${u.kategori_adi}`).includes(q)); }
    rows = sortRows(rows, ps.sort);

    root.innerHTML = `
        <div class="card">
            <div class="toolbar">
                <label class="search">${icon('search')}<input type="search" id="uq" placeholder="Ürün veya kategori ara…" value="${esc(ps.q)}"></label>
                <span class="spacer"></span>
                <button class="btn btn-primary" id="urun-add">${icon('plus')}Yeni ürün</button>
            </div>
            ${rows.length ? `<div class="table-wrap"><table>
                <thead><tr>
                    ${th('Ürün', 'urun_adi', ps.sort)}${th('Kategori', 'kategori_adi', ps.sort)}${th('Birim', 'birim', ps.sort)}
                    ${th('Birim maliyet', 'birim_maliyet', ps.sort, 'num')}${th('Kritik eşik', 'kritik_stok_esigi', ps.sort, 'num')}
                    ${th(state.isletme === 'all' ? 'Toplam stok' : 'Şube stoğu', 'stok', ps.sort, 'num')}${th('Toplam fire zararı', 'fire', ps.sort, 'num')}<th></th>
                </tr></thead>
                <tbody>${rows.map(u => `<tr>
                    <td class="cell-main">${esc(u.urun_adi)}</td>
                    <td><span class="badge gray plain">${esc(u.kategori_adi)}</span></td>
                    <td class="muted">${esc(u.birim)}</td>
                    <td class="num">${fmtTL(u.birim_maliyet)}</td>
                    <td class="num muted">${fmtNum(u.kritik_stok_esigi)}</td>
                    <td class="num">${fmtNum(u.stok)}</td>
                    <td class="num">${u.fire ? fmtTL(u.fire) : '<span class="faint">—</span>'}</td>
                    <td class="actions"><button class="icon-btn plain" data-edit-urun="${u.id}" aria-label="Düzenle" title="Düzenle">${icon('edit')}</button></td>
                </tr>`).join('')}</tbody>
            </table></div>
            <div class="table-foot"><span>${rows.length} ürün</span></div>`
            : emptyState('tag', 'Ürün bulunamadı', ps.q ? 'Aramayı değiştirmeyi deneyin.' : 'İlk ürününüzü ekleyin.')}
        </div>`;

    const uq = $('#uq', root);
    uq.addEventListener('input', () => { ps.q = uq.value; renderUrun(root); const n = $('#uq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    $('#urun-add', root).addEventListener('click', () => openUrunModal());
    bindSort(root, ps, () => renderUrun(root));
}

// =====================================================================
// CSV
// =====================================================================
function exportCSV(name, rows, cols) {
    const cell = v => { const s = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [cols.map(c => cell(c[0])).join(';')].concat(rows.map(r => cols.map(([, f]) => {
        const v = typeof f === 'function' ? f(r) : r[f];
        return cell(typeof v === 'number' ? String(v).replace('.', ',') : v);
    }).join(';')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${dayKey(Date.now())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// =====================================================================
// FORMLAR
// =====================================================================
function fillSelect(sel, items, placeholder, value) {
    sel.innerHTML = `<option value="" disabled ${value ? '' : 'selected'}>${placeholder}</option>` +
        items.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    if (value) sel.value = String(value);
}
const isletmeOpts = () => state.data.isletmeler.map(i => [i.id, i.ad]);
const urunOpts = () => state.data.urunler.map(u => [u.id, u.urun_adi]);
const stokOf = (i, u) => state.data.stok.find(s => String(s.isletme_id) === String(i) && String(s.urun_id) === String(u));
const urunOf = id => state.data.urunler.find(u => String(u.id) === String(id));

function readNum(input) {
    const v = parseFloat(String(input.value).replace(',', '.'));
    return Number.isFinite(v) ? v : NaN;
}
function validate(form) {
    let ok = true;
    $$('[required]', form).forEach(el => {
        const bad = !el.value.trim() || (el.type === 'number' && !(readNum(el) >= Number(el.min || 0)));
        el.classList.toggle('invalid', bad);
        if (bad) ok = false;
    });
    if (!ok) $('.invalid', form)?.focus();
    return ok;
}
async function submitWith(form, fn) {
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    try { await fn(); return true; }
    catch (e) { toast(e.message, 'error'); return false; }
    finally { btn.disabled = false; }
}
function defaultIsletme() { return state.isletme !== 'all' ? state.isletme : ''; }

// ----- Fire -----
function openFireModal(preset = {}) {
    if (!state.data) return;
    const f = $('#fire-form');
    f.reset();
    $$('.invalid', f).forEach(el => el.classList.remove('invalid'));
    fillSelect($('#f-isletme'), isletmeOpts(), 'Şube seçin…', preset.isletme_id || defaultIsletme());
    fillSelect($('#f-urun'), urunOpts(), 'Ürün seçin…', preset.urun_id);
    fillSelect($('#f-neden'), Object.entries(NEDENLER).map(([k, n]) => [k, n.label]), 'Neden seçin…');
    updateFireHint();
    $('#fire-modal').showModal();
    (preset.urun_id ? $('#f-miktar') : $('#f-isletme').value ? $('#f-urun') : $('#f-isletme')).focus();
}
function updateFireHint() {
    const i = $('#f-isletme').value, u = $('#f-urun').value, m = readNum($('#f-miktar'));
    const urun = urunOf(u);
    $('#f-birim').textContent = urun ? `(${urun.birim})` : '';
    if (!i || !urun) { $('#f-hint').innerHTML = ''; return; }
    const s = stokOf(i, u);
    const mevcut = s ? s.kalan_stok : 0;
    const asim = m > mevcut;
    $('#f-hint').innerHTML = `
        <div class="row"><span>Mevcut stok</span><strong>${fmtNum(mevcut)} ${esc(urun.birim)}</strong></div>
        <div class="row"><span>Birim maliyet</span><strong>${fmtTL(urun.birim_maliyet)}</strong></div>
        ${m > 0 ? `<div class="row"><span>Tahmini zarar</span><strong>${fmtTL(m * urun.birim_maliyet)}</strong></div>` : ''}
        ${asim ? `<div class="row warn">Girilen miktar mevcut stoktan fazla — kayıt reddedilecek.</div>` : ''}`;
}

// ----- Hareket -----
function openHareketModal(preset = {}) {
    if (!state.data) return;
    const f = $('#hareket-form');
    f.reset();
    $$('.invalid', f).forEach(el => el.classList.remove('invalid'));
    fillSelect($('#h-isletme'), isletmeOpts(), 'Şube seçin…', preset.isletme_id || defaultIsletme());
    fillSelect($('#h-urun'), urunOpts(), 'Ürün seçin…', preset.urun_id);
    if (preset.tip) $(`input[name="hareket_tipi"][value="${preset.tip}"]`, f).checked = true;
    updateHareketHint();
    $('#hareket-modal').showModal();
    (preset.urun_id ? $('#h-miktar') : $('#h-isletme').value ? $('#h-urun') : $('#h-isletme')).focus();
}
function updateHareketHint() {
    const f = $('#hareket-form');
    const i = $('#h-isletme').value, u = $('#h-urun').value, m = readNum($('#h-miktar'));
    const tip = $('input[name="hareket_tipi"]:checked', f).value;
    const urun = urunOf(u);
    $('#h-birim').textContent = urun ? `(${urun.birim})` : '';
    if (!i || !urun) { $('#h-hint').innerHTML = ''; return; }
    const s = stokOf(i, u);
    const mevcut = s ? s.kalan_stok : 0;
    const sonra = m > 0 ? (tip === 'GIRIS' ? mevcut + m : mevcut - m) : null;
    $('#h-hint').innerHTML = `
        <div class="row"><span>Mevcut stok</span><strong>${fmtNum(mevcut)} ${esc(urun.birim)}</strong></div>
        ${sonra !== null ? `<div class="row"><span>İşlem sonrası</span><strong>${fmtNum(sonra)} ${esc(urun.birim)}</strong></div>
        <div class="row"><span>Tutar</span><strong>${fmtTL(m * urun.birim_maliyet)}</strong></div>` : ''}
        ${sonra !== null && sonra < 0 ? `<div class="row warn">Stok eksiye düşer — kayıt reddedilecek.</div>` : ''}`;
}

// ----- Ürün -----
function openUrunModal(id) {
    if (!state.data) return;
    const f = $('#urun-form');
    f.reset();
    $$('.invalid', f).forEach(el => el.classList.remove('invalid'));
    state.editingUrun = id || null;
    const u = id ? urunOf(id) : null;
    $('#urun-modal-title').textContent = u ? 'Ürünü Düzenle' : 'Yeni Ürün';
    fillSelect($('#u-kategori'), state.data.kategoriler.map(k => [k.id, k.kategori_adi]), 'Kategori seçin…', u?.kategori_id);
    if (u) {
        $('#u-ad').value = u.urun_adi; $('#u-birim').value = u.birim;
        $('#u-maliyet').value = u.birim_maliyet; $('#u-esik').value = u.kritik_stok_esigi;
    }
    $('#urun-modal').showModal();
    $('#u-ad').focus();
}

// ----- Bağlantı -----
function openConnModal() {
    const cfg = DB.readConfig();
    $('#c-url').value = cfg?.url || '';
    $('#c-key').value = cfg?.key || '';
    $('#conn-error').hidden = true;
    $('#conn-disconnect').hidden = DB.mode === 'demo';
    $('#conn-modal').showModal();
    $('#c-url').focus();
}
window.openConnModal = openConnModal;

// ----- Kenar çubuğu (mobil) -----
function openSidebar() { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); }

// =====================================================================
// OLAYLAR
// =====================================================================
function bindEvents() {
    window.addEventListener('hashchange', setRoute);

    $('#theme-btn').addEventListener('click', () => {
        const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', t);
        try { localStorage.setItem('stockflow-theme', t); } catch (_) {}
    });
    $('#global-isletme').addEventListener('change', e => { state.isletme = e.target.value; savePrefs(); renderShell(); render(); });
    $('#refresh-btn').addEventListener('click', () => reload());
    $('#quick-fire-btn').addEventListener('click', () => openFireModal());
    $('#conn-btn').addEventListener('click', openConnModal);
    $('#menu-btn').addEventListener('click', openSidebar);
    $('#sidebar-close').addEventListener('click', closeSidebar);
    $('#scrim').addEventListener('click', closeSidebar);

    // Kapatma düğmeleri ve dışarı tıklama
    $$('dialog.modal').forEach(dlg => {
        $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
        dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    });

    // Tablolardaki eylemler (olay yetkilendirmesi)
    $('#content').addEventListener('click', async e => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.delFire) {
            const f = state.data.fireler.find(x => String(x.id) === t.dataset.delFire);
            if (!f || !await confirmDialog('Fire kaydı silinsin mi?', `${f.urun_adi} · ${fmtNum(f.fire_miktari)} ${f.birim} · ${f.isletme_adi}. Bu işlem geri alınamaz.`)) return;
            try { await DB.deleteFire(f.id); toast('Fire kaydı silindi'); await reload(); } catch (err) { toast(err.message, 'error'); }
        } else if (t.dataset.delHar) {
            const h = state.data.hareketler.find(x => String(x.id) === t.dataset.delHar);
            if (!h || !await confirmDialog('Hareket silinsin mi?', `${HAREKETLER[h.hareket_tipi].label}: ${h.urun_adi} · ${fmtNum(h.miktar)} ${h.birim} · ${h.isletme_adi}. Bu işlem geri alınamaz.`)) return;
            try { await DB.deleteHareket(h.id); toast('Hareket silindi'); await reload(); } catch (err) { toast(err.message, 'error'); }
        } else if (t.dataset.restock) {
            const [i, u] = t.dataset.restock.split(':');
            openHareketModal({ isletme_id: i, urun_id: u, tip: 'GIRIS' });
        } else if (t.dataset.editUrun) {
            openUrunModal(Number(t.dataset.editUrun));
        }
    });

    // Fire formu
    ['f-isletme', 'f-urun', 'f-miktar'].forEach(id => $('#' + id).addEventListener('input', updateFireHint));
    $('#fire-form').addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target;
        if (!validate(f)) return;
        const rec = {
            isletme_id: Number($('#f-isletme').value),
            urun_id: Number($('#f-urun').value),
            fire_miktari: readNum($('#f-miktar')),
            fire_nedeni: $('#f-neden').value,
            aciklama: $('#f-aciklama').value.trim() || null
        };
        if (await submitWith(f, () => DB.addFire(rec))) {
            $('#fire-modal').close();
            toast(`Fire kaydedildi · ${fmtTL(rec.fire_miktari * urunOf(rec.urun_id).birim_maliyet)} zarar`);
            await reload();
        }
    });

    // Hareket formu
    ['h-isletme', 'h-urun', 'h-miktar'].forEach(id => $('#' + id).addEventListener('input', updateHareketHint));
    $$('input[name="hareket_tipi"]').forEach(r => r.addEventListener('change', updateHareketHint));
    $('#hareket-form').addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target;
        if (!validate(f)) return;
        const rec = {
            isletme_id: Number($('#h-isletme').value),
            urun_id: Number($('#h-urun').value),
            hareket_tipi: $('input[name="hareket_tipi"]:checked', f).value,
            miktar: readNum($('#h-miktar')),
            aciklama: $('#h-aciklama').value.trim() || null
        };
        if (await submitWith(f, () => DB.addHareket(rec))) {
            $('#hareket-modal').close();
            toast(`${HAREKETLER[rec.hareket_tipi].label} kaydedildi`);
            await reload();
        }
    });

    // Ürün formu
    $('#urun-form').addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target;
        if (!validate(f)) return;
        const rec = {
            urun_adi: $('#u-ad').value.trim(),
            kategori_id: Number($('#u-kategori').value),
            birim: $('#u-birim').value.trim(),
            birim_maliyet: readNum($('#u-maliyet')),
            kritik_stok_esigi: readNum($('#u-esik'))
        };
        const id = state.editingUrun;
        if (await submitWith(f, () => DB.saveUrun(rec, id))) {
            $('#urun-modal').close();
            toast(id ? 'Ürün güncellendi' : 'Ürün eklendi');
            await reload();
        }
    });

    // Bağlantı formu
    $('#conn-form').addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target;
        const url = $('#c-url').value.trim(), key = $('#c-key').value.trim();
        const err = $('#conn-error');
        if (!/^https?:\/\/.+/.test(url) || !key) {
            err.textContent = 'Geçerli bir Project URL ve anon key girin.'; err.hidden = false; return;
        }
        if (/service_role/.test(atobSafe(key))) {
            err.textContent = 'Bu bir service_role anahtarı. Tarayıcıda yalnızca anon public anahtarı kullanın.'; err.hidden = false; return;
        }
        const ok = await submitWith(f, async () => {
            try { await DB.connect(url, key); }
            catch (ex) { err.textContent = ex.message; err.hidden = false; throw ex; }
        });
        if (ok) {
            $('#conn-modal').close();
            toast('Supabase bağlantısı kuruldu');
            DB.subscribe(scheduleReload);
            await reload();
        }
    });
    $('#conn-disconnect').addEventListener('click', async () => {
        DB.disconnect();
        $('#conn-modal').close();
        toast('Demo moduna geçildi');
        await reload();
    });

    // Klavye kısayolu: N → yeni fire kaydı
    document.addEventListener('keydown', e => {
        if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey
            && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !$('dialog[open]')) {
            e.preventDefault(); openFireModal();
        }
    });
}
function atobSafe(jwt) {
    try { return atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')); } catch (_) { return ''; }
}

// =====================================================================
// BAŞLAT
// =====================================================================
document.addEventListener('DOMContentLoaded', async () => {
    bindEvents();
    setRoute();
    await DB.init();
    renderConn();
    DB.subscribe(scheduleReload);
    await reload();
});
