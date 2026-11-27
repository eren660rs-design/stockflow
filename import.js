// =====================================================================
// StockFlow — Excel / CSV ürün içe aktarma
// Excel dosyası önce CSV'ye dönüştürülür, ardından CSV satırları
// ayrıştırılıp sütunlar eşlenir, doğrulanır ve önizlenir.
// =====================================================================
const Importer = (() => {
    const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    const MAX_BYTES = 5 * 1024 * 1024;
    const PREVIEW_LIMIT = 200;

    // Hedef alanlar ve tanınan başlık adları
    const FIELDS = [
        { key: 'urun_adi',          label: 'Ürün adı',      required: true,  aliases: ['ürün adı', 'ürün', 'urun adi', 'urun', 'urun_adi', 'ad', 'adı', 'isim', 'malzeme', 'stok adı', 'product', 'name', 'item'] },
        { key: 'kategori_adi',      label: 'Kategori',      required: false, aliases: ['kategori', 'kategori adı', 'kategori_adi', 'grup', 'ürün grubu', 'category', 'group'] },
        { key: 'birim',             label: 'Birim',         required: false, aliases: ['birim', 'ölçü birimi', 'olcu birimi', 'ölçü', 'unit', 'uom'] },
        { key: 'birim_maliyet',     label: 'Birim maliyet', required: true,  aliases: ['birim maliyet', 'birim_maliyet', 'maliyet', 'birim fiyat', 'alış fiyatı', 'alis fiyati', 'fiyat', 'cost', 'unit cost', 'price'] },
        { key: 'kritik_stok_esigi', label: 'Kritik eşik',   required: false, aliases: ['kritik eşik', 'kritik stok eşiği', 'kritik_stok_esigi', 'kritik stok', 'eşik', 'esik', 'minimum stok', 'min stok', 'min', 'reorder level'] },
        { key: 'sube',              label: 'Şube',          required: false, aliases: ['şube', 'sube', 'işletme', 'isletme', 'kafe', 'mağaza', 'branch', 'store'] },
        { key: 'stok',              label: 'Stok',          required: false, aliases: ['stok', 'stok miktarı', 'başlangıç stoğu', 'mevcut stok', 'miktar', 'adet', 'quantity', 'qty', 'stock'] }
    ];
    const DEFAULTS = { kategori_adi: 'Genel', birim: 'Adet', kritik_stok_esigi: 5 };

    let sheets = [];      // [{ name, csv }]
    let fileName = '';
    let headers = [];
    let rows = [];        // ham satırlar (string dizileri)
    let mapping = {};     // alan → sütun indeksi (-1 = yok)
    let planned = [];     // doğrulanmış satırlar
    let rawNumbers = false; // Excel'den gelen ham sayılar: nokta her zaman ondalıktır

    // Başlık ve isim karşılaştırması: büyük/küçük harf, _ - . : ve fazla boşluk yok sayılır
    const normKey = s => norm(s).replace(/[_\-.:]+/g, ' ').replace(/\s+/g, ' ').trim();

    // ---------- yardımcılar ----------
    function loadXLSX() {
        if (window.XLSX) return Promise.resolve();
        return new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = XLSX_URL;
            s.onload = () => res();
            s.onerror = () => rej(new Error('Excel okuyucu yüklenemedi (internet bağlantısını kontrol edin).'));
            document.head.appendChild(s);
        });
    }

    // RFC 4180 CSV ayrıştırıcı; ayırıcı (; , sekme) otomatik bulunur
    function parseCSV(text) {
        text = text.replace(/^﻿/, '');
        const first = text.split(/\r?\n/).find(l => l.trim()) || '';
        const delim = [';', '\t', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
        const out = [];
        let row = [], cell = '', quoted = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quoted) {
                if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
                else cell += c;
            } else if (c === '"' && cell === '') quoted = true;
            else if (c === delim) { row.push(cell); cell = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(cell); out.push(row); row = []; cell = '';
            } else cell += c;
        }
        if (cell !== '' || row.length) { row.push(cell); out.push(row); }
        return out.map(r => r.map(v => v.trim())).filter(r => r.some(v => v !== ''));
    }

    // "1.234,50", "38,5", "₺38.50", "38.5 TL" → sayı
    function parseNum(v, dotIsDecimal = false) {
        if (v === null || v === undefined) return NaN;
        let s = String(v).replace(/[₺\s]|TL|TRY/gi, '');
        if (!s) return NaN;
        const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
        if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
        else if (lc > -1) s = s.replace(/\./g, '').replace(',', '.');
        else if (!dotIsDecimal && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
    }

    function guessMapping() {
        const used = new Set();
        mapping = {};
        const hs = headers.map(norm);
        FIELDS.forEach(f => {
            let idx = hs.findIndex((h, i) => !used.has(i) && f.aliases.includes(h));
            if (idx < 0) idx = hs.findIndex((h, i) => !used.has(i) && h && f.aliases.some(a => a.length > 3 && h.includes(a)));
            mapping[f.key] = idx;
            if (idx >= 0) used.add(idx);
        });
    }

    // ---------- dosya okuma ----------
    async function readFile(file) {
        if (file.size > MAX_BYTES) throw new Error('Dosya 5 MB sınırını aşıyor.');
        fileName = file.name;
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv' || ext === 'txt') {
            const buf = await file.arrayBuffer();
            let text = new TextDecoder('utf-8').decode(buf);
            if (text.includes('�')) text = new TextDecoder('windows-1254').decode(buf); // Türkçe Excel CSV'si
            sheets = [{ name: 'CSV', csv: text, raw: false }];
        } else if (ext === 'xlsx' || ext === 'xls') {
            await loadXLSX();
            const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
            // Her sayfa CSV'ye dönüştürülür (ham sayılarla, ; ayırıcı)
            sheets = wb.SheetNames.map(name => ({
                name,
                raw: true,
                csv: window.XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: ';', rawNumbers: true, blankrows: false })
            })).filter(s => s.csv.replace(/[;\s]/g, ''));
            if (!sheets.length) throw new Error('Excel dosyasında veri bulunan sayfa yok.');
        } else {
            throw new Error('Desteklenmeyen dosya türü. .xlsx, .xls veya .csv seçin.');
        }
        useSheet(0);
    }

    function useSheet(i) {
        rawNumbers = sheets[i].raw;
        const data = parseCSV(sheets[i].csv);
        if (data.length < 2) throw new Error('Dosyada başlık satırı ve en az bir veri satırı olmalı.');
        headers = data[0].map((h, n) => h || `Sütun ${n + 1}`);
        const w = headers.length;
        rows = data.slice(1).map(r => Array.from({ length: w }, (_, n) => r[n] ?? ''));
        guessMapping();
    }

    // ---------- doğrulama ----------
    function buildPlan() {
        const d = state.data;
        const updateExisting = $('#imp-update').checked;
        const defBranch = $('#imp-branch').value;
        const byName = new Map(d.urunler.map(u => [normKey(u.urun_adi), u]));
        const branches = new Map();
        d.isletmeler.forEach(i => { branches.set(normKey(i.ad), i.id); branches.set(String(i.id), i.id); });
        const seen = new Map();
        const get = (r, k) => mapping[k] >= 0 ? r[mapping[k]] : '';
        const num = v => parseNum(v, rawNumbers);

        planned = rows.map((r, n) => {
            const p = { line: n + 2, errors: [], raw: r };
            p.urun_adi = get(r, 'urun_adi').replace(/\s+/g, ' ').trim();
            p.kategori_adi = get(r, 'kategori_adi').trim() || DEFAULTS.kategori_adi;
            p.birim = get(r, 'birim').trim() || DEFAULTS.birim;
            p.birim_maliyet = num(get(r, 'birim_maliyet'));
            const esikRaw = get(r, 'kritik_stok_esigi');
            p.kritik_stok_esigi = esikRaw === '' ? DEFAULTS.kritik_stok_esigi : num(esikRaw);
            const stokRaw = get(r, 'stok');
            const stok = stokRaw === '' ? 0 : num(stokRaw);
            const subeRaw = get(r, 'sube').trim();

            if (!p.urun_adi) p.errors.push('Ürün adı boş');
            else if (p.urun_adi.length > 120) p.errors.push('Ürün adı 120 karakterden uzun');
            if (!(p.birim_maliyet > 0)) p.errors.push('Birim maliyet 0\'dan büyük bir sayı olmalı');
            if (!(p.kritik_stok_esigi >= 0)) p.errors.push('Kritik eşik geçersiz');
            if (!(stok >= 0)) p.errors.push('Stok geçersiz');

            if (stok > 0) {
                const bid = subeRaw ? branches.get(normKey(subeRaw)) : (defBranch ? Number(defBranch) : null);
                if (subeRaw && !bid) p.errors.push(`"${subeRaw}" adlı şube bulunamadı`);
                else if (!bid) p.errors.push('Stok için şube seçilmedi');
                else p.stok = { isletme_id: bid, miktar: stok };
                p.subeAdi = bid ? d.isletmeler.find(i => i.id === bid)?.ad : subeRaw;
            }

            const key = normKey(p.urun_adi);
            if (p.urun_adi) {
                if (seen.has(key)) p.errors.push(`${seen.get(key)}. satırla aynı ürün`);
                else seen.set(key, p.line);
            }
            const ex = byName.get(key);
            if (ex) p.existingId = ex.id;
            p.status = p.errors.length ? 'error' : ex ? (updateExisting ? 'update' : 'skip') : 'new';
            return p;
        });
    }

    // ---------- çizim ----------
    function renderMapping() {
        const opts = ['<option value="-1">— Kullanma —</option>']
            .concat(headers.map((h, i) => `<option value="${i}">${esc(h)}</option>`)).join('');
        $('#imp-map').innerHTML = FIELDS.map(f => `
            <div class="field">
                <label for="map-${f.key}">${f.label}${f.required ? ' <span class="req">*</span>' : ` <span class="optional">${DEFAULTS[f.key] !== undefined ? 'varsayılan: ' + DEFAULTS[f.key] : 'isteğe bağlı'}</span>`}</label>
                <select id="map-${f.key}" data-field="${f.key}">${opts}</select>
            </div>`).join('');
        FIELDS.forEach(f => {
            const sel = $(`#map-${f.key}`);
            sel.value = String(mapping[f.key]);
            sel.classList.toggle('unmapped', mapping[f.key] < 0);
        });
    }

    function renderPreview() {
        buildPlan();
        const c = { new: 0, update: 0, skip: 0, error: 0, stok: 0 };
        planned.forEach(p => { c[p.status]++; if (p.stok && (p.status === 'new' || p.status === 'update')) c.stok++; });
        const missing = FIELDS.filter(f => f.required && mapping[f.key] < 0).map(f => f.label);
        const ready = c.new + c.update;

        $('#imp-summary').innerHTML = missing.length
            ? `<span class="badge red">Zorunlu sütun eşlenmedi: ${missing.join(', ')}</span>`
            : `<span class="badge green">${c.new} yeni</span><span class="badge blue">${c.update} güncellenecek</span>` +
              (c.skip ? `<span class="badge gray">${c.skip} atlanacak</span>` : '') +
              (c.error ? `<span class="badge red">${c.error} hatalı</span>` : '') +
              (c.stok ? `<span class="badge indigo plain">${c.stok} stok girişi</span>` : '') +
              `<span class="faint" style="font-size:12.5px;align-self:center">${planned.length} satır okundu</span>`;

        const statusBadge = { new: '<span class="badge green">Yeni</span>', update: '<span class="badge blue">Güncelle</span>',
                              skip: '<span class="badge gray">Atla</span>', error: '<span class="badge red">Hata</span>' };
        const order = { error: 0, new: 1, update: 2, skip: 3 };
        const shown = [...planned].sort((a, b) => order[a.status] - order[b.status] || a.line - b.line).slice(0, PREVIEW_LIMIT);
        $('#imp-preview').innerHTML = missing.length ? '' : `<table>
            <thead><tr><th>Satır</th><th>Durum</th><th>Ürün adı</th><th>Kategori</th><th>Birim</th><th class="num">Maliyet</th><th class="num">Eşik</th><th>Stok</th><th>Not</th></tr></thead>
            <tbody>${shown.map(p => `<tr class="row-${p.status}">
                <td class="faint">${p.line}</td>
                <td>${statusBadge[p.status]}</td>
                <td class="cell-main">${esc(p.urun_adi || '—')}</td>
                <td>${esc(p.kategori_adi)}</td>
                <td>${esc(p.birim)}</td>
                <td class="num">${Number.isFinite(p.birim_maliyet) ? fmtTL(p.birim_maliyet) : '—'}</td>
                <td class="num">${Number.isFinite(p.kritik_stok_esigi) ? fmtNum(p.kritik_stok_esigi) : '—'}</td>
                <td>${p.stok ? `${fmtNum(p.stok.miktar)} · ${esc(p.subeAdi)}` : '<span class="faint">—</span>'}</td>
                <td class="err">${esc(p.errors.join(' · '))}</td>
            </tr>`).join('')}</tbody></table>` +
            (planned.length > PREVIEW_LIMIT ? `<div class="imp-more">İlk ${PREVIEW_LIMIT} satır gösteriliyor (hatalılar önce)</div>` : '');

        const btn = $('#imp-submit');
        btn.disabled = !!missing.length || !ready;
        btn.textContent = ready ? `${ready} ürünü içe aktar` : 'İçe aktar';
    }

    function showStep(step) {
        $('#imp-step-file').hidden = step !== 'file';
        $('#imp-step-map').hidden = step !== 'map';
        if (step === 'file') { $('#imp-submit').disabled = true; $('#imp-submit').textContent = 'İçe aktar'; }
    }

    async function handleFile(file) {
        const err = $('#imp-file-error');
        err.hidden = true;
        try {
            await readFile(file);
            $('#imp-file-name').textContent = fileName;
            $('#imp-sheet-wrap').hidden = sheets.length < 2;
            $('#imp-sheet').innerHTML = sheets.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('');
            renderMapping();
            showStep('map');
            renderPreview();
        } catch (e) {
            err.textContent = e.message;
            err.hidden = false;
        }
    }

    // ---------- genel ----------
    function open() {
        if (!state.data) return;
        $('#import-form').reset();
        $('#imp-file').value = '';
        sheets = []; rows = []; planned = [];
        const def = state.isletme !== 'all' ? state.isletme : (state.data.isletmeler[0]?.id ?? '');
        $('#imp-branch').innerHTML = `<option value="">Stok ekleme</option>` +
            state.data.isletmeler.map(i => `<option value="${i.id}">${esc(i.ad)}</option>`).join('');
        $('#imp-branch').value = String(def);
        showStep('file');
        $('#import-modal').showModal();
    }

    function bind() {
        const drop = $('#imp-drop');
        $('#imp-file').addEventListener('change', e => e.target.files[0] && handleFile(e.target.files[0]));
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
        drop.addEventListener('drop', e => e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]));

        $('#imp-template').addEventListener('click', () => {
            const sube = state.data?.isletmeler[0]?.ad || 'Şube adı';
            downloadCSV('stockflow-urun-sablonu.csv', [
                'Ürün adı;Kategori;Birim;Birim maliyet;Kritik eşik;Şube;Stok',
                `Günlük Tam Yağlı Süt;Süt ve Süt Ürünleri;Litre;38,50;15;${sube};40`,
                `Tereyağlı Kruvasan;Unlu Mamuller;Adet;32,00;10;${sube};25`,
                'Espresso Çekirdek;Kahve & İçecek;Kg;620,00;3;;'
            ].join('\n'));
        });
        $('#imp-change').addEventListener('click', () => { $('#imp-file').value = ''; showStep('file'); });
        $('#imp-csv').addEventListener('click', () => {
            const i = Number($('#imp-sheet').value || 0);
            downloadCSV(fileName.replace(/\.[^.]+$/, '') + (sheets.length > 1 ? `-${sheets[i].name}` : '') + '.csv', sheets[i].csv);
        });
        $('#imp-sheet').addEventListener('change', e => {
            try { useSheet(Number(e.target.value)); renderMapping(); renderPreview(); }
            catch (ex) { toast(ex.message, 'error'); }
        });
        $('#imp-map').addEventListener('change', e => {
            const sel = e.target.closest('select[data-field]');
            if (!sel) return;
            mapping[sel.dataset.field] = Number(sel.value);
            sel.classList.toggle('unmapped', sel.value === '-1');
            renderPreview();
        });
        $('#imp-update').addEventListener('change', renderPreview);
        $('#imp-branch').addEventListener('change', renderPreview);

        $('#import-form').addEventListener('submit', async e => {
            e.preventDefault();
            const items = planned.filter(p => p.status === 'new' || p.status === 'update').map(p => ({
                urun_adi: p.urun_adi, kategori_adi: p.kategori_adi, birim: p.birim,
                birim_maliyet: p.birim_maliyet, kritik_stok_esigi: p.kritik_stok_esigi,
                existingId: p.status === 'update' ? p.existingId : undefined,
                stok: p.stok
            }));
            if (!items.length) return;
            const btn = $('#imp-submit');
            btn.disabled = true;
            btn.textContent = 'Aktarılıyor…';
            try {
                const r = await DB.importUrunler(items, `İçe aktarma: ${fileName}`.slice(0, 200));
                $('#import-modal').close();
                const parts = [`${r.eklendi} ürün eklendi`];
                if (r.guncellendi) parts.push(`${r.guncellendi} güncellendi`);
                if (r.kategori) parts.push(`${r.kategori} yeni kategori`);
                if (r.stok) parts.push(`${r.stok} stok girişi`);
                toast(parts.join(' · '));
                await reload();
            } catch (ex) {
                toast(`İçe aktarma tamamlanamadı: ${ex.message}`, 'error');
                await reload({ silent: true });
                renderPreview();
            }
        });
    }

    return { open, bind, parseCSV, parseNum };
})();

document.addEventListener('DOMContentLoaded', () => Importer.bind());
