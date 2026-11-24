# StockFlow

Kampüs kafeleri için stok, fire ve maliyet takip paneli. Supabase (PostgreSQL) üzerinde çalışır. Derleme adımı gerektirmez: düz HTML, CSS ve JavaScript.

## Özellikler

- **Genel Bakış:** fire zararı, mal girişine göre fire oranı, kritik stok sayısı ve stok değeri gibi KPI'lar. Ayrıca günlük fire grafiği, fire nedeni dağılımı, şube karşılaştırması, en çok zarar ettiren ürünler ve kritik stok listesi.
- **Fire Kayıtları:** arama, neden ve dönem filtresi, sıralama, CSV dışa aktarma ve silme.
- **Stok Durumu:** şube × ürün bazında anlık stok, eşik çubuğu ve durum (Tükendi / Kritik / Yeterli). Tek tıkla stok girişi yapılabilir.
- **Stok Hareketleri:** giriş, satış ve tüketim kayıtları.
- **Ürünler:** ürün ekleme ve düzenleme (maliyet, birim, kritik eşik).
- **Şube filtresi:** tüm sayfalarda geçerlidir.
- **Stok koruması:** stoktan fazla satış, tüketim veya fire girişi veritabanı trigger'ı ile reddedilir.
- **Realtime:** başka bir cihazdan girilen kayıt panelde anında görünür.
- Açık/koyu tema, mobil uyumlu arayüz ve `N` kısayolu ile hızlı fire kaydı.

## Kurulum

### 1. Veritabanı

Supabase Dashboard'da **SQL Editor**'ı açın ve dosyaları sırayla çalıştırın:

1. `sql/01_schema.sql`: tablolar, indeksler, stok trigger'ları, view'lar, RLS politikaları ve realtime. Tekrar çalıştırılabilir; mevcut veriyi silmez.
2. `sql/02_seed_data.sql`: örnek veri (isteğe bağlı). **Dikkat:** tabloları boşaltır.

`sql/03_queries.sql` ödev/rapor amaçlı örnek sorgular içerir (JOIN, GROUP BY + HAVING, CASE, alt sorgu, CTE).

### 2. Bağlantı

**Project Settings → API** sayfasından *Project URL* ve *anon public* anahtarını alın. İki yoldan biriyle bağlanın:

- `config.js` dosyasına yazın (kalıcı), ya da
- paneli açıp sol alttaki **Bağlantı** kutusuna tıklayın ve değerleri girin. Ayar o tarayıcıda saklanır.

> `service_role` anahtarını asla tarayıcıya veya `config.js`'e yazmayın.

Bağlantı yoksa panel **Demo Modu**'nda açılır. Bu modda örnek veriler gösterilir ve değişiklikler kaydedilmez.

### 3. Çalıştırma

```bash
python3 -m http.server 5173
```

Ardından tarayıcıda `http://localhost:5173` adresini açın. İstediğiniz statik barındırma servisini de (Netlify, Vercel, GitHub Pages) kullanabilirsiniz.

## Dosya yapısı

| Dosya | Görev |
|---|---|
| `index.html` | Sayfa iskeleti, formlar ve pencereler |
| `style.css` | Tasarım sistemi (açık/koyu tema) |
| `config.js` | Supabase URL ve anon anahtarı |
| `db.js` | Veri katmanı: Supabase sorguları ve demo modu |
| `app.js` | Sayfalar, grafikler, formlar ve olaylar |
| `sql/` | Şema, örnek veri ve rapor sorguları |

## Veri modeli

`isletmeler`, `kategoriler`, `urunler`, `stok_hareketleri` (GIRIS / SATIS / TUKETIM) ve `fire_kayitlari` (SKT_GECTI / BOZULMA / HAZIRLAMA_HATASI / GUN_SONU_KALAN).

Panel şu view'ları okur: `v_guncel_stok_durumu`, `v_fire_detay` ve `v_hareket_detay`. Raporlar için ayrıca `v_urun_fire_maliyeti`, `v_kafe_fire_orani` ve `v_fire_neden_dagilimi` tanımlıdır.

## Güvenlik notu

RLS politikaları, demo ve okul projesi kullanımı için `anon` rolüne okuma, ekleme ve silme izni verir. Gerçek kullanımda Supabase Auth ekleyin ve `01_schema.sql` içindeki politikalarda `anon` rolünü kaldırın.
