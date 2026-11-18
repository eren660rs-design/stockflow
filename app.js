// =========================================
// 1. SUPABASE İSTEMCİ BAŞLATMA
// =========================================
const SUPABASE_URL = 'https://SENIN-PROJE-ID.supabase.co';
const SUPABASE_KEY = 'SENIN-ANON-PUBLIC-KEY';

// Gerçek anahtarlar girilmediyse arayüzün boş kalmaması için otomatik Demo Modu aktif olur
const isDemoMode = SUPABASE_URL.includes('SENIN-PROJE-ID');
const supabaseClient = !isDemoMode ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Demo Modu Örnek Verileri (Supabase bağlandığında devre dışı kalır)
let mockData = {
    kafeler: [
        { id: 1, ad: 'Tınaztepe Merkez Kafe' },
        { id: 2, ad: 'Mühendislik Kantini' },
        { id: 3, ad: 'Kütüphane Espresso Bar' }
    ],
    urunler: [
        { id: 101, ad: 'Filtre Kahve Çekirdeği (kg)', birim_maliyet: 420 },
        { id: 102, ad: 'Günlük Tam Yağlı Süt (lt)', birim_maliyet: 34 },
        { id: 103, ad: 'Tereyağlı Kruvasan (adet)', birim_maliyet: 45 },
        { id: 104, ad: 'San Sebastian Cheesecake (dilim)', birim_maliyet: 65 }
    ],
    stoklar: [
        { urun_adi: 'Günlük Tam Yağlı Süt (lt)', kafe_adi: 'Tınaztepe Merkez Kafe', miktar: 8, kritik_esik: 15 },
        { urun_adi: 'Filtre Kahve Çekirdeği (kg)', kafe_adi: 'Tınaztepe Merkez Kafe', miktar: 24, kritik_esik: 10 },
        { urun_adi: 'Tereyağlı Kruvasan (adet)', kafe_adi: 'Kütüphane Espresso Bar', miktar: 4, kritik_esik: 12 },
        { urun_adi: 'San Sebastian Cheesecake (dilim)', kafe_adi: 'Mühendislik Kantini', miktar: 18, kritik_esik: 8 }
    ],
    gecmis: [
        { id: 1, tarih: '2026-11-16 11:30', kafe: 'Tınaztepe Merkez Kafe', urun: 'Günlük Tam Yağlı Süt (lt)', miktar: 3, neden: 'Son Kullanma Tarihi' },
        { id: 2, tarih: '2026-11-16 09:15', kafe: 'Kütüphane Espresso Bar', urun: 'Tereyağlı Kruvasan (adet)', miktar: 5, neden: 'Bozulma / Küflenme' }
    ]
};

// =========================================
// 2. SAYFA AÇILIŞ TETİKLEYİCİSİ (DOMContentLoaded)
// =========================================
document.addEventListener('DOMContentLoaded', async () => {
    temaYonetiminiBaslat();
    baglantiDurumunuGuncelle();

    await formSecenekleriniDoldur();
    await tumTablolariGuncelle();

    // Form Gönderim Dinleyicisi
    document.getElementById('fire-form').addEventListener('submit', fireKaydiEkle);
});

// =========================================
// 3. TEMA DEĞİŞTİRİCİ (DARK / LIGHT MODE)
// =========================================
function temaYonetiminiBaslat() {
    const htmlEl = document.documentElement;
    const toggleBtn = document.getElementById('theme-toggle');
    
    // Kayıtlı tema varsa yükle, yoksa koyu (dark) tema ile başla
    const savedTheme = localStorage.getItem('stockflow-theme') || 'dark';
    htmlEl.setAttribute('data-theme', savedTheme);

    toggleBtn.addEventListener('click', () => {
        const currentTheme = htmlEl.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        htmlEl.setAttribute('data-theme', newTheme);
        localStorage.setItem('stockflow-theme', newTheme);
    });
}

function baglantiDurumunuGuncelle() {
    const statusPill = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    if (!isDemoMode) {
        statusPill.classList.remove('demo');
        statusPill.classList.add('live');
        statusText.textContent = 'Supabase Canlı';
    }
}

