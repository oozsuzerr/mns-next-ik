-- Zimmet (17.10.2026)
--
-- * zimmetler: personele teslim edilen eşya (bilgisayar, telefon, araç, anahtar, iş kıyafeti...).
--   iade_tarihi boşsa eşya hâlâ personeldedir. İade durumu: Sağlam / Hasarlı / Kayıp.
-- * Görme: personele yetkili panel kullanıcısı (genel yönetici her personeli, şube müdürü kendi şubesini).
--   Yazma: ayrıca "personel" yetkisi (genel yönetici her zaman).
-- * Mobil: mobil_zimmetler(token) personelin üzerindeki ve son iade ettiği eşyaları verir.
-- Önce deneme projesinde, sonra canlıda. Uygulama kodu tablo yokken de açılır
-- (yalnızca İK > Zimmet ve mobildeki zimmet kartı çalışmaz).
-- Geri alma: dosyanın sonu.

begin;

create table if not exists public.zimmetler (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  personel_id uuid not null references public.personeller (id) on delete cascade,
  kategori text not null check (kategori in ('Bilgisayar', 'Telefon', 'Tablet', 'Araç', 'Anahtar / kart', 'İş kıyafeti / KKD', 'Alet / ekipman', 'Diğer')),
  ad text not null check (char_length(trim(ad)) between 1 and 150),
  seri_no text check (seri_no is null or char_length(seri_no) <= 100),
  adet integer not null default 1 check (adet between 1 and 1000),
  deger numeric(12, 2) check (deger is null or deger >= 0),
  teslim_tarihi date not null default current_date,
  teslim_notu text check (teslim_notu is null or char_length(teslim_notu) <= 500),
  iade_tarihi date,
  iade_durumu text check (iade_durumu is null or iade_durumu in ('Sağlam', 'Hasarlı', 'Kayıp')),
  iade_notu text check (iade_notu is null or char_length(iade_notu) <= 500),
  created_at timestamptz not null default now(),
  check ((iade_tarihi is null) = (iade_durumu is null)),
  check (iade_tarihi is null or iade_tarihi >= teslim_tarihi)
);
create index if not exists zimmetler_personel on public.zimmetler (personel_id, teslim_tarihi desc);
create index if not exists zimmetler_firma_acik on public.zimmetler (firma_id) where iade_tarihi is null;
alter table public.zimmetler enable row level security;

drop policy if exists zimmet_okuma on public.zimmetler;
create policy zimmet_okuma on public.zimmetler for select to authenticated
  using (public.personel_yetkisi(personel_id));
drop policy if exists zimmet_yazma on public.zimmetler;
create policy zimmet_yazma on public.zimmetler for all to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('personel'))
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('personel'));
drop policy if exists firma_siniri on public.zimmetler;
create policy firma_siniri on public.zimmetler as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

drop trigger if exists a0_firma_doldur on public.zimmetler;
create trigger a0_firma_doldur before insert or update on public.zimmetler
  for each row execute function public.firma_doldur();
drop trigger if exists islem_gecmisi_yaz on public.zimmetler;
create trigger islem_gecmisi_yaz after insert or delete or update on public.zimmetler
  for each row execute function public.islem_gecmisi_yaz();

-- Mobil: üzerindeki eşyalar + son 1 yılda iade ettikleri
create or replace function public.mobil_zimmetler(p_token text)
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
    select coalesce(json_agg(x order by x.iade_tarihi nulls first, x.teslim_tarihi desc), '[]'::json)
    from (
      select z.id, z.kategori, z.ad, z.seri_no, z.adet, z.teslim_tarihi, z.iade_tarihi, z.iade_durumu
      from public.zimmetler z
      where z.personel_id = v_pid
        and (z.iade_tarihi is null or z.iade_tarihi >= current_date - 365)
      order by z.iade_tarihi nulls first, z.teslim_tarihi desc
      limit 50
    ) x
  );
end;
$function$;

revoke execute on function public.mobil_zimmetler(text) from public;
grant execute on function public.mobil_zimmetler(text) to anon, authenticated;

commit;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop function if exists public.mobil_zimmetler(text);
-- drop table if exists public.zimmetler;
-- commit;
