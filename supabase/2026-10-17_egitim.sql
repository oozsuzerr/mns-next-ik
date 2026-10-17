-- Eğitim (17.10.2026)
--
-- * egitim_turleri: firmanın eğitim türleri (ör. Temel İSG eğitimi). gecerlilik_ay doluysa eğitim o kadar ay
--   sonra yenilenmelidir; zorunlu ise bütün aktif personelden beklenir. Yalnızca genel yönetici düzenler.
-- * egitim_kayitlari: personelin aldığı eğitim. Aynı oturumda (aynı gün, aynı eğitim) eğitim alanlar
--   oturum_id ile gruplanır; katılım formu bu gruptan yazdırılır.
-- * Görme: personele yetkili panel kullanıcısı. Kayıt: ayrıca "personel" yetkisi.
-- * Mobil: mobil_egitimler(token) personelin eğitimlerini ve geçerlilik tarihlerini verir.
-- Önce deneme projesinde, sonra canlıda. Uygulama kodu tablolar yokken de açılır.
-- Geri alma: dosyanın sonu.

begin;

create table if not exists public.egitim_turleri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  ad text not null check (char_length(trim(ad)) between 1 and 150),
  kategori text not null default 'Diğer' check (kategori in ('İSG', 'Mesleki', 'Hijyen', 'Yangın / ilk yardım', 'Oryantasyon', 'Diğer')),
  sure_saat numeric(5, 1) check (sure_saat is null or sure_saat > 0),
  gecerlilik_ay integer check (gecerlilik_ay is null or gecerlilik_ay between 1 and 120),
  zorunlu boolean not null default false,
  aciklama text check (aciklama is null or char_length(aciklama) <= 500),
  created_at timestamptz not null default now(),
  unique (firma_id, ad)
);
alter table public.egitim_turleri enable row level security;

drop policy if exists egitim_turu_okuma on public.egitim_turleri;
create policy egitim_turu_okuma on public.egitim_turleri for select to authenticated
  using (public.panel_kullanicisi());
drop policy if exists egitim_turu_yazma on public.egitim_turleri;
create policy egitim_turu_yazma on public.egitim_turleri for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists firma_siniri on public.egitim_turleri;
create policy firma_siniri on public.egitim_turleri as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

create table if not exists public.egitim_kayitlari (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  personel_id uuid not null references public.personeller (id) on delete cascade,
  tur_id uuid not null references public.egitim_turleri (id) on delete restrict,
  oturum_id uuid not null default gen_random_uuid(),
  tarih date not null,
  sure_saat numeric(5, 1) check (sure_saat is null or sure_saat > 0),
  egitmen text check (egitmen is null or char_length(egitmen) <= 150),
  kurum text check (kurum is null or char_length(kurum) <= 150),
  gecerlilik_bitis date,
  notlar text check (notlar is null or char_length(notlar) <= 500),
  created_at timestamptz not null default now(),
  check (gecerlilik_bitis is null or gecerlilik_bitis > tarih)
);
create index if not exists egitim_kayitlari_personel on public.egitim_kayitlari (personel_id, tarih desc);
create index if not exists egitim_kayitlari_oturum on public.egitim_kayitlari (oturum_id);
alter table public.egitim_kayitlari enable row level security;

drop policy if exists egitim_okuma on public.egitim_kayitlari;
create policy egitim_okuma on public.egitim_kayitlari for select to authenticated
  using (public.personel_yetkisi(personel_id));
drop policy if exists egitim_yazma on public.egitim_kayitlari;
create policy egitim_yazma on public.egitim_kayitlari for all to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('personel'))
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('personel'));
drop policy if exists firma_siniri on public.egitim_kayitlari;
create policy firma_siniri on public.egitim_kayitlari as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

-- Eğitim türü kaydın firmasından olmalı
create or replace function public.egitim_turu_kontrol()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.egitim_turleri t where t.id = new.tur_id and t.firma_id = new.firma_id) then
    raise exception 'FIRMA_UYUSMAZ: egitim turu';
  end if;
  return new;
end;
$function$;
revoke execute on function public.egitim_turu_kontrol() from public, anon, authenticated;

do $$
declare
  v_tablo text;
begin
  foreach v_tablo in array array['egitim_turleri', 'egitim_kayitlari'] loop
    execute format('drop trigger if exists a0_firma_doldur on public.%I', v_tablo);
    execute format('create trigger a0_firma_doldur before insert or update on public.%I for each row execute function public.firma_doldur()', v_tablo);
    execute format('drop trigger if exists islem_gecmisi_yaz on public.%I', v_tablo);
    execute format('create trigger islem_gecmisi_yaz after insert or delete or update on public.%I for each row execute function public.islem_gecmisi_yaz()', v_tablo);
  end loop;
end $$;
drop trigger if exists b_tur_kontrol on public.egitim_kayitlari;
create trigger b_tur_kontrol before insert or update on public.egitim_kayitlari
  for each row execute function public.egitim_turu_kontrol();

-- Mobil: personelin eğitimleri (her türün en son kaydı)
create or replace function public.mobil_egitimler(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
begin
  v_pid := public.oturum_personel(p_token);
  return (
    select coalesce(json_agg(x order by x.tarih desc), '[]'::json)
    from (
      select distinct on (k.tur_id) k.id, t.ad, t.kategori, k.tarih, k.sure_saat, k.gecerlilik_bitis
      from public.egitim_kayitlari k
      join public.egitim_turleri t on t.id = k.tur_id
      where k.personel_id = v_pid
      order by k.tur_id, k.tarih desc
    ) x
  );
end;
$function$;

revoke execute on function public.mobil_egitimler(text) from public;
grant execute on function public.mobil_egitimler(text) to anon, authenticated;

commit;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop function if exists public.mobil_egitimler(text);
-- drop table if exists public.egitim_kayitlari;
-- drop table if exists public.egitim_turleri;
-- drop function if exists public.egitim_turu_kontrol();
-- commit;
