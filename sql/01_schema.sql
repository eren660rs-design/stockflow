-- =====================================================================
-- StockFlow — Supabase şeması
-- Supabase Dashboard → SQL Editor'da çalıştırın. Script tekrar
-- çalıştırılabilir (idempotent): mevcut tablolardaki veriyi silmez,
-- yalnızca view, fonksiyon, trigger ve politikaları yeniler.
-- Sıra: 01_schema.sql → 02_seed_data.sql (isteğe bağlı örnek veri)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLOLAR
-- ---------------------------------------------------------------------

-- İşletmeler (kampüsteki kafeler / şubeler)
create table if not exists public.isletmeler (
    id           bigint generated always as identity primary key,
    ad           text not null,
    konum        text,
    kayit_tarihi timestamptz not null default now()
);

-- Kategoriler
create table if not exists public.kategoriler (
    id           bigint generated always as identity primary key,
    kategori_adi text not null unique
);

-- Ürünler (CHECK 1 & 2: maliyet pozitif, eşik negatif olamaz)
create table if not exists public.urunler (
    id                bigint generated always as identity primary key,
    kategori_id       bigint not null references public.kategoriler(id),
    urun_adi          text not null,
    birim             text not null,
    birim_maliyet     numeric(10,2) not null check (birim_maliyet > 0),
    kritik_stok_esigi numeric(10,2) not null default 5 check (kritik_stok_esigi >= 0)
);

-- Stok hareketleri (CHECK 3 & 4: tip listesi, miktar pozitif)
create table if not exists public.stok_hareketleri (
    id           bigint generated always as identity primary key,
    isletme_id   bigint not null references public.isletmeler(id) on delete cascade,
    urun_id      bigint not null references public.urunler(id),
    hareket_tipi text not null check (hareket_tipi in ('GIRIS', 'SATIS', 'TUKETIM')),
    miktar       numeric(10,2) not null check (miktar > 0),
    islem_tarihi timestamptz not null default now()
);
alter table public.stok_hareketleri add column if not exists aciklama text;

-- Fire kayıtları (CHECK 5 & 6: miktar pozitif, neden listesi)
create table if not exists public.fire_kayitlari (
    id           bigint generated always as identity primary key,
    isletme_id   bigint not null references public.isletmeler(id) on delete cascade,
    urun_id      bigint not null references public.urunler(id),
    fire_miktari numeric(10,2) not null check (fire_miktari > 0),
    fire_nedeni  text not null check (fire_nedeni in ('SKT_GECTI', 'BOZULMA', 'HAZIRLAMA_HATASI', 'GUN_SONU_KALAN')),
    aciklama     text,
    kayit_tarihi timestamptz not null default now()
);

-- Sık kullanılan filtreler için indeksler
create index if not exists idx_urunler_kategori         on public.urunler (kategori_id);
create index if not exists idx_hareket_isletme_urun     on public.stok_hareketleri (isletme_id, urun_id);
create index if not exists idx_hareket_tarih            on public.stok_hareketleri (islem_tarihi desc);
create index if not exists idx_fire_isletme_urun        on public.fire_kayitlari (isletme_id, urun_id);
create index if not exists idx_fire_tarih               on public.fire_kayitlari (kayit_tarihi desc);

-- ---------------------------------------------------------------------
-- 2. İŞ KURALLARI: STOK EKSİYE DÜŞEMEZ
-- ---------------------------------------------------------------------

-- Bir şubedeki bir ürünün anlık net stoğu
create or replace function public.stok_miktari(p_isletme_id bigint, p_urun_id bigint)
returns numeric
language sql
set search_path = public
as $$
    select
        coalesce((select sum(case when hareket_tipi = 'GIRIS' then miktar else -miktar end)
                  from stok_hareketleri
                  where isletme_id = p_isletme_id and urun_id = p_urun_id), 0)
      - coalesce((select sum(fire_miktari)
                  from fire_kayitlari
                  where isletme_id = p_isletme_id and urun_id = p_urun_id), 0);
