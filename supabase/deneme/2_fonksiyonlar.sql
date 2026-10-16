-- DENEME PROJESİ KURULUMU 2/4: fonksiyonlar, tetikleyiciler, çalıştırma yetkileri
-- Canlı şema dökümünden (16.10.2026) aktarıldı. CANLI VERİTABANINDA ÇALIŞTIRMAYIN.

begin;

-- =====================================================================
-- Yetki yardımcıları
-- =====================================================================
create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.yoneticiler where user_id = auth.uid() and rol = 'GENEL');
$function$;

create or replace function public.panel_kullanicisi()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.yoneticiler where user_id = auth.uid());
$function$;

create or replace function public.sube_yetkisi(p_sube_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.is_admin()
      or exists (
        select 1 from public.yonetici_subeleri ys
        join public.yoneticiler y on y.user_id = ys.user_id and y.rol = 'SUBE'
        where ys.user_id = auth.uid() and ys.sube_id = p_sube_id
      );
$function$;

create or replace function public.personel_yetkisi(p_personel_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.is_admin()
      or exists (
        select 1 from public.personeller p
        join public.yonetici_subeleri ys on ys.sube_id = p.varsayilan_sube_id
        join public.yoneticiler y on y.user_id = ys.user_id and y.rol = 'SUBE'
        where p.id = p_personel_id and ys.user_id = auth.uid()
      );
$function$;

create or replace function public.yetkisi_var(p_yetki text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.is_admin()
      or exists (
        select 1 from public.yoneticiler
        where user_id = auth.uid() and rol = 'SUBE' and p_yetki = any (yetkiler)
      );
$function$;

-- =====================================================================
-- Mobil oturum
-- =====================================================================
create or replace function public.oturum_personel(p_token text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  select o.personel_id into v_id
  from public.mobil_oturumlar o
  join public.personeller p on p.id = o.personel_id
  where o.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and o.expires_at > now()
    and p.aktif = true;

  if v_id is null then
    raise exception 'OTURUM_GECERSIZ';
  end if;
  return v_id;
end;
$function$;

create or replace function public.oturum_kapat(p_token text)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  delete from public.mobil_oturumlar
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$function$;

create or replace function public._pin_dogrula(p_tc text, p_pin text, out o_id uuid, out o_cihaz text, out o_hata text)
 returns record
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  p public.personeller%rowtype;
begin
  if p_tc is null or p_pin is null then
    o_hata := 'GIRIS_HATALI';
    return;
  end if;

  select * into p
  from public.personeller
  where tc_kimlik = trim(p_tc) and aktif = true
  limit 1;

  if not found then
    o_hata := 'GIRIS_HATALI';
    return;
  end if;

  -- Kilit süresi dolduysa sayaçları sıfırla
  if p.kilit_bitis is not null and p.kilit_bitis <= now() then
    update public.personeller set pin_hatali = 0, kilit_bitis = null where id = p.id;
    p.pin_hatali := 0;
    p.kilit_bitis := null;
  end if;

  if p.kilit_bitis is not null and p.kilit_bitis > now() then
    o_hata := 'HESAP_KILITLI';
    return;
  end if;

  if p.pin_hash is null then
    o_hata := 'PIN_TANIMSIZ';
    return;
  end if;

  if p.pin_hash <> crypt(p_pin, p.pin_hash) then
    update public.personeller
       set pin_hatali = pin_hatali + 1,
           kilit_bitis = case when pin_hatali + 1 >= 5 then now() + interval '15 minutes' else kilit_bitis end
     where id = p.id;
    o_hata := 'GIRIS_HATALI';
    return;
  end if;

  o_id := p.id;
  o_cihaz := p.cihaz_id;
end;
$function$;

create or replace function public.personel_giris(p_tc text, p_pin text, p_cihaz text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  d record;
  p public.personeller%rowtype;
  v_token text;
  v_talep json;
begin
  if p_tc is null or p_pin is null or p_cihaz is null or length(p_cihaz) < 8 then
    return json_build_object('ok', false, 'hata', 'GIRIS_HATALI');
  end if;

  select * into d from public._pin_dogrula(p_tc, p_pin);
  if d.o_hata is not null then
    return json_build_object('ok', false, 'hata', d.o_hata);
  end if;
  select * into p from public.personeller where id = d.o_id;

  -- Cihaz kilidi: ilk girişte cihaz bağlanır, sonra sadece o cihaz girebilir
  if p.cihaz_id is distinct from p_cihaz then
    -- Bir telefon bir personel: bu telefon başka bir aktif personele kayıtlıysa giriş yok
    if exists (select 1 from public.personeller where cihaz_id = p_cihaz and id <> p.id and aktif) then
      return json_build_object('ok', false, 'hata', 'CIHAZ_BASKASINDA');
    end if;

    if p.cihaz_id is not null then
      -- Bu telefondan gönderilmiş son talep (ekranda durumunu göstermek için)
      select json_build_object('id', t.id, 'durum', t.durum) into v_talep
        from public.cihaz_talepleri t
       where t.personel_id = p.id and t.cihaz_id = p_cihaz and t.created_at > now() - interval '7 days'
       order by t.created_at desc
       limit 1;
      return json_build_object('ok', false, 'hata', 'CIHAZ_KILITLI', 'talep', v_talep);
    end if;

    update public.personeller set cihaz_id = p_cihaz where id = p.id;
    -- Kilit elle açılıp yeni telefon bağlandıysa bekleyen talep anlamını yitirir
    update public.cihaz_talepleri set durum = 'IPTAL' where personel_id = p.id and durum = 'BEKLEMEDE';
  end if;

  update public.personeller set pin_hatali = 0, kilit_bitis = null where id = p.id;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.mobil_oturumlar (token_hash, personel_id, cihaz_id, expires_at)
  values (
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    p.id,
    p_cihaz,
    now() + interval '30 days'
  );

  delete from public.mobil_oturumlar where expires_at < now();

  return json_build_object(
    'ok', true,
    'token', v_token,
    'personel', json_build_object(
      'id', p.id, 'sicil_no', p.sicil_no, 'ad', p.ad, 'soyad', p.soyad, 'departman', p.departman
    )
  );
end;
$function$;

-- =====================================================================
-- Cihaz kilidi ve talepleri
-- =====================================================================
create or replace function public.cihaz_sifirla(p_personel_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not (public.personel_yetkisi(p_personel_id) and public.yetkisi_var('cihaz')) then
    raise exception 'YETKISIZ';
  end if;

  perform set_config('mns.korumali_islem', '1', true);
  update public.personeller set cihaz_id = null where id = p_personel_id;
  delete from public.mobil_oturumlar where personel_id = p_personel_id;
end;
$function$;

create or replace function public.cihaz_talebi_durum(p_talep_id uuid, p_cihaz text)
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select json_build_object('ok', true, 'durum', durum)
       from public.cihaz_talepleri
      where id = p_talep_id and cihaz_id = p_cihaz),
    json_build_object('ok', false, 'hata', 'TALEP_YOK')
  );
$function$;

create or replace function public.cihaz_talebi_karar(p_talep_id uuid, p_onay boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  t public.cihaz_talepleri%rowtype;
begin
  select * into t from public.cihaz_talepleri where id = p_talep_id for update;
  if not found then
    raise exception 'TALEP_YOK';
  end if;
  if not (public.personel_yetkisi(t.personel_id) and public.yetkisi_var('cihaz')) then
    raise exception 'YETKISIZ';
  end if;
  if t.durum <> 'BEKLEMEDE' then
    raise exception 'TALEP_SONUCLANMIS';
  end if;

  if p_onay then
    if exists (select 1 from public.personeller where cihaz_id = t.cihaz_id and id <> t.personel_id and aktif) then
      raise exception 'CIHAZ_BASKASINDA';
    end if;
    perform set_config('mns.korumali_islem', '1', true);
    update public.personeller set cihaz_id = t.cihaz_id where id = t.personel_id;
    -- Eski telefondaki oturum kapanır
    delete from public.mobil_oturumlar where personel_id = t.personel_id;
  end if;

  update public.cihaz_talepleri
     set durum = case when p_onay then 'ONAYLANDI' else 'REDDEDILDI' end,
         karar_veren = auth.uid(),
         karar_zamani = now()
   where id = t.id;
end;
$function$;

create or replace function public.cihaz_talebi_olustur(p_tc text, p_pin text, p_cihaz text, p_bilgi text default null::text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  d record;
  v_kayitli text;
  v_mevcut public.cihaz_talepleri%rowtype;
  v_id uuid;
begin
  if p_cihaz is null or length(p_cihaz) < 8 or length(p_cihaz) > 100 then
    return json_build_object('ok', false, 'hata', 'GIRIS_HATALI');
  end if;

  select * into d from public._pin_dogrula(p_tc, p_pin);
  if d.o_hata is not null then
    return json_build_object('ok', false, 'hata', d.o_hata);
  end if;
  v_kayitli := d.o_cihaz;

  -- Kayıtlı telefon yoksa ya da zaten bu telefonsa talebe gerek yok, doğrudan giriş yapılır
  if v_kayitli is null or v_kayitli = p_cihaz then
    return json_build_object('ok', false, 'hata', 'TALEP_GEREKSIZ');
  end if;
  if exists (select 1 from public.personeller where cihaz_id = p_cihaz and id <> d.o_id and aktif) then
    return json_build_object('ok', false, 'hata', 'CIHAZ_BASKASINDA');
  end if;

  select * into v_mevcut from public.cihaz_talepleri where personel_id = d.o_id and durum = 'BEKLEMEDE';
  if found and v_mevcut.cihaz_id = p_cihaz then
    return json_build_object('ok', true, 'talep_id', v_mevcut.id, 'yeni', false);
  end if;

  -- Kötüye kullanım sınırı: günde en fazla 5 talep
  if (select count(*) from public.cihaz_talepleri
       where personel_id = d.o_id and created_at > now() - interval '1 day') >= 5 then
    return json_build_object('ok', false, 'hata', 'COK_FAZLA_TALEP');
  end if;

  -- Başka telefondan bekleyen talep varsa yenisi onun yerine geçer
  update public.cihaz_talepleri set durum = 'IPTAL' where personel_id = d.o_id and durum = 'BEKLEMEDE';
  insert into public.cihaz_talepleri (personel_id, cihaz_id, cihaz_bilgisi)
  values (d.o_id, p_cihaz, nullif(left(trim(coalesce(p_bilgi, '')), 80), ''))
  returning id into v_id;

  return json_build_object('ok', true, 'talep_id', v_id, 'yeni', true);
end;
$function$;

-- =====================================================================
-- Giriş/çıkış
-- =====================================================================
create or replace function public.hareket_kaydet(p_token text, p_islem text, p_enlem double precision, p_boylam double precision, p_dogruluk double precision default null::double precision)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_sube record;
  v_mesafe integer;
begin
  v_pid := public.oturum_personel(p_token);

  if p_islem is null or p_islem not in ('İşe Giriş', 'İşe Çıkış') then
    return json_build_object('ok', false, 'hata', 'ISLEM_GECERSIZ');
  end if;

  if p_enlem is null or p_boylam is null
     or p_enlem < -90 or p_enlem > 90 or p_boylam < -180 or p_boylam > 180 then
    return json_build_object('ok', false, 'hata', 'KONUM_GECERSIZ');
  end if;

  if p_dogruluk is not null and p_dogruluk > 200 then
    return json_build_object('ok', false, 'hata', 'GPS_ZAYIF');
  end if;

  select s.id, s.ad,
         coalesce(s.limit_metre::double precision, 100) as limit_m,
         6371000 * 2 * asin(least(1, sqrt(
           power(sin(radians((s.enlem::double precision - p_enlem) / 2)), 2) +
           cos(radians(p_enlem)) * cos(radians(s.enlem::double precision)) *
           power(sin(radians((s.boylam::double precision - p_boylam) / 2)), 2)
         ))) as mesafe
    into v_sube
    from public.subeler s
   order by mesafe asc
   limit 1;

  if not found then
    return json_build_object('ok', false, 'hata', 'SUBE_YOK');
  end if;

  v_mesafe := round(v_sube.mesafe)::integer;

  if v_mesafe > v_sube.limit_m then
    return json_build_object(
      'ok', false, 'hata', 'SINIR_DISI',
      'sube', v_sube.ad, 'mesafe', v_mesafe, 'limit', round(v_sube.limit_m)
    );
  end if;

  -- Çift tıklama koruması
  if exists (
    select 1 from public.hareketler
    where personel_id = v_pid and islem_turu = p_islem
      and created_at > now() - interval '2 minutes'
  ) then
    return json_build_object('ok', false, 'hata', 'TEKRAR');
  end if;

  insert into public.hareketler
    (personel_id, sube_id, islem_turu, enlem, boylam, mesafe_metre, durum_notu, manuel, created_at)
  values
    (v_pid, v_sube.id, p_islem, p_enlem, p_boylam, v_mesafe, 'Normal', false, now());

  return json_build_object('ok', true, 'sube', v_sube.ad, 'mesafe', v_mesafe, 'islem', p_islem);
end;
$function$;

-- =====================================================================
-- İzinler
-- =====================================================================
create or replace function public.izin_gun_sayisi(p_personel_id uuid, p_bas date, p_bit date)
 returns integer
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select count(*)::integer
  from generate_series(p_bas, p_bit, interval '1 day') as g(gun)
  where not exists (select 1 from public.resmi_tatiller t where t.tarih = g.gun::date)
    and not (
      exists (
        select 1 from public.vardiya_plani v
        where v.personel_id = p_personel_id and v.tarih = g.gun::date and v.tur = 'TATIL'
      )
      or (
        extract(isodow from g.gun) = 7
        and not exists (select 1 from public.vardiya_plani v where v.personel_id = p_personel_id and v.tarih = g.gun::date)
      )
    );
$function$;

create or replace function public.izin_gun_hesapla()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_gun_dk integer;
begin
  if new.izin_turu = 'Saatlik İzin' then
    if new.baslangic_saat is null or new.bitis_saat is null or new.bitis_saat <= new.baslangic_saat then
      raise exception 'SAAT_GECERSIZ';
    end if;
    new.bitis_tarihi := new.baslangic_tarihi;
    select izin_gunu_dk into v_gun_dk from public.sirket_ayarlari where id;
    new.gun_sayisi := round((extract(epoch from (new.bitis_saat - new.baslangic_saat)) / 60.0) / coalesce(v_gun_dk, 450), 2);
  else
    new.baslangic_saat := null;
    new.bitis_saat := null;
    new.gun_sayisi := public.izin_gun_sayisi(new.personel_id, new.baslangic_tarihi, new.bitis_tarihi);
  end if;
  return new;
end;
$function$;

create or replace function public._yillik_izin_hesapla(p_personel_id uuid)
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_p record;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_baslangic date;
  v_yd date;
  v_gun integer;
  v_yas integer;
  v_hak numeric := 0;
  v_kidem integer := 0;
  v_sonraki date;
  v_sonraki_gun integer;
  v_kullanilan numeric;
  v_bekleyen numeric;
begin
  select ise_giris_tarihi, dogum_tarihi, devreden_izin_gun, devir_tarihi into v_p
  from public.personeller where id = p_personel_id;

  if v_p.ise_giris_tarihi is null then
    return json_build_object('tanimli', false);
  end if;

  -- Devir tarihi varsa hak ve kullanım o tarihten sonrası sayılır; öncesi devreden gündedir
  v_baslangic := coalesce(v_p.devir_tarihi, v_p.ise_giris_tarihi);

  for y in 1..80 loop
    v_yd := (v_p.ise_giris_tarihi + make_interval(years => y))::date;
    v_gun := case when y <= 5 then 14 when y < 15 then 20 else 26 end;
    if v_p.dogum_tarihi is not null then
      v_yas := extract(year from age(v_yd, v_p.dogum_tarihi))::integer;
      if v_yas <= 18 or v_yas >= 50 then
        v_gun := greatest(v_gun, 20);
      end if;
    end if;

    if v_yd > v_bugun then
      v_sonraki := v_yd;
      v_sonraki_gun := v_gun;
      exit;
    end if;

    v_kidem := y;
    if v_yd > v_baslangic then
      v_hak := v_hak + v_gun;
    end if;
  end loop;

  select coalesce(sum(gun_sayisi) filter (where coalesce(durum, 'ONAYLANDI') = 'ONAYLANDI'), 0),
         coalesce(sum(gun_sayisi) filter (where durum = 'BEKLEMEDE'), 0)
    into v_kullanilan, v_bekleyen
    from public.izinler
   where personel_id = p_personel_id
     and izin_turu in ('Yıllık İzin', 'Saatlik İzin')
     and baslangic_tarihi >= v_baslangic;

  return json_build_object(
    'tanimli', true,
    'kidem_yil', v_kidem,
    'devreden', v_p.devreden_izin_gun,
    'hak_edilen', v_hak,
    'kullanilan', v_kullanilan,
    'bekleyen', v_bekleyen,
    'kalan', v_p.devreden_izin_gun + v_hak - v_kullanilan,
    'sonraki_hak_tarihi', v_sonraki,
    'sonraki_hak_gun', v_sonraki_gun
  );
end;
$function$;

create or replace function public.izin_bakiyeleri()
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(json_object_agg(p.id, public._yillik_izin_hesapla(p.id)), '{}'::json)
  from public.personeller p
  where public.panel_kullanicisi() and public.personel_yetkisi(p.id);
$function$;

create or replace function public.izin_talep_olustur(p_token text, p_tur text, p_baslangic date, p_bitis date, p_aciklama text default null::text, p_baslangic_saat time without time zone default null::time without time zone, p_bitis_saat time without time zone default null::time without time zone)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_kod text;
begin
  v_pid := public.oturum_personel(p_token);

  if p_tur not in ('Raporlu / İstirahat', 'Yıllık İzin', 'Mazeret İzni', 'Ücretsiz İzin', 'Saatlik İzin') then
    return json_build_object('ok', false, 'hata', 'TUR_GECERSIZ');
  end if;

  if p_baslangic is null or p_bitis is null or p_bitis < p_baslangic or (p_bitis - p_baslangic) > 90 then
    return json_build_object('ok', false, 'hata', 'TARIH_GECERSIZ');
  end if;

  if p_tur = 'Saatlik İzin' and (p_baslangic_saat is null or p_bitis_saat is null or p_bitis_saat <= p_baslangic_saat) then
    return json_build_object('ok', false, 'hata', 'SAAT_GECERSIZ');
  end if;

  v_kod := case p_tur
    when 'Raporlu / İstirahat' then '01 - İstirahat / Sağlık Raporu'
    when 'Yıllık İzin' then 'Ücretli İzin'
    when 'Saatlik İzin' then 'Ücretli İzin'
    when 'Ücretsiz İzin' then '05 - Ücretsiz İzin'
    else '13 - Diğer Nedenler'
  end;

  insert into public.izinler
    (personel_id, izin_turu, sgk_kodu, baslangic_tarihi, bitis_tarihi, baslangic_saat, bitis_saat, aciklama, durum)
  values
    (v_pid, p_tur, v_kod, p_baslangic, case when p_tur = 'Saatlik İzin' then p_baslangic else p_bitis end,
     case when p_tur = 'Saatlik İzin' then p_baslangic_saat end,
     case when p_tur = 'Saatlik İzin' then p_bitis_saat end,
     coalesce(nullif(left(trim(coalesce(p_aciklama, '')), 300), ''), 'Mobil personel talebi'),
     'BEKLEMEDE');

  return json_build_object('ok', true);
end;
$function$;

-- =====================================================================
-- Fazla mesai
-- =====================================================================
create or replace function public.mesai_talebi_hazirla()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_dk integer;
begin
  v_dk := (extract(epoch from (new.bitis_saat - new.baslangic_saat)) / 60)::integer;
  if v_dk <= 0 then
    v_dk := v_dk + 1440;
  end if;
  if v_dk < 15 or v_dk > 960 then
    raise exception 'SURE_GECERSIZ';
  end if;
  new.sure_dk := v_dk;
  new.neden := left(trim(coalesce(new.neden, '')), 300);
  if length(new.neden) < 3 then
    raise exception 'NEDEN_GEREKLI';
  end if;

  if tg_op = 'UPDATE' and new.durum is distinct from old.durum then
    new.karar_veren := auth.uid();
    new.karar_zamani := now();
  end if;
  return new;
end;
$function$;

create or replace function public.mesai_talep_olustur(p_token text, p_tarih date, p_baslangic_saat time without time zone, p_bitis_saat time without time zone, p_neden text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_bas timestamp;
  v_bit timestamp;
begin
  v_pid := public.oturum_personel(p_token);

  -- Yapılmış mesai bildirilir: bugün ya da en çok 31 gün öncesi
  if p_tarih is null or p_tarih > v_bugun or p_tarih < v_bugun - 31 then
    return json_build_object('ok', false, 'hata', 'TARIH_GECERSIZ');
  end if;
  if p_baslangic_saat is null or p_bitis_saat is null then
    return json_build_object('ok', false, 'hata', 'SURE_GECERSIZ');
  end if;
  if length(trim(coalesce(p_neden, ''))) < 3 then
    return json_build_object('ok', false, 'hata', 'NEDEN_GEREKLI');
  end if;

  -- Aynı kişinin aynı zamana denk gelen bekleyen/onaylı talebi olamaz
  v_bas := p_tarih + p_baslangic_saat;
  v_bit := p_tarih + p_bitis_saat;
  if v_bit <= v_bas then
    v_bit := v_bit + interval '1 day';
  end if;
  if exists (
    select 1 from public.mesai_talepleri m
    where m.personel_id = v_pid and m.durum in ('BEKLEMEDE', 'ONAYLANDI')
      and tsrange(m.tarih + m.baslangic_saat,
                  m.tarih + m.bitis_saat + case when m.bitis_saat <= m.baslangic_saat then interval '1 day' else interval '0' end)
          && tsrange(v_bas, v_bit)
  ) then
    return json_build_object('ok', false, 'hata', 'CAKISMA');
  end if;

  begin
    insert into public.mesai_talepleri (personel_id, tarih, baslangic_saat, bitis_saat, neden)
    values (v_pid, p_tarih, p_baslangic_saat, p_bitis_saat, p_neden);
  exception when others then
    if sqlerrm like '%SURE_GECERSIZ%' then
      return json_build_object('ok', false, 'hata', 'SURE_GECERSIZ');
    elsif sqlerrm like '%AY_KILITLI%' then
      return json_build_object('ok', false, 'hata', 'AY_KILITLI');
    end if;
    raise;
  end;

  return json_build_object('ok', true);
end;
$function$;

-- =====================================================================
-- Mobil özet
-- =====================================================================
create or replace function public.mobil_ozet(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_p record;
  v_ad text;
  v_bas text;
  v_bit text;
  v_mola integer;
begin
  v_pid := public.oturum_personel(p_token);

  select id, sicil_no, ad, soyad, departman, varsayilan_vardiya_id into v_p
  from public.personeller where id = v_pid;

  select v.ad, v.baslangic_saat::text, v.bitis_saat::text, v.mola_dakika into v_ad, v_bas, v_bit, v_mola
  from public.vardiyalar v where v.id = v_p.varsayilan_vardiya_id;

  if v_bas is null then
    select v.ad, v.baslangic_saat::text, v.bitis_saat::text, v.mola_dakika into v_ad, v_bas, v_bit, v_mola
    from public.vardiyalar v order by v.created_at asc limit 1;
  end if;

  return json_build_object(
    'personel', json_build_object(
      'id', v_p.id, 'sicil_no', v_p.sicil_no, 'ad', v_p.ad, 'soyad', v_p.soyad, 'departman', v_p.departman
    ),
    'vardiya', case
      when v_bas is null or v_bit is null then null
      else json_build_object('ad', v_ad, 'baslangic_saat', v_bas, 'bitis_saat', v_bit, 'mola_dakika', coalesce(v_mola, 0))
    end,
    'ayarlar', (
      select json_build_object('cikis_tolerans_dk', a.cikis_tolerans_dk, 'erken_giris_payi_dk', a.erken_giris_payi_dk)
      from public.sirket_ayarlari a where a.id
    ),
    'yillik_izin', public._yillik_izin_hesapla(v_pid),
    'talepler', (
      select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
      from (
        select i.id, i.izin_turu, i.baslangic_tarihi, i.bitis_tarihi, i.baslangic_saat::text as baslangic_saat,
               i.bitis_saat::text as bitis_saat, i.gun_sayisi, i.durum, i.karar_notu, i.created_at
        from public.izinler i
        where i.personel_id = v_pid
        order by i.created_at desc
        limit 10
      ) t
    ),
    'mesai_talepleri', (
      select coalesce(json_agg(m order by m.created_at desc), '[]'::json)
      from (
        select x.id, x.tarih, x.baslangic_saat::text as baslangic_saat, x.bitis_saat::text as bitis_saat,
               x.sure_dk, x.neden, x.durum, x.karar_notu, x.created_at
        from public.mesai_talepleri x
        where x.personel_id = v_pid
        order by x.created_at desc
        limit 10
      ) m
    ),
    'plan', (
      select coalesce(json_agg(json_build_object(
        'tarih', p.tarih,
        'tur', p.tur,
        'vardiya_id', p.vardiya_id,
        'ad', v.ad,
        'baslangic_saat', v.baslangic_saat::text,
        'bitis_saat', v.bitis_saat::text,
        'mola_dakika', v.mola_dakika
      ) order by p.tarih, v.baslangic_saat), '[]'::json)
      from public.vardiya_plani p
      left join public.vardiyalar v on v.id = p.vardiya_id
      where p.personel_id = v_pid
        and p.tarih between current_date - 32 and current_date + 31
    ),
    'subeler', (
      select coalesce(json_agg(json_build_object(
        'id', s.id, 'ad', s.ad, 'enlem', s.enlem, 'boylam', s.boylam, 'limit_metre', s.limit_metre
      )), '[]'::json)
      from public.subeler s
    ),
    'gecmis', (
      select coalesce(json_agg(x), '[]'::json)
      from (
        select h.id, h.islem_turu, h.created_at, s.ad as sube_ad
        from public.hareketler h
        left join public.subeler s on s.id = h.sube_id
        where h.personel_id = v_pid
        order by h.created_at desc
        limit 5
      ) x
    ),
    'son_hareketler', (
      select coalesce(json_agg(y order by y.created_at), '[]'::json)
      from (
        select h.id, h.islem_turu, h.created_at
        from public.hareketler h
        where h.personel_id = v_pid
          and h.created_at >= now() - interval '31 days'
      ) y
    )
  );
end;
$function$;

-- =====================================================================
-- Bildirim abonelikleri
-- =====================================================================
create or replace function public.push_abone_ol(p_token text, p_endpoint text, p_p256dh text, p_auth text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
begin
  v_pid := public.oturum_personel(p_token);
  if p_endpoint is null or p_endpoint !~ '^https://' or p_p256dh is null or p_auth is null then
    raise exception 'ABONELIK_GECERSIZ';
  end if;
  insert into public.push_abonelikleri (endpoint, p256dh, auth, personel_id)
  values (p_endpoint, p_p256dh, p_auth, v_pid)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, personel_id = v_pid, guncelleme = now();
end;
$function$;

create or replace function public.push_abonelik_birak(p_token text, p_endpoint text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
begin
  v_pid := public.oturum_personel(p_token);
  update public.push_abonelikleri set personel_id = null, guncelleme = now()
   where endpoint = p_endpoint and personel_id = v_pid;
  delete from public.push_abonelikleri where endpoint = p_endpoint and personel_id is null and user_id is null;
end;
$function$;

create or replace function public.panel_push_abone_ol(p_endpoint text, p_p256dh text, p_auth text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.panel_kullanicisi() then
    raise exception 'YETKISIZ';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or p_p256dh is null or p_auth is null then
    raise exception 'ABONELIK_GECERSIZ';
  end if;
  insert into public.push_abonelikleri (endpoint, p256dh, auth, user_id)
  values (p_endpoint, p_p256dh, p_auth, auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_id = auth.uid(), guncelleme = now();
end;
$function$;

create or replace function public.panel_push_abonelik_birak(p_endpoint text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.push_abonelikleri set user_id = null, guncelleme = now()
   where endpoint = p_endpoint and user_id = auth.uid();
  delete from public.push_abonelikleri where endpoint = p_endpoint and personel_id is null and user_id is null;
end;
$function$;

-- =====================================================================
-- Personel koruması ve PIN
-- =====================================================================
create or replace function public.personel_korumali_alanlar()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_admin() or current_setting('mns.korumali_islem', true) = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pin_hash := null;
    new.cihaz_id := null;
    new.pin_hatali := 0;
    new.kilit_bitis := null;
    return new;
  end if;
  if new.pin_hash is distinct from old.pin_hash
     or new.cihaz_id is distinct from old.cihaz_id
     or new.pin_hatali is distinct from old.pin_hatali
     or new.kilit_bitis is distinct from old.kilit_bitis then
    raise exception 'KORUNAN_ALAN';
  end if;
  return new;
end;
$function$;

create or replace function public.personel_pin_belirle(p_personel_id uuid, p_pin text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
begin
  if not public.personel_yetkisi(p_personel_id) then
    raise exception 'YETKISIZ';
  end if;
  if not (
    public.yetkisi_var('pin')
    or (public.yetkisi_var('personel')
        and exists (select 1 from public.personeller where id = p_personel_id and pin_hash is null))
  ) then
    raise exception 'YETKISIZ';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN 4 ile 8 haneli rakamlardan oluşmalıdır';
  end if;

  perform set_config('mns.korumali_islem', '1', true);
  update public.personeller
     set pin_hash = crypt(p_pin, gen_salt('bf')),
         pin_hatali = 0,
         kilit_bitis = null
   where id = p_personel_id;

  delete from public.mobil_oturumlar where personel_id = p_personel_id;
end;
$function$;

-- =====================================================================
-- Vardiya planı, ay kilidi, işlem geçmişi
-- =====================================================================
create or replace function public.vardiya_plani_kontrol()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from public.vardiya_plani p
    where p.personel_id = new.personel_id and p.tarih = new.tarih and p.id <> new.id
      and ((new.tur = 'TATIL' and p.tur = 'VARDIYA') or (new.tur = 'VARDIYA' and p.tur = 'TATIL'))
  ) then
    raise exception 'PLAN_CAKISMA: Aynı gün hem hafta tatili hem vardiya olamaz';
  end if;
  return new;
end;
$function$;

create or replace function public.ay_kilidi_kontrol()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_satir jsonb;
  v_bas date;
  v_bit date;
  v_ay text;
begin
  -- Personelin mobilden yaptığı işlemler (oturumsuz) kilitten etkilenmez
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  foreach v_satir in array array_remove(
    array[
      case when tg_op <> 'INSERT' then to_jsonb(old) end,
      case when tg_op <> 'DELETE' then to_jsonb(new) end
    ],
    null
  ) loop
    if tg_table_name = 'hareketler' then
      v_bas := ((v_satir ->> 'created_at')::timestamptz at time zone 'Europe/Istanbul')::date;
      v_bit := v_bas;
    elsif tg_table_name = 'izinler' then
      v_bas := (v_satir ->> 'baslangic_tarihi')::date;
      v_bit := (v_satir ->> 'bitis_tarihi')::date;
    else
      v_bas := (v_satir ->> 'tarih')::date;
      v_bit := v_bas;
    end if;

    select k.ay into v_ay
      from public.ay_kilitleri k
     where k.ay between to_char(v_bas, 'YYYY-MM') and to_char(v_bit, 'YYYY-MM')
     limit 1;
    if v_ay is not null then
      raise exception 'AY_KILITLI: % ayı kapatılmış', v_ay;
    end if;
  end loop;

  return coalesce(new, old);
end;
$function$;

create or replace function public.islem_gecmisi_yaz()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_eski jsonb;
  v_yeni jsonb;
  v_once jsonb;
  v_sonra jsonb;
  v_satir jsonb;
  v_pin_degisti boolean;
begin
  -- Yalnızca panel kullanıcılarının işlemleri (mobil ve sistem işlemleri değil)
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  v_eski := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_yeni := case when tg_op <> 'DELETE' then to_jsonb(new) end;

  -- PIN özetini asla kaydetme; yalnızca değişip değişmediğini yaz
  if coalesce(v_eski, v_yeni) ? 'pin_hash' then
    v_pin_degisti := (v_eski ->> 'pin_hash') is distinct from (v_yeni ->> 'pin_hash');
    v_eski := v_eski - 'pin_hash';
    v_yeni := v_yeni - 'pin_hash';
    if tg_op = 'UPDATE' and v_pin_degisti then
      v_eski := v_eski || '{"pin": "önceki"}'::jsonb;
      v_yeni := v_yeni || '{"pin": "yeni"}'::jsonb;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(a.anahtar, v_eski -> a.anahtar), jsonb_object_agg(a.anahtar, v_yeni -> a.anahtar)
      into v_once, v_sonra
      from jsonb_object_keys(v_yeni) as a(anahtar)
     where (v_eski -> a.anahtar) is distinct from (v_yeni -> a.anahtar);
    if v_once is null then
      return new; -- gerçek bir değişiklik yok
    end if;
  else
    v_once := v_eski;
    v_sonra := v_yeni;
  end if;

  v_satir := coalesce(v_yeni, v_eski);
  insert into public.islem_gecmisi (kullanici_id, kullanici_eposta, tablo, islem, kayit_id, personel_id, once, sonra)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    tg_table_name,
    tg_op,
    coalesce(v_satir ->> 'id', v_satir ->> 'user_id', v_satir ->> 'ay'),
    case when tg_table_name = 'personeller' then (v_satir ->> 'id')::uuid else (v_satir ->> 'personel_id')::uuid end,
    v_once,
    v_sonra
  );
  return coalesce(new, old);
end;
$function$;

-- =====================================================================
-- Panel kullanıcıları
-- =====================================================================
create or replace function public.yonetici_bilgisi()
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select json_build_object(
    'rol', y.rol,
    'ad', y.ad,
    'yetkiler', y.yetkiler,
    'subeler', coalesce((select json_agg(ys.sube_id) from public.yonetici_subeleri ys where ys.user_id = y.user_id), '[]'::json)
  )
  from public.yoneticiler y
  where y.user_id = auth.uid();
$function$;

create or replace function public.yonetici_listesi()
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'YETKISIZ';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'user_id', y.user_id,
      'eposta', u.email,
      'ad', y.ad,
      'rol', y.rol,
      'yetkiler', y.yetkiler,
      'ben', y.user_id = auth.uid(),
      'son_giris', u.last_sign_in_at,
      'subeler', coalesce((select json_agg(ys.sube_id) from public.yonetici_subeleri ys where ys.user_id = y.user_id), '[]'::json)
    ) order by y.rol, u.email), '[]'::json)
    from public.yoneticiler y
    left join auth.users u on u.id = y.user_id
  );
end;
$function$;

create or replace function public.yonetici_kaydet(p_eposta text, p_ad text, p_rol text, p_subeler uuid[], p_yetkiler text[] default '{}'::text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid;
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
    where y not in ('plan', 'izin', 'mesai', 'manuel', 'cihaz', 'pin', 'personel', 'rapor')
  ) then
    raise exception 'YETKI_GECERSIZ';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_eposta));
  if v_uid is null then
    raise exception 'KULLANICI_YOK';
  end if;
  if v_uid = auth.uid() and p_rol <> 'GENEL' then
    raise exception 'KENDINI_DEGISTIREMEZ';
  end if;

  insert into public.yoneticiler (user_id, rol, ad, yetkiler)
  values (
    v_uid, p_rol, nullif(trim(coalesce(p_ad, '')), ''),
    case when p_rol = 'SUBE' then coalesce(p_yetkiler, '{}') else '{}' end
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

create or replace function public.yonetici_kaldir(p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'YETKISIZ';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'KENDINI_DEGISTIREMEZ';
  end if;
  delete from public.yoneticiler where user_id = p_user_id;
end;
$function$;

-- =====================================================================
-- Tetikleyiciler
-- =====================================================================
create trigger islem_gecmisi_yaz after insert or delete or update on public.ay_kilitleri for each row execute function public.islem_gecmisi_yaz();
create trigger islem_gecmisi_yaz after insert or delete or update on public.cihaz_talepleri for each row execute function public.islem_gecmisi_yaz();
create trigger ay_kilidi_kontrol before insert or delete or update on public.hareketler for each row execute function public.ay_kilidi_kontrol();
create trigger islem_gecmisi_yaz after insert or delete or update on public.hareketler for each row execute function public.islem_gecmisi_yaz();
create trigger ay_kilidi_kontrol before insert or delete or update on public.izinler for each row execute function public.ay_kilidi_kontrol();
create trigger islem_gecmisi_yaz after insert or delete or update on public.izinler for each row execute function public.islem_gecmisi_yaz();
create trigger izin_gun_hesapla before insert or update of izin_turu, baslangic_tarihi, bitis_tarihi, baslangic_saat, bitis_saat, personel_id on public.izinler for each row execute function public.izin_gun_hesapla();
create trigger ay_kilidi_kontrol before insert or delete or update on public.mesai_talepleri for each row execute function public.ay_kilidi_kontrol();
create trigger islem_gecmisi_yaz after insert or delete or update on public.mesai_talepleri for each row execute function public.islem_gecmisi_yaz();
create trigger mesai_talebi_hazirla before insert or update on public.mesai_talepleri for each row execute function public.mesai_talebi_hazirla();
create trigger islem_gecmisi_yaz after insert or delete or update on public.personeller for each row execute function public.islem_gecmisi_yaz();
create trigger personel_korumali_alanlar before insert or update on public.personeller for each row execute function public.personel_korumali_alanlar();
create trigger islem_gecmisi_yaz after insert or delete or update on public.resmi_tatiller for each row execute function public.islem_gecmisi_yaz();
create trigger islem_gecmisi_yaz after insert or delete or update on public.sirket_ayarlari for each row execute function public.islem_gecmisi_yaz();
create trigger islem_gecmisi_yaz after insert or delete or update on public.subeler for each row execute function public.islem_gecmisi_yaz();
create trigger ay_kilidi_kontrol before insert or delete or update on public.vardiya_plani for each row execute function public.ay_kilidi_kontrol();
create trigger islem_gecmisi_yaz after insert or delete or update on public.vardiya_plani for each row execute function public.islem_gecmisi_yaz();
create trigger vardiya_plani_kontrol before insert or update on public.vardiya_plani for each row execute function public.vardiya_plani_kontrol();
create trigger islem_gecmisi_yaz after insert or delete or update on public.vardiyalar for each row execute function public.islem_gecmisi_yaz();
create trigger islem_gecmisi_yaz after insert or delete or update on public.yonetici_subeleri for each row execute function public.islem_gecmisi_yaz();
create trigger islem_gecmisi_yaz after insert or delete or update on public.yoneticiler for each row execute function public.islem_gecmisi_yaz();

-- =====================================================================
-- Çalıştırma yetkileri (canlıdaki gibi)
-- =====================================================================
-- Yalnızca sunucu (service_role) çalıştırabilir
revoke execute on function public._pin_dogrula(text, text) from public, anon, authenticated;
revoke execute on function public._yillik_izin_hesapla(uuid) from public, anon, authenticated;
revoke execute on function public.oturum_personel(text) from public, anon, authenticated;

-- Yalnızca giriş yapmış panel kullanıcısı (anon ve public yok)
revoke execute on function public.panel_push_abone_ol(text, text, text) from public, anon;
revoke execute on function public.panel_push_abonelik_birak(text) from public, anon;
revoke execute on function public.yonetici_kaldir(uuid) from public, anon;
revoke execute on function public.yonetici_kaydet(text, text, text, uuid[], text[]) from public, anon;
revoke execute on function public.yonetici_listesi() from public, anon;

-- Giriş yapmış kullanıcı (anon yok; public açık)
revoke execute on function public.cihaz_sifirla(uuid) from anon;
revoke execute on function public.cihaz_talebi_karar(uuid, boolean) from anon;
revoke execute on function public.personel_pin_belirle(uuid, text) from anon;

commit;
