-- Avans ve masraf (17.10.2026)
--
-- * odeme_talepleri: personelin avans isteği ya da yaptığı masrafın geri ödenmesi.
--   Durum: BEKLEMEDE -> ONAYLANDI -> ODENDI, ya da REDDEDILDI.
--   Personel mobilden talep eder (isteğe bağlı fiş fotoğrafıyla); yönetici panelden de kayıt girebilir
--   (ör. elden verilen avans).
-- * Fişler "masraf-fisleri" gizli kovasında: <firma_id>/<personel_id>/<dosya>.
--   Mobil yükleme sunucu yolu (/api/mobil/fis) üzerinden yapılır; panel kendi yetkisiyle yükler.
-- * Görme: personele yetkili panel kullanıcısı. Onay, red, ödeme ve kayıt: ayrıca "odeme" yetkisi
--   (genel yönetici her zaman). Şube müdürüne panelden Avans ve masraf yetkisi verilebilir.
-- Önce deneme projesinde, sonra canlıda. Uygulama kodu tablo yokken de açılır.
-- Geri alma: dosyanın sonu.

begin;

create table if not exists public.odeme_talepleri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  personel_id uuid not null references public.personeller (id) on delete cascade,
  tur text not null check (tur in ('Avans', 'Masraf')),
  tutar numeric(12, 2) not null check (tutar > 0 and tutar <= 1000000),
  tarih date not null default current_date,
  kategori text check (kategori is null or kategori in ('Yol / ulaşım', 'Yemek', 'Konaklama', 'Yakıt', 'Malzeme', 'Diğer')),
  aciklama text check (aciklama is null or char_length(aciklama) <= 500),
  belge_yolu text unique,
  durum text not null default 'BEKLEMEDE' check (durum in ('BEKLEMEDE', 'ONAYLANDI', 'REDDEDILDI', 'ODENDI')),
  karar_notu text check (karar_notu is null or char_length(karar_notu) <= 300),
  karar_veren uuid,
  karar_tarihi timestamptz,
  odeme_tarihi date,
  kaynak text not null default 'panel' check (kaynak in ('panel', 'mobil')),
  created_at timestamptz not null default now(),
  check (tur = 'Masraf' or kategori is null),
  check ((durum = 'ODENDI') = (odeme_tarihi is not null))
);
create index if not exists odeme_talepleri_personel on public.odeme_talepleri (personel_id, created_at desc);
create index if not exists odeme_talepleri_bekleyen on public.odeme_talepleri (firma_id) where durum = 'BEKLEMEDE';
alter table public.odeme_talepleri enable row level security;

drop policy if exists odeme_okuma on public.odeme_talepleri;
create policy odeme_okuma on public.odeme_talepleri for select to authenticated
  using (public.personel_yetkisi(personel_id));
drop policy if exists odeme_yazma on public.odeme_talepleri;
create policy odeme_yazma on public.odeme_talepleri for all to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('odeme'))
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('odeme'));
drop policy if exists firma_siniri on public.odeme_talepleri;
create policy firma_siniri on public.odeme_talepleri as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

-- Karar veren ve zamanı panelden değil veritabanından yazılır
create or replace function public.odeme_karar_doldur()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.durum <> 'BEKLEMEDE' then
      new.karar_veren := auth.uid();
      new.karar_tarihi := now();
    end if;
  elsif new.durum is distinct from old.durum then
    new.karar_veren := auth.uid();
    new.karar_tarihi := now();
  end if;
  return new;
end;
$function$;
revoke execute on function public.odeme_karar_doldur() from public, anon, authenticated;

drop trigger if exists a0_firma_doldur on public.odeme_talepleri;
create trigger a0_firma_doldur before insert or update on public.odeme_talepleri
  for each row execute function public.firma_doldur();
drop trigger if exists b_karar_doldur on public.odeme_talepleri;
create trigger b_karar_doldur before insert or update on public.odeme_talepleri
  for each row execute function public.odeme_karar_doldur();