$$;

-- Satış / tüketim / fire, mevcut stoktan fazla olamaz
create or replace function public.stok_cikisini_dogrula()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_mevcut numeric;
    v_cikis  numeric;
begin
    if tg_table_name = 'stok_hareketleri' then
        if new.hareket_tipi = 'GIRIS' then
            return new;
        end if;
        v_cikis := new.miktar;
    else
        v_cikis := new.fire_miktari;
    end if;

    v_mevcut := public.stok_miktari(new.isletme_id, new.urun_id);

    if v_cikis > v_mevcut then
        raise exception 'Yetersiz stok: mevcut %, istenen %', round(v_mevcut, 2), v_cikis
            using errcode = 'P0001';
    end if;
    return new;
end;
$$;

-- Bir giriş hareketi silinince stok eksiye düşmemeli
create or replace function public.giris_silmeyi_dogrula()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    if old.hareket_tipi = 'GIRIS'
       and public.stok_miktari(old.isletme_id, old.urun_id) - old.miktar < 0 then
        raise exception 'Bu giriş silinemez: stok eksiye düşer (mevcut %)',
            round(public.stok_miktari(old.isletme_id, old.urun_id), 2)
            using errcode = 'P0001';
    end if;
    return old;
end;
$$;

drop trigger if exists trg_hareket_stok_kontrol on public.stok_hareketleri;
create trigger trg_hareket_stok_kontrol
    before insert on public.stok_hareketleri
    for each row execute function public.stok_cikisini_dogrula();

drop trigger if exists trg_fire_stok_kontrol on public.fire_kayitlari;
create trigger trg_fire_stok_kontrol
    before insert on public.fire_kayitlari
    for each row execute function public.stok_cikisini_dogrula();

drop trigger if exists trg_giris_silme_kontrol on public.stok_hareketleri;
create trigger trg_giris_silme_kontrol
    before delete on public.stok_hareketleri
    for each row execute function public.giris_silmeyi_dogrula();

-- ---------------------------------------------------------------------
-- 3. VIEW'LAR (uygulamanın okuduğu katman)
-- View'lar veri tutmaz; güvenle yeniden oluşturulur.
-- ---------------------------------------------------------------------
drop view if exists public.v_guncel_stok_durumu;
drop view if exists public.v_fire_detay;
drop view if exists public.v_hareket_detay;
drop view if exists public.v_urun_fire_maliyeti;
drop view if exists public.v_kafe_fire_orani;
drop view if exists public.v_fire_neden_dagilimi;

-- Şube × ürün bazında güncel stok, değer ve durum
create view public.v_guncel_stok_durumu
with (security_invoker = true) as
select
    i.id   as isletme_id,
    i.ad   as isletme_adi,
    u.id   as urun_id,
    u.urun_adi,
    k.kategori_adi,
    u.birim,
    u.birim_maliyet,
    u.kritik_stok_esigi,
    coalesce(h.giris, 0)                                    as toplam_giris,
    coalesce(h.cikis, 0)                                    as toplam_cikis,
    coalesce(f.fire, 0)                                     as toplam_fire,
    coalesce(h.giris, 0) - coalesce(h.cikis, 0) - coalesce(f.fire, 0) as kalan_stok,
    round((coalesce(h.giris, 0) - coalesce(h.cikis, 0) - coalesce(f.fire, 0)) * u.birim_maliyet, 2) as stok_degeri_tl,
    case
        when coalesce(h.giris, 0) - coalesce(h.cikis, 0) - coalesce(f.fire, 0) <= 0 then 'TUKENDI'
        when coalesce(h.giris, 0) - coalesce(h.cikis, 0) - coalesce(f.fire, 0) <= u.kritik_stok_esigi then 'KRITIK'
        else 'YETERLI'
    end as durum
