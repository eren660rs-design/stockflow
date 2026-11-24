-- =====================================================================
-- StockFlow — örnek veri
-- DİKKAT: Bu script tüm tabloları BOŞALTIR ve örnek veriyi yükler.
-- Tarihler çalıştırıldığı güne göre son 3 haftaya yayılır.
-- =====================================================================

truncate public.fire_kayitlari, public.stok_hareketleri, public.urunler,
         public.kategoriler, public.isletmeler restart identity cascade;

insert into public.isletmeler (ad, konum) values
('Merkez Kütüphane Kafe',     'A Blok Giriş'),
('Mühendislik Kantin & Kafe', 'B Blok Zemin'),
('Bahçe Pastane & Kahve',     'Kampüs Meydanı');

insert into public.kategoriler (kategori_adi) values
('Süt ve Süt Ürünleri'),
('Unlu Mamuller'),
('Tatlı & Pastane'),
('Kahve & İçecek');

insert into public.urunler (kategori_id, urun_adi, birim, birim_maliyet, kritik_stok_esigi) values
(1, 'Günlük Tam Yağlı Süt',     'Litre',    38.50, 15),  -- 1
(1, 'Laktozsuz Süt',            'Litre',    44.00,  8),  -- 2
(2, 'Tereyağlı Kruvasan',       'Adet',     32.00, 10),  -- 3
(2, 'Peynirli Sandviç',         'Adet',     45.00,  8),  -- 4
(3, 'San Sebastian Cheesecake', 'Dilim',    65.00,  6),  -- 5
(3, 'Tiramisu',                 'Porsiyon', 58.00,  5),  -- 6
(4, 'Espresso Çekirdek',        'Kg',      620.00,  3),  -- 7
(4, 'Çilek Püresi',             'Litre',   140.00,  4),  -- 8
(4, 'Yulaf Sütü',               'Litre',    72.00,  6),  -- 9
(2, 'Çikolatalı Muffin',        'Adet',     28.00, 10);  -- 10

