-- Maaş hesabı eksikleri (18.10.2026)
--
-- * ek_kazanclar: personelin aylık prim, ikramiye, yol, yemek gibi ek ödemeleri. donem "2026-10" biçiminde.
--   vergili = true ise brüte eklenir (SGK ve vergiye tabi), false ise netten sonra eklenir (ör. yol/yemek bedeli).
--   Ücret bilgisi gibi yalnızca genel yönetici görür ve yazar; "bordro" modülü kapalıysa erişilemez.
-- * personel_ozluk.ucret_turu: "Haftalık brüt" eklendi.
-- Önce deneme projesinde, sonra canlıda. Önkoşul: 2026-10-18_bordro.sql ve 2026-10-17_ozluk_belge.sql.
-- Tekrar çalıştırılabilir. Geri alma: dosyanın sonu.

begin;

create table if not exists public.ek_kazanclar (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id) on delete cascade,
  personel_id uuid not null references public.personeller (id) on delete cascade,
  donem text not null check (donem ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  tur text not null check (char_length(btrim(tur)) between 1 and 60),
  tutar numeric(12, 2) not null check (tutar > 0 and tutar < 100000000),
  vergili boolean not null default true,
  aciklama text check (aciklama is null or char_length(aciklama) <= 300),
  olusturma timestamptz not null default now()
);
create index if not exists ek_kazanclar_donem on public.ek_kazanclar (firma_id, donem);
alter table public.ek_kazanclar enable row level security;

drop policy if exists ek_kazanc_genel_yonetici on public.ek_kazanclar;
create policy ek_kazanc_genel_yonetici on public.ek_kazanclar for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists firma_siniri on public.ek_kazanclar;
create policy firma_siniri on public.ek_kazanclar as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());
drop policy if exists modul_siniri on public.ek_kazanclar;
create policy modul_siniri on public.ek_kazanclar as restrictive for all to authenticated
  using (public.modul_acik('bordro')) with check (public.modul_acik('bordro'));

drop trigger if exists a0_firma_doldur on public.ek_kazanclar;
create trigger a0_firma_doldur before insert or update on public.ek_kazanclar
  for each row execute function public.firma_doldur();
drop trigger if exists islem_gecmisi_yaz on public.ek_kazanclar;
create trigger islem_gecmisi_yaz after insert or delete or update on public.ek_kazanclar
  for each row execute function public.islem_gecmisi_yaz();

-- Haftalık ücret türü
do $$
declare
  v_ad text;
begin
  if to_regclass('public.personel_ozluk') is null then
    return;
  end if;
  for v_ad in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.personel_ozluk'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%ucret_turu%'
  loop
    execute format('alter table public.personel_ozluk drop constraint %I', v_ad);
  end loop;
  alter table public.personel_ozluk add constraint personel_ozluk_ucret_turu_check
    check (ucret_turu is null or ucret_turu in ('Aylık brüt', 'Aylık net', 'Haftalık brüt', 'Günlük brüt', 'Saatlik brüt'));
end;
$$;

commit;

-- Kontrol:
-- select count(*) from public.ek_kazanclar;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop table if exists public.ek_kazanclar;
-- update public.personel_ozluk set ucret_turu = 'Aylık brüt' where ucret_turu = 'Haftalık brüt';
-- alter table public.personel_ozluk drop constraint if exists personel_ozluk_ucret_turu_check;
-- alter table public.personel_ozluk add constraint personel_ozluk_ucret_turu_check
--   check (ucret_turu is null or ucret_turu in ('Aylık brüt', 'Aylık net', 'Günlük brüt', 'Saatlik brüt'));
-- commit;