from public.isletmeler i
cross join public.urunler u
join public.kategoriler k on k.id = u.kategori_id
left join lateral (
    select sum(miktar) filter (where hareket_tipi = 'GIRIS')  as giris,
           sum(miktar) filter (where hareket_tipi <> 'GIRIS') as cikis
    from public.stok_hareketleri sh
    where sh.isletme_id = i.id and sh.urun_id = u.id
) h on true
left join lateral (
    select sum(fire_miktari) as fire
    from public.fire_kayitlari fk
    where fk.isletme_id = i.id and fk.urun_id = u.id
) f on true
-- Hiç hareketi olmayan şube/ürün çiftlerini gösterme
where h.giris is not null or h.cikis is not null or f.fire is not null;

-- Fire kayıtları: tüm isimler ve hesaplanmış zarar ile
create view public.v_fire_detay
with (security_invoker = true) as
select
    f.id,
    f.kayit_tarihi,
    f.isletme_id,
    i.ad as isletme_adi,
    f.urun_id,
    u.urun_adi,
    k.kategori_adi,
    u.birim,
    u.birim_maliyet,
    f.fire_miktari,
    f.fire_nedeni,
    f.aciklama,
    round(f.fire_miktari * u.birim_maliyet, 2) as zarar_tl
from public.fire_kayitlari f
join public.isletmeler i  on i.id = f.isletme_id
join public.urunler u     on u.id = f.urun_id
join public.kategoriler k on k.id = u.kategori_id;

-- Stok hareketleri: tüm isimler ve tutar ile
create view public.v_hareket_detay
with (security_invoker = true) as
select
    sh.id,
    sh.islem_tarihi,
    sh.isletme_id,
    i.ad as isletme_adi,
    sh.urun_id,
    u.urun_adi,
    u.birim,
    sh.hareket_tipi,
    sh.miktar,
    sh.aciklama,
    round(sh.miktar * u.birim_maliyet, 2) as tutar_tl
from public.stok_hareketleri sh
join public.isletmeler i on i.id = sh.isletme_id
join public.urunler u    on u.id = sh.urun_id;

-- Ürün bazlı toplam fire maliyeti (rapor)
create view public.v_urun_fire_maliyeti
with (security_invoker = true) as
select
    u.id as urun_id,
    u.urun_adi,
    k.kategori_adi,
    u.birim,
    u.birim_maliyet,
    coalesce(sum(f.fire_miktari), 0)                           as toplam_fire_miktari,
    round(coalesce(sum(f.fire_miktari * u.birim_maliyet), 0), 2) as toplam_zarar_tl
from public.urunler u
join public.kategoriler k on k.id = u.kategori_id
left join public.fire_kayitlari f on f.urun_id = u.id
group by u.id, u.urun_adi, k.kategori_adi, u.birim, u.birim_maliyet;

-- Şube bazlı giriş maliyeti / fire zararı oranı (CTE)
create view public.v_kafe_fire_orani
with (security_invoker = true) as
with kafe_giris as (
    select sh.isletme_id, sum(sh.miktar * u.birim_maliyet) as giris_maliyeti
    from public.stok_hareketleri sh
    join public.urunler u on u.id = sh.urun_id
    where sh.hareket_tipi = 'GIRIS'
    group by sh.isletme_id
),
kafe_fire as (
    select f.isletme_id, sum(f.fire_miktari * u.birim_maliyet) as fire_maliyeti
    from public.fire_kayitlari f
    join public.urunler u on u.id = f.urun_id
    group by f.isletme_id
)
select
    i.id as isletme_id,
    i.ad as isletme_adi,
    round(coalesce(kg.giris_maliyeti, 0), 2) as toplam_giris_tl,
    round(coalesce(kf.fire_maliyeti, 0), 2)  as toplam_fire_tl,
    round(coalesce(kf.fire_maliyeti, 0) / nullif(kg.giris_maliyeti, 0) * 100, 2) as fire_yuzdesi
