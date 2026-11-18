INSERT INTO isletmeler (ad, konum) VALUES
('Merkez Kütüphane Kafe', 'A Blok Giriş'),
('Mühendislik Kantin & Kafe', 'B Blok Zemin'),
('Bahçe Pastane & Kahve', 'Kampüs Meydanı');

INSERT INTO kategoriler (kategori_adi) VALUES
('Süt ve Süt Ürünleri'),
('Unlu Mamuller'),
('Tatlı & Pastane'),
('Kahve & İçecek');

INSERT INTO urunler (kategori_id, urun_adi, birim, birim_maliyet, kritik_stok_esigi) VALUES
(1, 'Günlük Tam Yağlı Süt', 'Litre', 38.50, 15),
(1, 'Laktozsuz Süt', 'Litre', 44.00, 8),
(2, 'Tereyağlı Kruvasan', 'Adet', 32.00, 10),
(2, 'Peynirli Sandviç', 'Adet', 45.00, 8),
(3, 'San Sebastian Cheesecake', 'Dilim', 65.00, 6),
(3, 'Tiramisu', 'Porsiyon', 58.00, 5),
(4, 'Espresso Çekirdek', 'Kg', 620.00, 3),
(4, 'Çilek Püresi', 'Litre', 140.00, 4);

INSERT INTO stok_hareketleri (isletme_id, urun_id, hareket_tipi, miktar) VALUES
(1, 1, 'GIRIS', 50), (1, 1, 'TUKETIM', 32),
(1, 3, 'GIRIS', 40), (1, 3, 'SATIS', 28),
(1, 5, 'GIRIS', 20), (1, 5, 'SATIS', 12),
(2, 1, 'GIRIS', 60), (2, 1, 'TUKETIM', 48),
(2, 4, 'GIRIS', 35), (2, 4, 'SATIS', 22),
(3, 6, 'GIRIS', 25), (3, 6, 'SATIS', 15);

INSERT INTO fire_kayitlari (isletme_id, urun_id, fire_miktari, fire_nedeni, aciklama) VALUES
(1, 1, 4, 'SKT_GECTI', 'Dolap arkası kalan kutular'),
(1, 3, 7, 'GUN_SONU_KALAN', 'Akşam 19:00 sonrası satılmayan'),
(1, 5, 3, 'BOZULMA', 'Vitrin soğutma arızası'),
(2, 1, 2, 'HAZIRLAMA_HATASI', 'Barista dökülmesi'),
(2, 4, 8, 'GUN_SONU_KALAN', 'Gün sonu bayatlayan sandviçler'),
(2, 2, 3, 'SKT_GECTI', 'Son kullanma tarihi doldu'),
(3, 6, 4, 'BOZULMA', 'Krema bozulması'),
(3, 5, 5, 'GUN_SONU_KALAN', 'Hafta sonu kalan dilimler'),
(3, 8, 1.5, 'SKT_GECTI', 'Açılmış şişe SKT geçti');
