-- 1. İşletmeler (Okuldaki 3 kafe)
CREATE TABLE isletmeler (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ad TEXT NOT NULL,
    konum TEXT,
    kayit_tarihi TIMESTAMPTZ DEFAULT now()
);

-- 2. Kategoriler
CREATE TABLE kategoriler (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kategori_adi TEXT NOT NULL UNIQUE
);

-- 3. Ürünler (CHECK Kuralı 1 & 2)
CREATE TABLE urunler (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kategori_id BIGINT NOT NULL REFERENCES kategoriler(id),
    urun_adi TEXT NOT NULL,
    birim TEXT NOT NULL,
    birim_maliyet NUMERIC(10,2) NOT NULL CHECK (birim_maliyet > 0),
    kritik_stok_esigi NUMERIC(10,2) DEFAULT 5 CHECK (kritik_stok_esigi >= 0)
);

-- 4. Stok Hareketleri (CHECK Kuralı 3 & 4)
CREATE TABLE stok_hareketleri (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    isletme_id BIGINT NOT NULL REFERENCES isletmeler(id),
    urun_id BIGINT NOT NULL REFERENCES urunler(id),
    hareket_tipi TEXT NOT NULL CHECK (hareket_tipi IN ('GIRIS', 'SATIS', 'TUKETIM')),
    miktar NUMERIC(10,2) NOT NULL CHECK (miktar > 0),
    islem_tarihi TIMESTAMPTZ DEFAULT now()
);

-- 5. Fire Kayıtları (CHECK Kuralı 5 & 6)
CREATE TABLE fire_kayitlari (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    isletme_id BIGINT NOT NULL REFERENCES isletmeler(id),
    urun_id BIGINT NOT NULL REFERENCES urunler(id),
    fire_miktari NUMERIC(10,2) NOT NULL CHECK (fire_miktari > 0),
    fire_nedeni TEXT NOT NULL CHECK (fire_nedeni IN ('SKT_GECTI', 'BOZULMA', 'HAZIRLAMA_HATASI', 'GUN_SONU_KALAN')),
    aciklama TEXT,
    kayit_tarihi TIMESTAMPTZ DEFAULT now()
);

-- VIEW 1: Ürün ve Kafe Bazlı Fire Maliyeti
CREATE VIEW v_urun_fire_maliyeti
WITH (security_invoker = true) AS
SELECT 
    COALESCE(i.ad, 'Henüz Fire Yok') AS isletme_adi,
    k.kategori_adi,
    u.id AS urun_id,
    u.urun_adi,
    u.birim,
    u.birim_maliyet,
    COALESCE(SUM(f.fire_miktari), 0) AS toplam_fire_miktari,
    ROUND(COALESCE(SUM(f.fire_miktari * u.birim_maliyet), 0), 2) AS toplam_zarar_tl
FROM urunler u
JOIN kategoriler k ON k.id = u.kategori_id
LEFT JOIN fire_kayitlari f ON f.urun_id = u.id
LEFT JOIN isletmeler i ON i.id = f.isletme_id
GROUP BY i.ad, k.kategori_adi, u.id, u.urun_adi, u.birim, u.birim_maliyet
ORDER BY toplam_zarar_tl DESC;

-- VIEW 2: Kafe Bazlı Güncel Net Stok Durumu
CREATE VIEW v_guncel_stok_durumu
WITH (security_invoker = true) AS
SELECT 
    i.id AS isletme_id,
    i.ad AS isletme_adi,
    u.id AS urun_id,
    u.urun_adi,
    u.birim,
    u.kritik_stok_esigi,
    COALESCE(SUM(CASE WHEN sh.hareket_tipi = 'GIRIS' THEN sh.miktar ELSE -sh.miktar END), 0) 
    - COALESCE((SELECT SUM(fk.fire_miktari) FROM fire_kayitlari fk WHERE fk.urun_id = u.id AND fk.isletme_id = i.id), 0) AS kalan_stok
FROM isletmeler i
CROSS JOIN urunler u
LEFT JOIN stok_hareketleri sh ON sh.isletme_id = i.id AND sh.urun_id = u.id
GROUP BY i.id, i.ad, u.id, u.urun_adi, u.birim, u.kritik_stok_esigi;

-- RLS (Row Level Security) Aktifleştirme ve Politikalar
ALTER TABLE isletmeler ENABLE ROW LEVEL SECURITY;
ALTER TABLE kategoriler ENABLE ROW LEVEL SECURITY;
ALTER TABLE urunler ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_hareketleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE fire_kayitlari ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_all_isletmeler" ON isletmeler FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "select_all_kategoriler" ON kategoriler FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "select_all_urunler" ON urunler FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "all_stok_hareketleri" ON stok_hareketleri FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_fire_kayitlari" ON fire_kayitlari FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