from public.isletmeler i
left join kafe_giris kg on kg.isletme_id = i.id
left join kafe_fire  kf on kf.isletme_id = i.id;

-- Fire nedenlerine göre dağılım
create view public.v_fire_neden_dagilimi
with (security_invoker = true) as
select
    f.fire_nedeni,
    count(*)                                   as kayit_sayisi,
    sum(f.fire_miktari)                        as toplam_miktar,
    round(sum(f.fire_miktari * u.birim_maliyet), 2) as toplam_zarar_tl
from public.fire_kayitlari f
join public.urunler u on u.id = f.urun_id
group by f.fire_nedeni;

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- Not: Bu politikalar anon anahtarla okuma/yazmaya izin verir (okul
-- projesi / demo için). Gerçek kullanımda "anon" rolünü kaldırıp
-- yalnızca "authenticated" kullanıcılara izin verin.
-- ---------------------------------------------------------------------
alter table public.isletmeler       enable row level security;
alter table public.kategoriler      enable row level security;
alter table public.urunler          enable row level security;
alter table public.stok_hareketleri enable row level security;
alter table public.fire_kayitlari   enable row level security;

-- Eski politikaları temizle
drop policy if exists "select_all_isletmeler"  on public.isletmeler;
drop policy if exists "select_all_kategoriler" on public.kategoriler;
drop policy if exists "select_all_urunler"     on public.urunler;
drop policy if exists "all_stok_hareketleri"   on public.stok_hareketleri;
drop policy if exists "all_fire_kayitlari"     on public.fire_kayitlari;
drop policy if exists "isletmeler_okuma"       on public.isletmeler;
drop policy if exists "kategoriler_okuma"      on public.kategoriler;
drop policy if exists "urunler_okuma"          on public.urunler;
drop policy if exists "urunler_ekleme"         on public.urunler;
drop policy if exists "urunler_guncelleme"     on public.urunler;
drop policy if exists "hareket_okuma"          on public.stok_hareketleri;
drop policy if exists "hareket_ekleme"         on public.stok_hareketleri;
drop policy if exists "hareket_silme"          on public.stok_hareketleri;
drop policy if exists "fire_okuma"             on public.fire_kayitlari;
drop policy if exists "fire_ekleme"            on public.fire_kayitlari;
drop policy if exists "fire_silme"             on public.fire_kayitlari;

create policy "isletmeler_okuma"   on public.isletmeler       for select to anon, authenticated using (true);
create policy "kategoriler_okuma"  on public.kategoriler      for select to anon, authenticated using (true);
create policy "urunler_okuma"      on public.urunler          for select to anon, authenticated using (true);
create policy "urunler_ekleme"     on public.urunler          for insert to anon, authenticated with check (true);
create policy "urunler_guncelleme" on public.urunler          for update to anon, authenticated using (true) with check (true);
create policy "hareket_okuma"      on public.stok_hareketleri for select to anon, authenticated using (true);
create policy "hareket_ekleme"     on public.stok_hareketleri for insert to anon, authenticated with check (true);
create policy "hareket_silme"      on public.stok_hareketleri for delete to anon, authenticated using (true);
create policy "fire_okuma"         on public.fire_kayitlari   for select to anon, authenticated using (true);
create policy "fire_ekleme"        on public.fire_kayitlari   for insert to anon, authenticated with check (true);
create policy "fire_silme"         on public.fire_kayitlari   for delete to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- 5. REALTIME (panel, başka cihazdan girilen kayıtları anında görür)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
    foreach t in array array['fire_kayitlari', 'stok_hareketleri', 'urunler'] loop
        begin
            execute format('alter publication supabase_realtime add table public.%I', t);
        exception when others then
            null; -- zaten ekli ya da yayın yok
        end;
    end loop;
end $$;
