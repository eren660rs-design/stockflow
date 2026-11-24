// =====================================================================
// StockFlow — veri katmanı
// Supabase bağlıysa canlı veritabanını, değilse tarayıcı içi demo
// verisini kullanır. Her iki mod da aynı veri şeklini döndürür.
// =====================================================================
const DB = (() => {
    const LS_KEY = 'stockflow-connection';
    let sb = null;
    let mode = 'demo'; // 'demo' | 'live' | 'error'
    let lastError = null;
    let channel = null;

    // ---------- bağlantı ayarları ----------
    function readConfig() {
        const file = window.STOCKFLOW_CONFIG || {};
        if (file.supabaseUrl && file.supabaseAnonKey) {
            return { url: file.supabaseUrl, key: file.supabaseAnonKey, source: 'file' };
        }
        try {
            const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
            if (saved && saved.url && saved.key) return { ...saved, source: 'browser' };
        } catch (_) { /* depolama kapalı olabilir */ }
        return null;
    }

    function saveConfig(url, key) {
        try { localStorage.setItem(LS_KEY, JSON.stringify({ url, key })); } catch (_) {}
    }

    function clearConfig() {
        try { localStorage.removeItem(LS_KEY); } catch (_) {}
    }

    function makeClient(url, key) {
        if (!window.supabase || !window.supabase.createClient) {
            throw new Error('Supabase kütüphanesi yüklenemedi (internet bağlantısını kontrol edin).');
        }
        return window.supabase.createClient(url.trim(), key.trim(), {
            auth: { persistSession: false }
        });
    }

    async function ping(client) {
        const { error } = await client.from('isletmeler').select('id', { count: 'exact', head: true });
        if (error) throw new Error(friendlyError(error));
    }

    async function init() {
        const cfg = readConfig();
        if (!cfg) { mode = 'demo'; return mode; }
        try {
            sb = makeClient(cfg.url, cfg.key);
            await ping(sb);
            mode = 'live';
            lastError = null;
        } catch (e) {
            sb = null;
            mode = 'error';
            lastError = e.message;
        }
        return mode;
    }

    async function connect(url, key) {
        const client = makeClient(url, key);
        await ping(client);
        saveConfig(url, key);
        unsubscribe();
        sb = client;
        mode = 'live';
        lastError = null;
    }

    function disconnect() {
        clearConfig();
        unsubscribe();
        sb = null;
        mode = 'demo';
        lastError = null;
    }

    function friendlyError(error) {
        const msg = (error && (error.message || error.details)) || String(error);
        if (/Yetersiz stok|silinemez/.test(msg)) return msg;
        if (/relation .* does not exist|Could not find the table/i.test(msg)) {
            return 'Tablolar bulunamadı. Önce sql/01_schema.sql dosyasını Supabase SQL Editor\'da çalıştırın.';
        }
        if (/Invalid API key|JWT/i.test(msg)) return 'API anahtarı geçersiz.';
        if (/Failed to fetch|NetworkError/i.test(msg)) return 'Supabase adresine ulaşılamadı.';
        if (/row-level security/i.test(msg)) return 'Bu işlem için RLS politikası yok (sql/01_schema.sql\'i yeniden çalıştırın).';
        return msg;
    }

    async function q(promise) {
        const { data, error } = await promise;
        if (error) throw new Error(friendlyError(error));
        return data;
    }

    // ---------- realtime ----------
    function subscribe(onChange) {
        if (mode !== 'live' || !sb) return;
        unsubscribe();
        channel = sb.channel('stockflow-changes');
        ['fire_kayitlari', 'stok_hareketleri', 'urunler'].forEach(table => {
            channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table));
        });
        channel.subscribe();
    }

    function unsubscribe() {
        if (channel && sb) sb.removeChannel(channel);
        channel = null;
    }

    // =================================================================
    // DEMO VERİSİ (sql/02_seed_data.sql ile aynı)
    // =================================================================
    const demo = (() => {
        const day = 86400000;
        const ago = d => new Date(Date.now() - d * day).toISOString();
        const isletmeler = [
            { id: 1, ad: 'Merkez Kütüphane Kafe', konum: 'A Blok Giriş' },
            { id: 2, ad: 'Mühendislik Kantin & Kafe', konum: 'B Blok Zemin' },
            { id: 3, ad: 'Bahçe Pastane & Kahve', konum: 'Kampüs Meydanı' }
        ];
        const kategoriler = [
            { id: 1, kategori_adi: 'Süt ve Süt Ürünleri' },
            { id: 2, kategori_adi: 'Unlu Mamuller' },
            { id: 3, kategori_adi: 'Tatlı & Pastane' },
            { id: 4, kategori_adi: 'Kahve & İçecek' }
        ];
        const urunler = [
            [1, 1, 'Günlük Tam Yağlı Süt', 'Litre', 38.5, 15],
            [2, 1, 'Laktozsuz Süt', 'Litre', 44, 8],
            [3, 2, 'Tereyağlı Kruvasan', 'Adet', 32, 10],
            [4, 2, 'Peynirli Sandviç', 'Adet', 45, 8],
            [5, 3, 'San Sebastian Cheesecake', 'Dilim', 65, 6],
            [6, 3, 'Tiramisu', 'Porsiyon', 58, 5],
            [7, 4, 'Espresso Çekirdek', 'Kg', 620, 3],
            [8, 4, 'Çilek Püresi', 'Litre', 140, 4],
            [9, 4, 'Yulaf Sütü', 'Litre', 72, 6],
            [10, 2, 'Çikolatalı Muffin', 'Adet', 28, 10]
        ].map(([id, kategori_id, urun_adi, birim, birim_maliyet, kritik_stok_esigi]) =>
            ({ id, kategori_id, urun_adi, birim, birim_maliyet, kritik_stok_esigi }));

        let hid = 0;
        const hareketler = [
            [1, 1, 'GIRIS', 50, 20, 'Haftalık süt teslimatı'], [1, 1, 'GIRIS', 40, 10, 'Haftalık süt teslimatı'],
            [1, 3, 'GIRIS', 40, 14, 'Fırın siparişi'], [1, 3, 'GIRIS', 40, 7, 'Fırın siparişi'],
            [1, 5, 'GIRIS', 20, 12], [1, 7, 'GIRIS', 8, 18, 'Kavurucu teslimatı'], [1, 9, 'GIRIS', 20, 11],
            [2, 1, 'GIRIS', 60, 19, 'Haftalık süt teslimatı'], [2, 1, 'GIRIS', 30, 8, 'Ek sipariş'],
            [2, 2, 'GIRIS', 15, 16], [2, 4, 'GIRIS', 35, 13], [2, 4, 'GIRIS', 30, 5],
            [2, 10, 'GIRIS', 30, 10], [2, 7, 'GIRIS', 5, 17, 'Kavurucu teslimatı'],
            [3, 6, 'GIRIS', 25, 15], [3, 6, 'GIRIS', 15, 4], [3, 5, 'GIRIS', 24, 14], [3, 5, 'GIRIS', 12, 5],
            [3, 8, 'GIRIS', 6, 20], [3, 3, 'GIRIS', 30, 12, 'Fırın siparişi'], [3, 10, 'GIRIS', 25, 9],
            [1, 1, 'TUKETIM', 30, 15], [1, 1, 'TUKETIM', 41, 5], [1, 3, 'SATIS', 30, 10], [1, 3, 'SATIS', 26, 4],
            [1, 5, 'SATIS', 12, 6], [1, 7, 'TUKETIM', 3.5, 8], [1, 9, 'TUKETIM', 9, 4],
            [2, 1, 'TUKETIM', 48, 12], [2, 1, 'TUKETIM', 20, 3], [2, 2, 'TUKETIM', 6, 7],
            [2, 4, 'SATIS', 22, 9], [2, 4, 'SATIS', 20, 2], [2, 10, 'SATIS', 18, 3], [2, 7, 'TUKETIM', 2.5, 6],
            [3, 6, 'SATIS', 15, 10], [3, 6, 'SATIS', 10, 2], [3, 5, 'SATIS', 16, 8], [3, 5, 'SATIS', 9, 1],
            [3, 8, 'TUKETIM', 2, 9], [3, 3, 'SATIS', 24, 6], [3, 10, 'SATIS', 14, 3]
        ].map(([isletme_id, urun_id, hareket_tipi, miktar, d, aciklama]) =>
            ({ id: ++hid, isletme_id, urun_id, hareket_tipi, miktar, islem_tarihi: ago(d), aciklama: aciklama || null }));

        let fid = 0;
        const fireler = [
            [1, 1, 4, 'SKT_GECTI', 'Dolap arkasında kalan kutular', 12],
            [1, 1, 3, 'HAZIRLAMA_HATASI', 'Süt köpürtme sırasında döküldü', 3],
            [1, 3, 7, 'GUN_SONU_KALAN', '19:00 sonrası satılmayan', 9],
            [1, 3, 5, 'GUN_SONU_KALAN', 'Sınav haftası düşük satış', 2],
            [1, 5, 3, 'BOZULMA', 'Vitrin soğutma arızası', 5],
            [1, 7, 0.3, 'HAZIRLAMA_HATASI', 'Değirmen ayarı kaçtı', 6],
            [1, 9, 2, 'SKT_GECTI', null, 1],
            [2, 1, 2, 'HAZIRLAMA_HATASI', 'Barista dökülmesi', 11],
            [2, 2, 3, 'SKT_GECTI', 'Son kullanma tarihi doldu', 2],
            [2, 4, 8, 'GUN_SONU_KALAN', 'Gün sonu bayatlayan sandviçler', 8],
            [2, 4, 4, 'GUN_SONU_KALAN', null, 1],
            [2, 10, 4, 'GUN_SONU_KALAN', null, 2],
            [3, 6, 4, 'BOZULMA', 'Krema bozulması', 9],
            [3, 5, 5, 'GUN_SONU_KALAN', 'Hafta sonu kalan dilimler', 6],
            [3, 8, 1.5, 'SKT_GECTI', 'Açılmış şişe SKT geçti', 3],
            [3, 3, 6, 'GUN_SONU_KALAN', null, 5]
        ].map(([isletme_id, urun_id, fire_miktari, fire_nedeni, aciklama, d]) =>
            ({ id: ++fid, isletme_id, urun_id, fire_miktari, fire_nedeni, aciklama, kayit_tarihi: ago(d) }));

        return { isletmeler, kategoriler, urunler, hareketler, fireler, next: { h: hid, f: fid, u: urunler.length } };
    })();

    const r2 = n => Math.round(n * 100) / 100;

    function demoStok(isletme_id, urun_id) {
        let s = 0;
        demo.hareketler.forEach(h => {
            if (h.isletme_id === isletme_id && h.urun_id === urun_id) s += h.hareket_tipi === 'GIRIS' ? h.miktar : -h.miktar;
        });
        demo.fireler.forEach(f => {
            if (f.isletme_id === isletme_id && f.urun_id === urun_id) s -= f.fire_miktari;
        });
        return r2(s);
    }

    // View'ların JS karşılıkları
    function demoSnapshot() {
        const isl = new Map(demo.isletmeler.map(i => [i.id, i]));
        const kat = new Map(demo.kategoriler.map(k => [k.id, k]));
        const urn = new Map(demo.urunler.map(u => [u.id, u]));

        const urunler = demo.urunler
            .map(u => ({ ...u, kategori_adi: kat.get(u.kategori_id)?.kategori_adi }))
            .sort((a, b) => a.urun_adi.localeCompare(b.urun_adi, 'tr'));

        const fireler = demo.fireler.map(f => {
            const u = urn.get(f.urun_id);
            return {
                ...f,
                isletme_adi: isl.get(f.isletme_id)?.ad,
                urun_adi: u.urun_adi,
                kategori_adi: kat.get(u.kategori_id)?.kategori_adi,
                birim: u.birim,
                birim_maliyet: u.birim_maliyet,
                zarar_tl: r2(f.fire_miktari * u.birim_maliyet)
            };
        }).sort((a, b) => b.kayit_tarihi.localeCompare(a.kayit_tarihi));

        const hareketler = demo.hareketler.map(h => {
            const u = urn.get(h.urun_id);
            return {
                ...h,
                isletme_adi: isl.get(h.isletme_id)?.ad,
                urun_adi: u.urun_adi,
                birim: u.birim,
                tutar_tl: r2(h.miktar * u.birim_maliyet)
            };
        }).sort((a, b) => b.islem_tarihi.localeCompare(a.islem_tarihi));

        const stok = [];
        demo.isletmeler.forEach(i => demo.urunler.forEach(u => {
            const hs = demo.hareketler.filter(h => h.isletme_id === i.id && h.urun_id === u.id);
            const fs = demo.fireler.filter(f => f.isletme_id === i.id && f.urun_id === u.id);
            if (!hs.length && !fs.length) return;
            const giris = r2(hs.filter(h => h.hareket_tipi === 'GIRIS').reduce((a, h) => a + h.miktar, 0));
            const cikis = r2(hs.filter(h => h.hareket_tipi !== 'GIRIS').reduce((a, h) => a + h.miktar, 0));
            const fire = r2(fs.reduce((a, f) => a + f.fire_miktari, 0));
            const kalan = r2(giris - cikis - fire);
            stok.push({
                isletme_id: i.id, isletme_adi: i.ad, urun_id: u.id, urun_adi: u.urun_adi,
                kategori_adi: kat.get(u.kategori_id)?.kategori_adi, birim: u.birim,
                birim_maliyet: u.birim_maliyet, kritik_stok_esigi: u.kritik_stok_esigi,
                toplam_giris: giris, toplam_cikis: cikis, toplam_fire: fire, kalan_stok: kalan,
                stok_degeri_tl: r2(kalan * u.birim_maliyet),
                durum: kalan <= 0 ? 'TUKENDI' : kalan <= u.kritik_stok_esigi ? 'KRITIK' : 'YETERLI'
            });
        }));

        return {
            isletmeler: [...demo.isletmeler],
            kategoriler: [...demo.kategoriler].sort((a, b) => a.kategori_adi.localeCompare(b.kategori_adi, 'tr')),
            urunler, stok, fireler, hareketler
        };
    }

    function demoCheckStock(isletme_id, urun_id, cikis) {
        const mevcut = demoStok(isletme_id, urun_id);
        if (cikis > mevcut + 1e-9) throw new Error(`Yetersiz stok: mevcut ${mevcut}, istenen ${cikis}`);
    }

    // =================================================================
    // GENEL API
    // =================================================================
    const num = rows => rows.map(r => {
        const o = { ...r };
        ['birim_maliyet', 'kritik_stok_esigi', 'toplam_giris', 'toplam_cikis', 'toplam_fire', 'kalan_stok',
         'stok_degeri_tl', 'fire_miktari', 'zarar_tl', 'miktar', 'tutar_tl'].forEach(k => {
            if (o[k] !== undefined && o[k] !== null) o[k] = Number(o[k]);
        });
        return o;
    });

    async function loadAll() {
        if (mode !== 'live') return demoSnapshot();
        const [isletmeler, kategoriler, urunler, stok, fireler, hareketler] = await Promise.all([
            q(sb.from('isletmeler').select('*').order('id')),
            q(sb.from('kategoriler').select('*').order('kategori_adi')),
            q(sb.from('urunler').select('*, kategoriler(kategori_adi)').order('urun_adi')),
            q(sb.from('v_guncel_stok_durumu').select('*')),
            q(sb.from('v_fire_detay').select('*').order('kayit_tarihi', { ascending: false }).limit(5000)),
            q(sb.from('v_hareket_detay').select('*').order('islem_tarihi', { ascending: false }).limit(5000))
        ]);
        return {
            isletmeler, kategoriler,
            urunler: num(urunler.map(u => ({ ...u, kategori_adi: u.kategoriler?.kategori_adi }))),
            stok: num(stok), fireler: num(fireler), hareketler: num(hareketler)
        };
    }

    async function addFire(rec) {
        if (mode !== 'live') {
            demoCheckStock(rec.isletme_id, rec.urun_id, rec.fire_miktari);
            demo.fireler.push({ id: ++demo.next.f, ...rec, kayit_tarihi: new Date().toISOString() });
            return;
        }
        await q(sb.from('fire_kayitlari').insert(rec));
    }

    async function deleteFire(id) {
        if (mode !== 'live') {
            demo.fireler = demo.fireler.filter(f => f.id !== id);
            return;
        }
        await q(sb.from('fire_kayitlari').delete().eq('id', id));
    }

    async function addHareket(rec) {
        if (mode !== 'live') {
            if (rec.hareket_tipi !== 'GIRIS') demoCheckStock(rec.isletme_id, rec.urun_id, rec.miktar);
            demo.hareketler.push({ id: ++demo.next.h, ...rec, islem_tarihi: new Date().toISOString() });
            return;
        }
        await q(sb.from('stok_hareketleri').insert(rec));
    }

    async function deleteHareket(id) {
        if (mode !== 'live') {
            const h = demo.hareketler.find(x => x.id === id);
            if (h && h.hareket_tipi === 'GIRIS' && demoStok(h.isletme_id, h.urun_id) - h.miktar < -1e-9) {
                throw new Error(`Bu giriş silinemez: stok eksiye düşer (mevcut ${demoStok(h.isletme_id, h.urun_id)})`);
            }
            demo.hareketler = demo.hareketler.filter(x => x.id !== id);
            return;
        }
        await q(sb.from('stok_hareketleri').delete().eq('id', id));
    }

    async function saveUrun(rec, id) {
        if (mode !== 'live') {
            if (id) Object.assign(demo.urunler.find(u => u.id === id), rec);
            else demo.urunler.push({ id: ++demo.next.u, ...rec });
            return;
        }
        if (id) await q(sb.from('urunler').update(rec).eq('id', id));
        else await q(sb.from('urunler').insert(rec));
    }

    return {
        init, connect, disconnect, subscribe, readConfig,
        get mode() { return mode; },
        get lastError() { return lastError; },
        loadAll, addFire, deleteFire, addHareket, deleteHareket, saveUrun
    };
})();
