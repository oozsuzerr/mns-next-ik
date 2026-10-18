-- Tahmini bordro ve mesai ücretleri (18.10.2026)
--
-- * bordro_ayarlari: firma başına bir satır. yasal: asgari ücret, SGK/işsizlik oranları, damga vergisi,
--   gelir vergisi dilimleri, saat böleni (yıl yıl güncellenir). mesai_kalemleri: firmanın mesai çarpanları
--   (ad, kaynak, çarpan, aktif); firma ekler, çıkarır, değiştirir. Satır yoksa uygulama yasal varsayılanları kullanır.
-- * Hesap uygulamada yapılır (src/lib/bordro.ts); ücretler Özlük'ten okunduğu için yalnızca genel yönetici görür.
-- * Modül anahtarı "bordro": firma paketine eklenir; tam paketli mevcut firmalarda otomatik açılır.
-- Önce deneme projesinde, sonra canlıda. Önkoşul: 2026-10-18_gorevler.sql.
-- Geri alma: dosyanın sonu.

begin;

alter table public.firmalar drop constraint if exists firmalar_moduller_kontrol;
alter table public.firmalar add constraint firmalar_moduller_kontrol
  check (moduller <@ '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim,gorev,bordro}'::text[]);
alter table public.firmalar alter column moduller set default '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim,gorev,bordro}';
update public.firmalar set moduller = moduller || '{bordro}'::text[]
 where moduller @> '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim,gorev}'::text[] and not ('bordro' = any (moduller));

create table if not exists public.bordro_ayarlari (
  firma_id uuid primary key references public.firmalar (id) on delete cascade,
  yasal jsonb not null default '{}'::jsonb check (jsonb_typeof(yasal) = 'object'),
  mesai_kalemleri jsonb not null default '[]'::jsonb check (jsonb_typeof(mesai_kalemleri) = 'array' and jsonb_array_length(mesai_kalemleri) <= 30),
  guncelleme timestamptz not null default now()
);
alter table public.bordro_ayarlari enable row level security;

drop policy if exists bordro_genel_yonetici on public.bordro_ayarlari;
create policy bordro_genel_yonetici on public.bordro_ayarlari for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists firma_siniri on public.bordro_ayarlari;
create policy firma_siniri on public.bordro_ayarlari as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());
drop policy if exists modul_siniri on public.bordro_ayarlari;
create policy modul_siniri on public.bordro_ayarlari as restrictive for all to authenticated
  using (public.modul_acik('bordro')) with check (public.modul_acik('bordro'));

drop trigger if exists a0_firma_doldur on public.bordro_ayarlari;
create trigger a0_firma_doldur before insert or update on public.bordro_ayarlari
  for each row execute function public.firma_doldur();
drop trigger if exists islem_gecmisi_yaz on public.bordro_ayarlari;
create trigger islem_gecmisi_yaz after insert or delete or update on public.bordro_ayarlari
  for each row execute function public.islem_gecmisi_yaz();

commit;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop table if exists public.bordro_ayarlari;
-- update public.firmalar set moduller = array_remove(moduller, 'bordro');
-- alter table public.firmalar drop constraint if exists firmalar_moduller_kontrol;
-- alter table public.firmalar add constraint firmalar_moduller_kontrol
--   check (moduller <@ '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim,gorev}'::text[]);
-- commit;