// =========================================
// 4. FORM SELECT LİSTELERİNİ DOLDURMA
// =========================================
async function formSecenekleriniDoldur() {
    const kafeSelect = document.getElementById('kafe-secimi');
    const urunSelect = document.getElementById('urun-secimi');

    let kafeler = [];
    let urunler = [];

    if (isDemoMode) {
        kafeler = mockData.kafeler;
        urunler = mockData.urunler;
    } else {
        const { data: kafeData } = await supabaseClient.from('kafeler').select('id, ad');
        const { data: urunData } = await supabaseClient.from('urunler').select('id, ad');
        kafeler = kafeData || [];
        urunler = urunData || [];
    }

    document.getElementById('kpi-kafe-sayi').textContent = `${kafeler.length} Nokta`;

    kafeler.forEach(kafe => {
        const opt = document.createElement('option');
        opt.value = kafe.id;
        opt.textContent = kafe.ad;
        kafeSelect.appendChild(opt);
    });

    urunler.forEach(urun => {
        const opt = document.createElement('option');
        opt.value = urun.id;
        opt.textContent = urun.ad;
        urunSelect.appendChild(opt);
    });
}

// =========================================
// 5. VIEW VE TABLOLARI VERİTABANINDAN OKUMA
// =========================================
async function tumTablolariGuncelle() {
    await fireMaliyetRaporunuYukle();
    await stokTablosunuYukle();
    await gecmisKayitlariYukle();
}

