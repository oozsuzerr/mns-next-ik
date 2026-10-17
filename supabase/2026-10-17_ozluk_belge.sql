-- Özlük bilgileri ve belge yükleme (17.10.2026)
--
-- * personel_ozluk: iletişim, acil durum kişisi, iş ve ücret bilgileri (personel başına bir satır)
-- * personel_belgeleri: belge kayıtları; dosyalar Storage'da "personel-belgeleri" gizli kovasında,
--   yol: <firma_id>/<personel_id>/<rastgele>-<dosya adı>
-- * Erişim: YALNIZCA GENEL YÖNETİCİ, yalnızca kendi firması (hassas veri: ücret, IBAN, adres, kimlik).
--   Şube müdürü personel satırını görür ama bu tablolara ve dosyalara erişemez.
-- Önce deneme projesinde, sonra canlıda. Uygulama kodu bu tablolar yokken de açılır
-- (yalnızca Özlük penceresi ve belge uyarısı çalışmaz).
-- Geri alma: dosyanın sonu.

begin;

-- =====================================================================
-- 1) Özlük
-- =====================================================================
create table if not exists public.personel_ozluk (
  personel_id uuid primary key references public.personeller (id) on delete cascade,
  firma_id uuid not null references public.firmalar (id),
  telefon text,
  eposta text,
  adres text,
  unvan text,
  calisma_sekli text check (calisma_sekli is null or calisma_sekli in ('Tam zamanlı', 'Yarı zamanlı', 'Kısmi süreli', 'Belirli süreli', 'Stajyer', 'Diğer')),
  egitim text check (egitim is null or egitim in ('İlkokul', 'Ortaokul', 'Lise', 'Ön lisans', 'Lisans', 'Yüksek lisans', 'Doktora')),
  acil_kisi text,
  acil_yakinlik text,
  acil_telefon text,
  ucret numeric(12, 2) check (ucret is null or ucret >= 0),
  ucret_turu text check (ucret_turu is null or ucret_turu in ('Aylık brüt', 'Aylık net', 'Günlük brüt', 'Saatlik brüt')),
  iban text check (iban is null or iban ~ '^TR[0-9]{24}$'),
  notlar text check (notlar is null or char_length(notlar) <= 2000),
  guncelleme timestamptz not null default now()
);
create index if not exists personel_ozluk_firma on public.personel_ozluk (firma_id);
alter table public.personel_ozluk enable row level security;

drop policy if exists ozluk_genel_yonetici on public.personel_ozluk;
create policy ozluk_genel_yonetici on public.personel_ozluk for all to authenticated
  using (public.is_admin() and public.personel_yetkisi(personel_id))
  with check (public.is_admin() and public.personel_yetkisi(personel_id));
drop policy if exists firma_siniri on public.personel_ozluk;
create policy firma_siniri on public.personel_ozluk as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

-- =====================================================================
-- 2) Belgeler
-- =====================================================================
create table if not exists public.personel_belgeleri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  personel_id uuid not null references public.personeller (id) on delete cascade,
  tur text not null check (tur in ('İş sözleşmesi', 'Kimlik', 'Diploma', 'Sağlık raporu', 'İzin belgesi', 'SGK evrakı', 'Diğer')),
  ad text not null check (char_length(ad) between 1 and 200),
  dosya_yolu text not null unique,
  boyut integer,
  mime text,
  gecerlilik_bitis date,
  aciklama text check (aciklama is null or char_length(aciklama) <= 500),
  yukleyen uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists personel_belgeleri_personel on public.personel_belgeleri (personel_id, created_at desc);
create index if not exists personel_belgeleri_bitis on public.personel_belgeleri (firma_id, gecerlilik_bitis) where gecerlilik_bitis is not null;
alter table public.personel_belgeleri enable row level security;

drop policy if exists belge_genel_yonetici on public.personel_belgeleri;
create policy belge_genel_yonetici on public.personel_belgeleri for all to authenticated
  using (public.is_admin() and public.personel_yetkisi(personel_id))
  with check (public.is_admin() and public.personel_yetkisi(personel_id));
drop policy if exists firma_siniri on public.personel_belgeleri;
create policy firma_siniri on public.personel_belgeleri as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

-- Firma otomatik dolar ve personelle uyuşması denetlenir; değişiklikler işlem geçmişine yazılır
do $$
declare
  v_tablo text;
begin
  foreach v_tablo in array array['personel_ozluk', 'personel_belgeleri'] loop
    execute format('drop trigger if exists a0_firma_doldur on public.%I', v_tablo);
    execute format('create trigger a0_firma_doldur before insert or update on public.%I for each row execute function public.firma_doldur()', v_tablo);
    execute format('drop trigger if exists islem_gecmisi_yaz on public.%I', v_tablo);
    execute format('create trigger islem_gecmisi_yaz after insert or delete or update on public.%I for each row execute function public.islem_gecmisi_yaz()', v_tablo);
  end loop;
end $$;

-- =====================================================================
-- 3) Dosya deposu (gizli kova) ve erişim kuralları
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'personel-belgeleri', 'personel-belgeleri', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Yol: <firma_id>/<personel_id>/<dosya>. Klasörün ilk parçası kullanıcının firması olmalı,
-- ikinci parçası yetkili olduğu (kendi firmasındaki) bir personel olmalı.
drop policy if exists personel_belgeleri_okuma on storage.objects;
create policy personel_belgeleri_okuma on storage.objects for select to authenticated
  using (
    bucket_id = 'personel-belgeleri'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.aktif_firma_id()::text
    and public.personel_yetkisi(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists personel_belgeleri_yukleme on storage.objects;
create policy personel_belgeleri_yukleme on storage.objects for insert to authenticated
  with check (
    bucket_id = 'personel-belgeleri'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.aktif_firma_id()::text
    and public.personel_yetkisi(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists personel_belgeleri_silme on storage.objects;
create policy personel_belgeleri_silme on storage.objects for delete to authenticated
  using (
    bucket_id = 'personel-belgeleri'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.aktif_firma_id()::text
    and public.personel_yetkisi(((storage.foldername(name))[2])::uuid)
  );

commit;

-- =====================================================================
-- GERİ ALMA (dosyalar Storage'da kalır; gerekiyorsa önce panelden silin)
-- =====================================================================
-- begin;
-- drop policy if exists personel_belgeleri_okuma on storage.objects;
-- drop policy if exists personel_belgeleri_yukleme on storage.objects;
-- drop policy if exists personel_belgeleri_silme on storage.objects;
-- drop table if exists public.personel_belgeleri;
-- drop table if exists public.personel_ozluk;
-- commit;