drop trigger if exists islem_gecmisi_yaz on public.odeme_talepleri;
create trigger islem_gecmisi_yaz after insert or delete or update on public.odeme_talepleri
  for each row execute function public.islem_gecmisi_yaz();

-- Mobil talep: avans bugün ya da ileri tarihli (en çok 60 gün), masraf en çok 60 gün önceye kadar
create or replace function public.odeme_talep_olustur(
  p_token text, p_tur text, p_tutar numeric, p_tarih date,
  p_kategori text default null, p_aciklama text default null, p_belge_yolu text default null
)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_firma uuid;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_id uuid;
begin
  v_pid := public.oturum_personel(p_token);
  select firma_id into v_firma from public.personeller where id = v_pid;

  if p_tur not in ('Avans', 'Masraf') then
    return json_build_object('ok', false, 'hata', 'TUR_GECERSIZ');
  end if;
  if p_tutar is null or p_tutar <= 0 or p_tutar > 1000000 then
    return json_build_object('ok', false, 'hata', 'TUTAR_GECERSIZ');
  end if;
  if p_tarih is null
     or (p_tur = 'Masraf' and (p_tarih > v_bugun or p_tarih < v_bugun - 60))
     or (p_tur = 'Avans' and (p_tarih < v_bugun or p_tarih > v_bugun + 60)) then
    return json_build_object('ok', false, 'hata', 'TARIH_GECERSIZ');
  end if;
  if p_tur = 'Masraf' and (p_kategori is null or p_kategori not in ('Yol / ulaşım', 'Yemek', 'Konaklama', 'Yakıt', 'Malzeme', 'Diğer')) then
    return json_build_object('ok', false, 'hata', 'KATEGORI_GECERSIZ');
  end if;
  -- Fiş yalnızca bu personelin klasöründen olabilir (sunucu yolu oraya yükler)
  if p_belge_yolu is not null and p_belge_yolu not like v_firma::text || '/' || v_pid::text || '/%' then
    return json_build_object('ok', false, 'hata', 'BELGE_GECERSIZ');
  end if;
  if (select count(*) from public.odeme_talepleri where personel_id = v_pid and durum = 'BEKLEMEDE') >= 10 then
    return json_build_object('ok', false, 'hata', 'COK_FAZLA_BEKLEYEN');
  end if;

  insert into public.odeme_talepleri (personel_id, firma_id, tur, tutar, tarih, kategori, aciklama, belge_yolu, kaynak)
  values (v_pid, v_firma, p_tur, round(p_tutar, 2), p_tarih,
          case when p_tur = 'Masraf' then p_kategori end,
          nullif(left(trim(coalesce(p_aciklama, '')), 500), ''), p_belge_yolu, 'mobil')
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end;
$function$;

create or replace function public.mobil_odemeler(p_token text)
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
    select coalesce(json_agg(x order by x.created_at desc), '[]'::json)
    from (
      select o.id, o.tur, o.tutar, o.tarih, o.kategori, o.aciklama, o.durum, o.karar_notu, o.odeme_tarihi,
             o.belge_yolu is not null as fis_var, o.created_at
      from public.odeme_talepleri o
      where o.personel_id = v_pid
      order by o.created_at desc
      limit 15
    ) x
  );
end;
$function$;

revoke execute on function public.odeme_talep_olustur(text, text, numeric, date, text, text, text) from public;
revoke execute on function public.mobil_odemeler(text) from public;
grant execute on function public.odeme_talep_olustur(text, text, numeric, date, text, text, text) to anon, authenticated;
grant execute on function public.mobil_odemeler(text) to anon, authenticated;

