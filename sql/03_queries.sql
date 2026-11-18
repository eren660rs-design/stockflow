-- 1. JOIN: Detaylı Fire Listesi
SELECT f.id, i.ad AS kafe, u.urun_adi, f.fire_miktari, u.birim, f.fire_nedeni, 
       (f.fire_miktari * u.birim_maliyet) AS zarar_tl, f.kayit_tarihi
FROM fire_kayitlari f
JOIN isletmeler i ON i.id = f.isletme_id
JOIN urunler u ON u.id = f.urun_id
ORDER BY f.kayit_tarihi DESC;

-- 2. GROUP BY + HAVING: Toplam fire zararı 300 TL'yi aşan ürünler
SELECT u.urun_adi, SUM(f.fire_miktari) AS toplam_fire, 
       SUM(f.fire_miktari * u.birim_maliyet) AS toplam_zarar
FROM fire_kayitlari f
JOIN urunler u ON u.id = f.urun_id
GROUP BY u.id, u.urun_adi
HAVING SUM(f.fire_miktari * u.birim_maliyet) > 300;

-- 3. CASE: Ürünlerin Zarar Risk Seviyesini Etiketleme
SELECT urun_adi, toplam_zarar_tl,
       CASE 
           WHEN toplam_zarar_tl = 0 THEN 'Sıfır Kayıp'
           WHEN toplam_zarar_tl < 250 THEN 'Düşük Risk'
           WHEN toplam_zarar_tl BETWEEN 250 AND 500 THEN 'Orta Risk'
           ELSE 'Kritik Zarar!'
       END AS risk_durumu
FROM v_urun_fire_maliyeti;

-- 4. ALT SORGU: Ortalama birim maliyetin üzerindeki ürünlerin fire kayıtları
SELECT u.urun_adi, u.birim_maliyet, f.fire_miktari, f.fire_nedeni
FROM fire_kayitlari f
JOIN urunler u ON u.id = f.urun_id
WHERE u.birim_maliyet > (SELECT AVG(birim_maliyet) FROM urunler);

-- 5. CTE (WITH): Kafe Bazlı Giriş Maliyeti vs Fire Zararı Oranı
WITH kafe_giris AS (
    SELECT sh.isletme_id, SUM(sh.miktar * u.birim_maliyet) AS giris_maliyeti
    FROM stok_hareketleri sh
    JOIN urunler u ON u.id = sh.urun_id
    WHERE sh.hareket_tipi = 'GIRIS'
    GROUP BY sh.isletme_id
),
kafe_fire AS (
    SELECT f.isletme_id, SUM(f.fire_miktari * u.birim_maliyet) AS fire_maliyeti
    FROM fire_kayitlari f
    JOIN urunler u ON u.id = f.urun_id
    GROUP BY f.isletme_id
)
SELECT i.ad AS kafe, 
       COALESCE(kg.giris_maliyeti, 0) AS toplam_giris_tl,
       COALESCE(kf.fire_maliyeti, 0) AS toplam_fire_tl,
       ROUND((COALESCE(kf.fire_maliyeti, 0) / NULLIF(kg.giris_maliyeti, 0)) * 100, 2) AS fire_yuzdesi
FROM isletmeler i
LEFT JOIN kafe_giris kg ON kg.isletme_id = i.id
LEFT JOIN kafe_fire kf ON kf.isletme_id = i.id;

-- 6. Fire Nedenlerine Göre Dağılım (GROUP BY)
SELECT fire_nedeni, COUNT(*) AS kayit_sayisi, SUM(fire_miktari) AS toplam_miktar
FROM fire_kayitlari
GROUP BY fire_nedeni
ORDER BY kayit_sayisi DESC;

-- 7. Hiç Firesi Olmayan Ürünler (LEFT JOIN + IS NULL)
SELECT u.urun_adi, k.kategori_adi
FROM urunler u
JOIN kategoriler k ON k.id = u.kategori_id
LEFT JOIN fire_kayitlari f ON f.urun_id = u.id
WHERE f.id IS NULL;

-- 8. Kritik Stok Eşiği Altındaki Ürünler (View Üzerinden Sorgu)
SELECT isletme_adi, urun_adi, kalan_stok, kritik_stok_esigi
FROM v_guncel_stok_durumu
WHERE kalan_stok <= kritik_stok_esigi;
