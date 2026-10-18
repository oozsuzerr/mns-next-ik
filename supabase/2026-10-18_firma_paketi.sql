-- Firma paketi: açık modüller ve personel sınırı (18.10.2026)
--
-- * firmalar.moduller: firmanın kullanabildiği İK modülleri. Mevcut firmalarda hepsi açık kalır;
--   yeni firmada sistem yöneticisi seçer. Kapalı modülün tablolarına panelden erişilemez
--   (kısıtlayıcı "modul_siniri" kuralı), panelde ve mobilde görünmez.
-- * firmalar.personel_limit: aktif personel sınırı (boş = sınırsız). Sınır doluyken yeni personel
--   eklenemez ve pasif personel aktifleştirilemez (PERSONEL_LIMITI hatası).
-- * sistem_firma_paket: sistem yöneticisi modülleri ve sınırı değiştirir.
-- * firma_paketi: panel kendi firmasının paketini okur. mobil_moduller: mobil açık modülleri okur.
-- Önce deneme projesinde, sonra canlıda. Uygulama kodundan ÖNCE çalıştırılmalı.
-- Geri alma: dosyanın sonu.

begin;

alter table public.firmalar add column if not exists moduller text[] not null
  default '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim}';
alter table public.firmalar add column if not exists personel_limit integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'firmalar_moduller_kontrol') then
    alter table public.firmalar add constraint firmalar_moduller_kontrol
      check (moduller <@ '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim}'::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'firmalar_personel_limit_kontrol') then
    alter table public.firmalar add constraint firmalar_personel_limit_kontrol
      check (personel_limit is null or personel_limit between 1 and 100000);
  end if;
end $$;

-- Panel kullanıcısının firmasında modül açık mı
create or replace function public.modul_acik(p_modul text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select p_modul = any (f.moduller) from public.firmalar f where f.id = public.aktif_firma_id()), false);
$function$;

-- Kapalı modülün tablolarına erişim yok (diğer kurallara ek, kısıtlayıcı)
do $$
declare
  v_satir text[];