-- Fiş deposu
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('masraf-fisleri', 'masraf-fisleri', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists masraf_fisleri_okuma on storage.objects;
create policy masraf_fisleri_okuma on storage.objects for select to authenticated
  using (
    bucket_id = 'masraf-fisleri'
    and (storage.foldername(name))[1] = public.aktif_firma_id()::text
    and public.personel_yetkisi(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists masraf_fisleri_yukleme on storage.objects;
create policy masraf_fisleri_yukleme on storage.objects for insert to authenticated
  with check (
    bucket_id = 'masraf-fisleri'
    and public.yetkisi_var('odeme')
    and (storage.foldername(name))[1] = public.aktif_firma_id()::text
    and public.personel_yetkisi(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists masraf_fisleri_silme on storage.objects;
create policy masraf_fisleri_silme on storage.objects for delete to authenticated
  using (
    bucket_id = 'masraf-fisleri'
    and public.yetkisi_var('odeme')
    and (storage.foldername(name))[1] = public.aktif_firma_id()::text
    and public.personel_yetkisi(((storage.foldername(name))[2])::uuid)
  );

-- Şube müdürüne "odeme" (Avans ve masraf) yetkisi verilebilsin: izinli yetki listesine eklenir
-- (gövde 2026-10-16_firma_2_sinir.sql ile aynı, yalnızca liste değişti)
create or replace function public.yonetici_kaydet(p_eposta text, p_ad text, p_rol text, p_subeler uuid[], p_yetkiler text[] default '{}'::text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_firma uuid := public.aktif_firma_id();
begin
  if not public.is_admin() then
    raise exception 'YETKISIZ';
  end if;
  if p_rol not in ('GENEL', 'SUBE') then
    raise exception 'ROL_GECERSIZ';
  end if;
  if p_rol = 'SUBE' and coalesce(array_length(p_subeler, 1), 0) = 0 then
    raise exception 'SUBE_SECILMELI';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_yetkiler, '{}')) y
    where y not in ('plan', 'izin', 'mesai', 'manuel', 'cihaz', 'pin', 'personel', 'rapor', 'odeme')
  ) then
    raise exception 'YETKI_GECERSIZ';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_subeler, '{}')) s
    where not exists (select 1 from public.subeler x where x.id = s and x.firma_id = v_firma)
  ) then
    raise exception 'SUBE_GECERSIZ';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_eposta));
  if v_uid is null then
    raise exception 'KULLANICI_YOK';
  end if;
  if v_uid = auth.uid() and p_rol <> 'GENEL' then
    raise exception 'KENDINI_DEGISTIREMEZ';
  end if;
  -- Bir kullanıcı tek firmaya bağlıdır
  if exists (select 1 from public.yoneticiler where user_id = v_uid and firma_id <> v_firma) then
    raise exception 'BASKA_FIRMADA';
  end if;

  insert into public.yoneticiler (user_id, rol, ad, yetkiler, firma_id)
  values (
    v_uid, p_rol, nullif(trim(coalesce(p_ad, '')), ''),
    case when p_rol = 'SUBE' then coalesce(p_yetkiler, '{}') else '{}' end,
    v_firma
  )
  on conflict (user_id) do update
    set rol = excluded.rol, ad = excluded.ad, yetkiler = excluded.yetkiler;

  delete from public.yonetici_subeleri where user_id = v_uid;
  if p_rol = 'SUBE' then
    insert into public.yonetici_subeleri (user_id, sube_id)
    select v_uid, s from unnest(p_subeler) as s
    on conflict do nothing;
  end if;
end;
$function$;

commit;

-- =====================================================================
-- GERİ ALMA (fişler Storage'da kalır)
-- =====================================================================
-- begin;
-- drop policy if exists masraf_fisleri_okuma on storage.objects;
-- drop policy if exists masraf_fisleri_yukleme on storage.objects;
-- drop policy if exists masraf_fisleri_silme on storage.objects;
-- drop function if exists public.mobil_odemeler(text);
-- drop function if exists public.odeme_talep_olustur(text, text, numeric, date, text, text, text);
-- drop table if exists public.odeme_talepleri;
-- drop function if exists public.odeme_karar_doldur();
-- commit;