-- Önce girişler (stok kontrol trigger'ı çıkışların stoğu aşmamasını denetler)
insert into public.stok_hareketleri (isletme_id, urun_id, hareket_tipi, miktar, islem_tarihi, aciklama) values
(1, 1, 'GIRIS', 50,  now() - interval '20 days', 'Haftalık süt teslimatı'),
(1, 1, 'GIRIS', 40,  now() - interval '10 days', 'Haftalık süt teslimatı'),
(1, 3, 'GIRIS', 40,  now() - interval '14 days', 'Fırın siparişi'),
(1, 3, 'GIRIS', 40,  now() - interval '7 days',  'Fırın siparişi'),
(1, 5, 'GIRIS', 20,  now() - interval '12 days', null),
(1, 7, 'GIRIS', 8,   now() - interval '18 days', 'Kavurucu teslimatı'),
(1, 9, 'GIRIS', 20,  now() - interval '11 days', null),
(2, 1, 'GIRIS', 60,  now() - interval '19 days', 'Haftalık süt teslimatı'),
(2, 1, 'GIRIS', 30,  now() - interval '8 days',  'Ek sipariş'),
(2, 2, 'GIRIS', 15,  now() - interval '16 days', null),
(2, 4, 'GIRIS', 35,  now() - interval '13 days', null),
(2, 4, 'GIRIS', 30,  now() - interval '5 days',  null),
(2, 10,'GIRIS', 30,  now() - interval '10 days', null),
(2, 7, 'GIRIS', 5,   now() - interval '17 days', 'Kavurucu teslimatı'),
(3, 6, 'GIRIS', 25,  now() - interval '15 days', null),
(3, 6, 'GIRIS', 15,  now() - interval '4 days',  null),
(3, 5, 'GIRIS', 24,  now() - interval '14 days', null),
(3, 5, 'GIRIS', 12,  now() - interval '5 days',  null),
(3, 8, 'GIRIS', 6,   now() - interval '20 days', null),
(3, 3, 'GIRIS', 30,  now() - interval '12 days', 'Fırın siparişi'),
(3, 10,'GIRIS', 25,  now() - interval '9 days',  null);

-- Sonra satış ve tüketimler
insert into public.stok_hareketleri (isletme_id, urun_id, hareket_tipi, miktar, islem_tarihi) values
(1, 1, 'TUKETIM', 30,  now() - interval '15 days'),
(1, 1, 'TUKETIM', 41,  now() - interval '5 days'),
(1, 3, 'SATIS',   30,  now() - interval '10 days'),
(1, 3, 'SATIS',   26,  now() - interval '4 days'),
(1, 5, 'SATIS',   12,  now() - interval '6 days'),
(1, 7, 'TUKETIM', 3.5, now() - interval '8 days'),
(1, 9, 'TUKETIM', 9,   now() - interval '4 days'),
(2, 1, 'TUKETIM', 48,  now() - interval '12 days'),
(2, 1, 'TUKETIM', 20,  now() - interval '3 days'),
(2, 2, 'TUKETIM', 6,   now() - interval '7 days'),
(2, 4, 'SATIS',   22,  now() - interval '9 days'),
(2, 4, 'SATIS',   20,  now() - interval '2 days'),
(2, 10,'SATIS',   18,  now() - interval '3 days'),
(2, 7, 'TUKETIM', 2.5, now() - interval '6 days'),
(3, 6, 'SATIS',   15,  now() - interval '10 days'),
(3, 6, 'SATIS',   10,  now() - interval '2 days'),
(3, 5, 'SATIS',   16,  now() - interval '8 days'),
(3, 5, 'SATIS',   9,   now() - interval '1 day'),
(3, 8, 'TUKETIM', 2,   now() - interval '9 days'),
(3, 3, 'SATIS',   24,  now() - interval '6 days'),
(3, 10,'SATIS',   14,  now() - interval '3 days');

-- Fire kayıtları
insert into public.fire_kayitlari (isletme_id, urun_id, fire_miktari, fire_nedeni, aciklama, kayit_tarihi) values
(1, 1, 4,   'SKT_GECTI',        'Dolap arkasında kalan kutular',   now() - interval '12 days'),
(1, 1, 3,   'HAZIRLAMA_HATASI', 'Süt köpürtme sırasında döküldü',  now() - interval '3 days'),
(1, 3, 7,   'GUN_SONU_KALAN',   '19:00 sonrası satılmayan',        now() - interval '9 days'),
(1, 3, 5,   'GUN_SONU_KALAN',   'Sınav haftası düşük satış',       now() - interval '2 days'),
(1, 5, 3,   'BOZULMA',          'Vitrin soğutma arızası',          now() - interval '5 days'),
(1, 7, 0.3, 'HAZIRLAMA_HATASI', 'Değirmen ayarı kaçtı',            now() - interval '6 days'),
(1, 9, 2,   'SKT_GECTI',        null,                              now() - interval '1 day'),
(2, 1, 2,   'HAZIRLAMA_HATASI', 'Barista dökülmesi',               now() - interval '11 days'),
(2, 2, 3,   'SKT_GECTI',        'Son kullanma tarihi doldu',       now() - interval '2 days'),
(2, 4, 8,   'GUN_SONU_KALAN',   'Gün sonu bayatlayan sandviçler',  now() - interval '8 days'),
(2, 4, 4,   'GUN_SONU_KALAN',   null,                              now() - interval '1 day'),
(2, 10,4,   'GUN_SONU_KALAN',   null,                              now() - interval '2 days'),
(3, 6, 4,   'BOZULMA',          'Krema bozulması',                 now() - interval '9 days'),
(3, 5, 5,   'GUN_SONU_KALAN',   'Hafta sonu kalan dilimler',       now() - interval '6 days'),
(3, 8, 1.5, 'SKT_GECTI',        'Açılmış şişe SKT geçti',          now() - interval '3 days'),
(3, 3, 6,   'GUN_SONU_KALAN',   null,                              now() - interval '5 days');