begin
  foreach v_satir slice 1 in array array[
    ['duyurular', 'duyuru'], ['duyuru_okumalar', 'duyuru'],
    ['zimmetler', 'zimmet'],
    ['odeme_talepleri', 'odeme'],
    ['kontrol_sablonlari', 'kontrol'], ['kontrol_listeleri', 'kontrol'], ['kontrol_maddeleri', 'kontrol'],
    ['egitim_turleri', 'egitim'], ['egitim_kayitlari', 'egitim'],
    ['performans_kriterleri', 'performans'], ['performans_donemleri', 'performans'], ['performans_degerlendirmeleri', 'performans'],
    ['ise_alim_ilanlari', 'isealim'], ['adaylar', 'isealim'], ['aday_gorusmeleri', 'isealim']
  ] loop
    if to_regclass('public.' || v_satir[1]) is not null then
      execute format('drop policy if exists modul_siniri on public.%I', v_satir[1]);
      execute format('create policy modul_siniri on public.%I as restrictive for all to authenticated
        using (public.modul_acik(%L)) with check (public.modul_acik(%L))', v_satir[1], v_satir[2], v_satir[2]);
    end if;
  end loop;
end $$;

-- Personel sınırı: aktif personel sayısı sınırı aşamaz (yeni kayıt ya da pasiften aktife alma)
create or replace function public.personel_limiti_kontrol()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_limit integer;
  v_sayi integer;
begin
  if not new.aktif or (tg_op = 'UPDATE' and old.aktif and old.firma_id = new.firma_id) then
    return new;
  end if;
  -- Aynı firmaya eşzamanlı eklemeler sırayla denetlensin
  select personel_limit into v_limit from public.firmalar where id = new.firma_id for update;
  if v_limit is null then
    return new;
  end if;
  select count(*) into v_sayi from public.personeller
   where firma_id = new.firma_id and aktif and id <> new.id;
  if v_sayi >= v_limit then
    raise exception 'PERSONEL_LIMITI: %', v_limit using hint = 'Paketinizdeki personel sınırına ulaşıldı.';
  end if;
  return new;
end;
$function$;
revoke execute on function public.personel_limiti_kontrol() from public, anon, authenticated;

drop trigger if exists b_personel_limiti on public.personeller;
create trigger b_personel_limiti before insert or update of aktif, firma_id on public.personeller
  for each row execute function public.personel_limiti_kontrol();

-- Panel: kendi firmasının paketi
create or replace function public.firma_paketi()
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select json_build_object(
    'moduller', f.moduller,
    'personel_limit', f.personel_limit,
    'aktif_personel', (select count(*) from public.personeller p where p.firma_id = f.id and p.aktif)
  )
  from public.firmalar f
  where f.id = public.aktif_firma_id();
$function$;

-- Mobil: personelin firmasında açık modüller
create or replace function public.mobil_moduller(p_token text)
 returns text[]
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
begin
  v_pid := public.oturum_personel(p_token);
  return (select f.moduller from public.personeller p join public.firmalar f on f.id = p.firma_id where p.id = v_pid);
end;
$function$;

-- Sistem yöneticisi: modülleri ve sınırı değiştirir
create or replace function public.sistem_firma_paket(p_firma_id uuid, p_moduller text[], p_personel_limit integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.sistem_yoneticisi() then
    raise exception 'YETKISIZ';
  end if;
  update public.firmalar
     set moduller = coalesce(p_moduller, '{}'), personel_limit = p_personel_limit
   where id = p_firma_id;
  if not found then
    raise exception 'FIRMA_YOK';
  end if;
end;
$function$;

-- Sistem yöneticisi firma listesi: paket bilgisi eklendi (gövde 2026-10-16_firma_3_sistem.sql ile aynı)
create or replace function public.sistem_firma_listesi()
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.sistem_yoneticisi() then
    raise exception 'YETKISIZ';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'id', f.id,
      'ad', f.ad,
      'kod', f.kod,
      'aktif', f.aktif,
      'created_at', f.created_at,
      'moduller', f.moduller,
      'personel_limit', f.personel_limit,
      'personel', (select count(*) from public.personeller p where p.firma_id = f.id and p.aktif),
      'sube', (select count(*) from public.subeler s where s.firma_id = f.id),
      'yoneticiler', coalesce((
        select json_agg(json_build_object('eposta', u.email, 'rol', y.rol, 'son_giris', u.last_sign_in_at) order by y.rol, u.email)
        from public.yoneticiler y
        left join auth.users u on u.id = y.user_id
        where y.firma_id = f.id
      ), '[]'::json)
    ) order by f.created_at), '[]'::json)
    from public.firmalar f
  );
end;
$function$;

-- Mobil avans/masraf: modül kapalıysa talep alınmaz (gövde 2026-10-17_avans_masraf.sql ile aynı, yalnızca
-- modül denetimi eklendi)
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

  if not exists (select 1 from public.firmalar where id = v_firma and 'odeme' = any (moduller)) then
    return json_build_object('ok', false, 'hata', 'MODUL_KAPALI');
  end if;
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

revoke execute on function public.modul_acik(text) from public, anon;
revoke execute on function public.firma_paketi() from public, anon;
revoke execute on function public.sistem_firma_paket(uuid, text[], integer) from public, anon;
revoke execute on function public.mobil_moduller(text) from public;
grant execute on function public.modul_acik(text) to authenticated;
grant execute on function public.firma_paketi() to authenticated;
grant execute on function public.sistem_firma_paket(uuid, text[], integer) to authenticated;
grant execute on function public.mobil_moduller(text) to anon, authenticated;

commit;

-- =====================================================================
-- GERİ ALMA (modül kuralları ve sınır kalkar; sütunlar kalabilir)
-- =====================================================================
-- begin;
-- drop trigger if exists b_personel_limiti on public.personeller;
-- do $$ declare t text; begin
--   foreach t in array array['duyurular','duyuru_okumalar','zimmetler','odeme_talepleri','kontrol_sablonlari',
--     'kontrol_listeleri','kontrol_maddeleri','egitim_turleri','egitim_kayitlari','performans_kriterleri',
--     'performans_donemleri','performans_degerlendirmeleri','ise_alim_ilanlari','adaylar','aday_gorusmeleri'] loop
--     execute format('drop policy if exists modul_siniri on public.%I', t);
--   end loop; end $$;
-- commit;