// View'dan Rapor Okuma (.from('v_urun_fire_maliyeti').select('*'))
async function fireMaliyetRaporunuYukle() {
    const tbody = document.getElementById('rapor-tablosu');
    tbody.innerHTML = '';
    let raporVerisi = [];

    if (isDemoMode) {
        // Demo modunda geçmiş kayıtlardan dinamik özet üret
        raporVerisi = mockData.urunler.map(u => {
            const toplamMiktar = mockData.gecmis
                .filter(g => g.urun === u.ad)
                .reduce((acc, item) => acc + Number(item.miktar), 0);
            return {
                urun_adi: u.ad,
                toplam_fire_miktari: toplamMiktar,
                birim_maliyet: u.birim_maliyet,
                toplam_zarar: toplamMiktar * u.birim_maliyet
            };
        }).filter(r => r.toplam_fire_miktari > 0);
    } else {
        const { data, error } = await supabaseClient
            .from('v_urun_fire_maliyeti')
            .select('*');
        if (!error && data) raporVerisi = data;
    }

    let genelToplamZarar = 0;

    raporVerisi.forEach(satir => {
        const zarar = Number(satir.toplam_zarar || 0);
        genelToplamZarar += zarar;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${satir.urun_adi}</strong></td>
            <td>${satir.toplam_fire_miktari} birim</td>
            <td>₺${Number(satir.birim_maliyet).toFixed(2)}</td>
            <td class="text-danger"><strong>₺${zarar.toFixed(2)}</strong></td>
            <td><span class="badge ${zarar > 500 ? 'badge-kritik' : 'badge-normal'}">${zarar > 500 ? 'Yüksek Maliyet' : 'Kontrol Altında'}</span></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('kpi-toplam-fire').textContent = `₺${genelToplamZarar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;
}

// Stok Durumu ve Görsel Rozet Sistemi (badge-kritik / badge-normal)
async function stokTablosunuYukle() {
    const tbody = document.getElementById('stok-tablosu');
    tbody.innerHTML = '';
    let stoklar = [];

    if (isDemoMode) {
        stoklar = mockData.stoklar;
    } else {
        const { data, error } = await supabaseClient.from('stoklar').select('*');
        if (!error && data) stoklar = data;
    }

    let kritikSayaci = 0;

    stoklar.forEach(item => {
        const kritikMi = Number(item.miktar) < Number(item.kritik_esik);
        if (kritikMi) kritikSayaci++;

        const badgeSinifi = kritikMi ? 'badge-kritik' : 'badge-normal';
        const badgeMetni = kritikMi ? 'Kritik Stok' : 'Yeterli';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.urun_adi}</strong></td>
            <td>${item.kafe_adi}</td>
            <td><strong>${item.miktar}</strong></td>
            <td>${item.kritik_esik}</td>
            <td><span class="badge ${badgeSinifi}">${badgeMetni}</span></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('kpi-kritik-sayi').textContent = `${kritikSayaci} Ürün`;
}

// Geçmiş Kayıtlar Tablosu
async function gecmisKayitlariYukle() {
    const tbody = document.getElementById('gecmis-tablosu');
    tbody.innerHTML = '';
    let kayitlar = [];

    if (isDemoMode) {
        kayitlar = mockData.gecmis;
    } else {
        const { data, error } = await supabaseClient
            .from('fire_kayitlari')
            .select('id, olusturma_tarihi, miktar, neden, kafeler(ad), urunler(ad)')
            .order('id', { ascending: false });
        
        if (!error && data) {
            kayitlar = data.map(k => ({
                id: k.id,
                tarih: new Date(k.olusturma_tarihi).toLocaleString('tr-TR'),
                kafe: k.kafeler?.ad || '-',
                urun: k.urunler?.ad || '-',
                miktar: k.miktar,
                neden: k.neden
            }));
        }
    }

    kayitlar.forEach(kayit => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${kayit.tarih}</td>
            <td>${kayit.kafe}</td>
            <td><strong>${kayit.urun}</strong></td>
            <td>${kayit.miktar}</td>
            <td>${kayit.neden}</td>
            <td class="text-right">
                <button class="btn-delete" onclick="kayitSil(${kayit.id})">Sil</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =========================================
// 6. FORM GÖNDERİMİ VE VERİ EKLEME (.insert())
// =========================================
async function fireKaydiEkle(e) {
    e.preventDefault(); // Sayfa yenilenmesini engelle

    const kafeId = document.getElementById('kafe-secimi').value;
    const urunId = document.getElementById('urun-secimi').value;
    const miktar = parseFloat(document.getElementById('fire-miktari').value);
    const neden = document.getElementById('fire-nedeni').value;

    if (isDemoMode) {
        const kafeObj = mockData.kafeler.find(k => k.id == kafeId);
        const urunObj = mockData.urunler.find(u => u.id == urunId);

        mockData.gecmis.unshift({
            id: Date.now(),
            tarih: new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }),
            kafe: kafeObj.ad,
            urun: urunObj.ad,
            miktar: miktar,
            neden: neden
        });

        // Stoktan düşümü simüle et
        const stokKalemi = mockData.stoklar.find(s => s.urun_adi === urunObj.ad && s.kafe_adi === kafeObj.ad);
        if (stokKalemi) {
            stokKalemi.miktar = Math.max(0, stokKalemi.miktar - miktar);
        }
    } else {
        const { error } = await supabaseClient
            .from('fire_kayitlari')
            .insert([{
                kafe_id: kafeId,
                urun_id: urunId,
                miktar: miktar,
                neden: neden
            }]);

        if (error) {
            alert('Kayıt eklenirken hata oluştu: ' + error.message);
            return;
        }
    }

    e.target.reset();
    bildirimGoster('Fire kaydı başarıyla eklendi ve tablolar güncellendi.');
    await tumTablolariGuncelle();
}

// =========================================
// 7. KAYIT SİLME İŞLEMİ (.delete().eq())
// =========================================
async function kayitSil(id) {
    const onay = confirm('Bu fire kaydını silmek istediğinize emin misiniz?');
    if (!onay) return;

    if (isDemoMode) {
        mockData.gecmis = mockData.gecmis.filter(item => item.id !== id);
    } else {
        const { error } = await supabaseClient
            .from('fire_kayitlari')
            .delete()
            .eq('id', id);

        if (error) {
            alert('Silme işlemi başarısız: ' + error.message);
            return;
        }
    }

    bildirimGoster('Kayıt sistemden silindi.');
    await tumTablolariGuncelle();
}

function bildirimGoster(mesaj) {
    const toast = document.getElementById('toast');
    toast.textContent = mesaj;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}
