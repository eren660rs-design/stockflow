// =====================================================================
// StockFlow — ortak yardımcılar (app.js ve import.js kullanır)
// =====================================================================

const DAY = 86400000;

// ---------- DOM ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const icon = (id, cls = '') => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]);

// ---------- biçimlendirme ----------
const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tl0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const pf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const dtf = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const dfl = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const fmtTL = v => tl.format(v || 0);
const fmtNum = v => nf.format(v || 0);

function relTime(iso) {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'şimdi';
    if (minutes < 60) return `${minutes} dk önce`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} sa önce`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} gün önce`;
    return df.format(new Date(iso));
}

// ---------- veri ----------
const sum = (arr, f) => arr.reduce((a, x) => a + (typeof f === 'function' ? f(x) : x[f]), 0);
const norm = s => String(s ?? '').toLocaleLowerCase('tr');
const sameId = (a, b) => String(a) === String(b);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dayKey = d => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

// ---------- CSV ----------
// Türkçe Excel ile uyumlu: ; ayırıcı, virgüllü ondalık, UTF-8 BOM
function toCSV(rows, cols) {
    const cell = v => {
        const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = cols.map(([label]) => cell(label)).join(';');
    const body = rows.map(r => cols.map(([, f]) => cell(typeof f === 'function' ? f(r) : r[f])).join(';'));
    return [header, ...body].join('\n');
}

function downloadCSV(fileName, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text.replace(/^﻿/, '')], { type: 'text/csv;charset=utf-8' }));
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
