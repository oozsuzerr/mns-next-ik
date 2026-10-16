-- Çok firmalı yapı, Adım 3: firma sınırı (16.10.2026)
--
-- Önkoşul: 2026-10-16_firma_1_ekleme.sql çalıştırılmış olmalı.
-- !!! Önce deneme projesinde çalıştırılacak, sonra onayla canlıya uygulanacak. !!!
-- Canlıda: hemen ardından aynı günün uygulama kodu canlıya alınmalı (mobil firma kodu, bildirim alıcıları).
--   Eski uygulama kodu bu SQL ile de çalışır: eski 3 parametreli mobil giriş MNS'ye yönlenir.
--
-- Bu dosya:
--   1) Panel kullanıcısının firmasını bulan aktif_firma_id() ve sistem yöneticisi tablosu
--   2) Her tabloya "kısıtlayıcı" firma kuralı (mevcut kurallarla VE ile birleşir)
--   3) firma_doldur: geçici MNS yedeği kalkar, çapraz firma bağlantısı reddedilir, firma_id değiştirilemez
--   4) Tekil kısıtlar firma başına (T.C., sicil, ay kilidi, şirket ayarları, resmi tatil)
--   5) RLS'i atlayan (security definer) fonksiyonlara firma filtresi
--   6) Mobil giriş: firma kodlu yeni imzalar; eski imzalar MNS'ye yönlenir (geçiş dönemi)

begin;

-- =====================================================================
-- 1) Firma ve sistem yöneticisi yardımcıları
-- =====================================================================
create table if not exists public.sistem_yoneticileri (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.sistem_yoneticileri enable row level security;
-- Kural yok: yalnızca aşağıdaki fonksiyonlar ve sunucu (service_role) okur

-- Panel kullanıcısının firması; firma pasifse null (bütün firma kuralları kapanır)
create or replace function public.aktif_firma_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select y.firma_id
  from public.yoneticiler y
  join public.firmalar f on f.id = y.firma_id and f.aktif
  where y.user_id = auth.uid();
$function$;

create or replace function public.sistem_yoneticisi()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.sistem_yoneticileri where user_id = auth.uid());
$function$;

-- Firmalar: kullanıcı yalnızca kendi firmasını görür
drop policy if exists firma_okuma on public.firmalar;
create policy firma_okuma on public.firmalar for select to authenticated
  using (id = public.aktif_firma_id());

-- Mobil giriş ekranı için: kod -> firma adı (yalnızca aktif firmalar, başka bilgi yok)
create or replace function public.firma_adi(p_kod text)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select ad from public.firmalar where kod = lower(trim(p_kod)) and aktif;
$function$;

-- =====================================================================
-- 2) Yetki yardımcıları firmaya bağlanır
-- =====================================================================
create or replace function public.panel_kullanicisi()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.aktif_firma_id() is not null;
$function$;

create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.yoneticiler y
    join public.firmalar f on f.id = y.firma_id and f.aktif
    where y.user_id = auth.uid() and y.rol = 'GENEL'
  );
$function$;

-- Genel yönetici yalnızca KENDİ FİRMASININ şubesine/personeline yetkilidir
create or replace function public.sube_yetkisi(p_sube_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.subeler s where s.id = p_sube_id and s.firma_id = public.aktif_firma_id())
     and (
       public.is_admin()
       or exists (
         select 1 from public.yonetici_subeleri ys
         join public.yoneticiler y on y.user_id = ys.user_id and y.rol = 'SUBE'
         where ys.user_id = auth.uid() and ys.sube_id = p_sube_id
       )
     );
$function$;

create or replace function public.personel_yetkisi(p_personel_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.personeller p where p.id = p_personel_id and p.firma_id = public.aktif_firma_id())
     and (
       public.is_admin()
       or exists (
         select 1 from public.personeller p
         join public.yonetici_subeleri ys on ys.sube_id = p.varsayilan_sube_id
         join public.yoneticiler y on y.user_id = ys.user_id and y.rol = 'SUBE'
         where p.id = p_personel_id and ys.user_id = auth.uid()
       )
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
        select 1 from public.yoneticiler y
        join public.firmalar f on f.id = y.firma_id and f.aktif
        where y.user_id = auth.uid() and y.rol = 'SUBE' and p_yetki = any (y.yetkiler)
      );
$function$;

-- =====================================================================
-- 3) Kısıtlayıcı firma kuralları
-- =====================================================================
do $$
declare
  v_tablo text;
  v_tablolar text[] := array[
    'subeler', 'vardiyalar', 'personeller', 'hareketler', 'izinler', 'vardiya_plani',
    'mesai_talepleri', 'cihaz_talepleri', 'yoneticiler', 'yonetici_subeleri', 'islem_gecmisi',
    'ay_kilitleri', 'sirket_ayarlari', 'push_abonelikleri', 'mobil_oturumlar'
  ];
begin
  foreach v_tablo in array v_tablolar loop
    execute format('drop policy if exists firma_siniri on public.%I', v_tablo);
    execute format(
      'create policy firma_siniri on public.%I as restrictive for all to authenticated
         using (firma_id = public.aktif_firma_id())
         with check (firma_id = public.aktif_firma_id())',
      v_tablo
    );
  end loop;
end $$;

-- Resmi tatiller: ortak liste (firma_id boş) herkese okunur; değiştirmek yalnızca kendi firmasının tatili
drop policy if exists firma_siniri_okuma on public.resmi_tatiller;
create policy firma_siniri_okuma on public.resmi_tatiller as restrictive for select to authenticated
  using (firma_id is null or firma_id = public.aktif_firma_id());
drop policy if exists firma_siniri_ekleme on public.resmi_tatiller;
create policy firma_siniri_ekleme on public.resmi_tatiller as restrictive for insert to authenticated
  with check (firma_id = public.aktif_firma_id());
drop policy if exists firma_siniri_degistirme on public.resmi_tatiller;
create policy firma_siniri_degistirme on public.resmi_tatiller as restrictive for update to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());
drop policy if exists firma_siniri_silme on public.resmi_tatiller;
create policy firma_siniri_silme on public.resmi_tatiller as restrictive for delete to authenticated
  using (firma_id = public.aktif_firma_id());

-- =====================================================================
-- 4) firma_doldur: kesin firma, çapraz bağlantı yok, firma değişmez
-- =====================================================================
create or replace function public.firma_doldur()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_satir jsonb := to_jsonb(new);
  v_firma uuid := (v_satir ->> 'firma_id')::uuid;
  v_bagli uuid;
  v_alan text;
begin
  if tg_op = 'UPDATE' and new.firma_id is distinct from old.firma_id then
    raise exception 'FIRMA_DEGISTIRILEMEZ';
  end if;

  -- İşlem geçmişi bir kayıt defteridir: silinmiş bir personele işaret edebilir, çapraz kontrol yapılmaz
  if tg_table_name = 'islem_gecmisi' then
    v_firma := coalesce(v_firma, public.aktif_firma_id(),
                        (select firma_id from public.personeller where id = (v_satir ->> 'personel_id')::uuid));
    if v_firma is null then
      raise exception 'FIRMA_BELIRSIZ: islem_gecmisi';
    end if;
    return jsonb_populate_record(new, jsonb_build_object('firma_id', v_firma));
  end if;

  if v_firma is null and v_satir ->> 'personel_id' is not null then
    select firma_id into v_firma from public.personeller where id = (v_satir ->> 'personel_id')::uuid;
  end if;
  if v_firma is null and v_satir ->> 'user_id' is not null and tg_table_name = 'yonetici_subeleri' then
    select firma_id into v_firma from public.yoneticiler where user_id = (v_satir ->> 'user_id')::uuid;
  end if;
  if v_firma is null then
    v_firma := public.aktif_firma_id();
  end if;
  if v_firma is null then
    raise exception 'FIRMA_BELIRSIZ: % kaydının firması bulunamadı', tg_table_name;
  end if;

  -- Bağlı kayıtlar aynı firmadan olmalı
  if v_satir ->> 'personel_id' is not null then
    select firma_id into v_bagli from public.personeller where id = (v_satir ->> 'personel_id')::uuid;
    if v_bagli is distinct from v_firma then raise exception 'FIRMA_UYUSMAZ: personel'; end if;
  end if;
  foreach v_alan in array array['sube_id', 'varsayilan_sube_id'] loop
    if v_satir ->> v_alan is not null then
      select firma_id into v_bagli from public.subeler where id = (v_satir ->> v_alan)::uuid;
      if v_bagli is distinct from v_firma then raise exception 'FIRMA_UYUSMAZ: şube'; end if;
    end if;
  end loop;
  foreach v_alan in array array['vardiya_id', 'varsayilan_vardiya_id'] loop
    if v_satir ->> v_alan is not null then
      select firma_id into v_bagli from public.vardiyalar where id = (v_satir ->> v_alan)::uuid;
      if v_bagli is distinct from v_firma then raise exception 'FIRMA_UYUSMAZ: vardiya'; end if;
    end if;
  end loop;
  if tg_table_name = 'yonetici_subeleri' then
    select firma_id into v_bagli from public.yoneticiler where user_id = (v_satir ->> 'user_id')::uuid;
    if v_bagli is distinct from v_firma then raise exception 'FIRMA_UYUSMAZ: yönetici'; end if;
  end if;

  return jsonb_populate_record(new, jsonb_build_object('firma_id', v_firma));
end;
$function$;

-- Tetikleyici adı "a0_" ile başlar: Postgres aynı olaydaki tetikleyicileri ada göre çalıştırır,
-- böylece ay_kilidi_kontrol, izin_gun_hesapla vb. firma_id'yi dolu görür.
do $$
declare
  v_tablo text;
  v_tablolar text[] := array[
    'subeler', 'vardiyalar', 'personeller', 'hareketler', 'izinler', 'vardiya_plani',
    'mesai_talepleri', 'cihaz_talepleri', 'yoneticiler', 'yonetici_subeleri', 'islem_gecmisi',
    'ay_kilitleri', 'sirket_ayarlari', 'push_abonelikleri', 'mobil_oturumlar'
  ];
begin
  foreach v_tablo in array v_tablolar loop
    execute format('drop trigger if exists firma_doldur on public.%I', v_tablo);
    execute format('drop trigger if exists a0_firma_doldur on public.%I', v_tablo);
    execute format(
      'create trigger a0_firma_doldur before insert or update on public.%I for each row execute function public.firma_doldur()',
      v_tablo
    );
  end loop;
end $$;

-- Resmi tatil: panelden eklenen tatil eklenenin firmasına özel olur (SQL Editor'den eklenen ortak kalır)
create or replace function public.tatil_firma_doldur()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.firma_id is null and auth.uid() is not null then
    new.firma_id := public.aktif_firma_id();
  end if;
  return new;
end;
$function$;
drop trigger if exists a0_firma_doldur on public.resmi_tatiller;
create trigger a0_firma_doldur before insert on public.resmi_tatiller
  for each row execute function public.tatil_firma_doldur();

revoke execute on function public.firma_doldur() from public, anon, authenticated;
revoke execute on function public.tatil_firma_doldur() from public, anon, authenticated;

-- =====================================================================
-- 5) Tekil kısıtlar firma başına
-- =====================================================================
alter table public.personeller drop constraint if exists personeller_sicil_no_key;
alter table public.personeller drop constraint if exists personeller_tc_kimlik_key;
drop index if exists public.personeller_tc_kimlik_uidx;
alter table public.personeller add constraint personeller_firma_sicil_tekil unique (firma_id, sicil_no);
alter table public.personeller add constraint personeller_firma_tc_tekil unique (firma_id, tc_kimlik);

alter table public.ay_kilitleri drop constraint if exists ay_kilitleri_pkey;
alter table public.ay_kilitleri add constraint ay_kilitleri_pkey primary key (firma_id, ay);

-- Şirket ayarları: firma başına bir satır. "id" sütunu (hep true) uygulama uyumu için kalır.
alter table public.sirket_ayarlari drop constraint if exists sirket_ayarlari_pkey;
alter table public.sirket_ayarlari add constraint sirket_ayarlari_pkey primary key (firma_id);

alter table public.resmi_tatiller drop constraint if exists resmi_tatiller_tarih_key;
create unique index if not exists resmi_tatiller_ortak_tekil on public.resmi_tatiller (tarih) where firma_id is null;
create unique index if not exists resmi_tatiller_firma_tekil on public.resmi_tatiller (firma_id, tarih) where firma_id is not null;

-- =====================================================================
-- 6) Mobil: oturum, giriş, telefon talebi
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
  join public.firmalar f on f.id = p.firma_id and f.aktif
  where o.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and o.expires_at > now()
    and p.aktif = true;

  if v_id is null then
    raise exception 'OTURUM_GECERSIZ';
  end if;
  return v_id;
end;
$function$;

-- Eski 2 parametreli PIN doğrulama kaldırılır; firma artık zorunlu
drop function if exists public._pin_dogrula(text, text);
create or replace function public._pin_dogrula(p_firma uuid, p_tc text, p_pin text, out o_id uuid, out o_cihaz text, out o_hata text)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  p public.personeller%rowtype;
begin
  if p_firma is null or p_tc is null or p_pin is null then
    o_hata := 'GIRIS_HATALI';
    return;
  end if;

  select * into p
  from public.personeller
  where firma_id = p_firma and tc_kimlik = trim(p_tc) and aktif = true;

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
revoke execute on function public._pin_dogrula(uuid, text, text) from public, anon, authenticated;

-- Firma kodu -> aktif firma kimliği (yoksa null)
create or replace function public._firma_bul(p_kod text)
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select id from public.firmalar where kod = lower(trim(coalesce(p_kod, ''))) and aktif;
$function$;
revoke execute on function public._firma_bul(text) from public, anon, authenticated;

-- Yeni imza: firma koduyla giriş
create or replace function public.personel_giris(p_firma_kod text, p_tc text, p_pin text, p_cihaz text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_firma uuid;
  d record;
  p public.personeller%rowtype;
  v_token text;
  v_talep json;
begin
  if p_tc is null or p_pin is null or p_cihaz is null or length(p_cihaz) < 8 then
    return json_build_object('ok', false, 'hata', 'GIRIS_HATALI');
  end if;
  v_firma := public._firma_bul(p_firma_kod);
  if v_firma is null then
    return json_build_object('ok', false, 'hata', 'FIRMA_YOK');
  end if;

  select * into d from public._pin_dogrula(v_firma, p_tc, p_pin);
  if d.o_hata is not null then
    return json_build_object('ok', false, 'hata', d.o_hata);
  end if;
  select * into p from public.personeller where id = d.o_id;

  -- Cihaz kilidi: ilk girişte cihaz bağlanır, sonra sadece o cihaz girebilir
  if p.cihaz_id is distinct from p_cihaz then
    -- Bir telefon bir personel (firma içinde)
    if exists (select 1 from public.personeller where cihaz_id = p_cihaz and id <> p.id and aktif and firma_id = p.firma_id) then
      return json_build_object('ok', false, 'hata', 'CIHAZ_BASKASINDA');
    end if;

    if p.cihaz_id is not null then
      select json_build_object('id', t.id, 'durum', t.durum) into v_talep
        from public.cihaz_talepleri t
       where t.personel_id = p.id and t.cihaz_id = p_cihaz and t.created_at > now() - interval '7 days'
       order by t.created_at desc
       limit 1;
      return json_build_object('ok', false, 'hata', 'CIHAZ_KILITLI', 'talep', v_talep);
    end if;

    update public.personeller set cihaz_id = p_cihaz where id = p.id;
    update public.cihaz_talepleri set durum = 'IPTAL' where personel_id = p.id and durum = 'BEKLEMEDE';
  end if;

  update public.personeller set pin_hatali = 0, kilit_bitis = null where id = p.id;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.mobil_oturumlar (token_hash, personel_id, cihaz_id, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), p.id, p_cihaz, now() + interval '30 days');

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

-- GEÇİŞ: eski imza (firma kodu olmadan) MNS'ye yönlenir. Bütün telefonlar yeni sürüme geçince kaldırılacak.
create or replace function public.personel_giris(p_tc text, p_pin text, p_cihaz text)
 returns json
 language sql
 security definer
 set search_path to 'public'
as $function$
  select public.personel_giris('mns', p_tc, p_pin, p_cihaz);
$function$;

create or replace function public.cihaz_talebi_olustur(p_firma_kod text, p_tc text, p_pin text, p_cihaz text, p_bilgi text default null::text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_firma uuid;
  d record;
  v_kayitli text;
  v_mevcut public.cihaz_talepleri%rowtype;
  v_id uuid;
begin
  if p_cihaz is null or length(p_cihaz) < 8 or length(p_cihaz) > 100 then
    return json_build_object('ok', false, 'hata', 'GIRIS_HATALI');
  end if;
  v_firma := public._firma_bul(p_firma_kod);
  if v_firma is null then
    return json_build_object('ok', false, 'hata', 'FIRMA_YOK');
  end if;

  select * into d from public._pin_dogrula(v_firma, p_tc, p_pin);
  if d.o_hata is not null then
    return json_build_object('ok', false, 'hata', d.o_hata);
  end if;
  v_kayitli := d.o_cihaz;

  if v_kayitli is null or v_kayitli = p_cihaz then
    return json_build_object('ok', false, 'hata', 'TALEP_GEREKSIZ');
  end if;
  if exists (select 1 from public.personeller where cihaz_id = p_cihaz and id <> d.o_id and aktif and firma_id = v_firma) then
    return json_build_object('ok', false, 'hata', 'CIHAZ_BASKASINDA');
  end if;

  select * into v_mevcut from public.cihaz_talepleri where personel_id = d.o_id and durum = 'BEKLEMEDE';
  if found and v_mevcut.cihaz_id = p_cihaz then
    return json_build_object('ok', true, 'talep_id', v_mevcut.id, 'yeni', false);
  end if;

  if (select count(*) from public.cihaz_talepleri
       where personel_id = d.o_id and created_at > now() - interval '1 day') >= 5 then
    return json_build_object('ok', false, 'hata', 'COK_FAZLA_TALEP');
  end if;

  update public.cihaz_talepleri set durum = 'IPTAL' where personel_id = d.o_id and durum = 'BEKLEMEDE';
  insert into public.cihaz_talepleri (personel_id, cihaz_id, cihaz_bilgisi)
  values (d.o_id, p_cihaz, nullif(left(trim(coalesce(p_bilgi, '')), 80), ''))
  returning id into v_id;

  return json_build_object('ok', true, 'talep_id', v_id, 'yeni', true);
end;
$function$;

-- GEÇİŞ: eski imza MNS'ye yönlenir
create or replace function public.cihaz_talebi_olustur(p_tc text, p_pin text, p_cihaz text, p_bilgi text default null::text)
 returns json
 language sql
 security definer
 set search_path to 'public'
as $function$
  select public.cihaz_talebi_olustur('mns', p_tc, p_pin, p_cihaz, p_bilgi);
$function$;

-- Konum: yalnızca personelin firmasındaki şubeler
create or replace function public.hareket_kaydet(p_token text, p_islem text, p_enlem double precision, p_boylam double precision, p_dogruluk double precision default null::double precision)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_firma uuid;
  v_sube record;
  v_mesafe integer;
begin
  v_pid := public.oturum_personel(p_token);
  select firma_id into v_firma from public.personeller where id = v_pid;

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
   where s.firma_id = v_firma
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

-- Mobil özet: vardiya yedeği, ayarlar ve şubeler personelin firmasından; firma adı eklendi
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

  select id, sicil_no, ad, soyad, departman, varsayilan_vardiya_id, firma_id into v_p
  from public.personeller where id = v_pid;

  select v.ad, v.baslangic_saat::text, v.bitis_saat::text, v.mola_dakika into v_ad, v_bas, v_bit, v_mola
  from public.vardiyalar v where v.id = v_p.varsayilan_vardiya_id;

  if v_bas is null then
    select v.ad, v.baslangic_saat::text, v.bitis_saat::text, v.mola_dakika into v_ad, v_bas, v_bit, v_mola
    from public.vardiyalar v where v.firma_id = v_p.firma_id order by v.created_at asc limit 1;
  end if;

  return json_build_object(
    'firma', (select json_build_object('ad', f.ad, 'kod', f.kod) from public.firmalar f where f.id = v_p.firma_id),
    'personel', json_build_object(
      'id', v_p.id, 'sicil_no', v_p.sicil_no, 'ad', v_p.ad, 'soyad', v_p.soyad, 'departman', v_p.departman
    ),
    'vardiya', case
      when v_bas is null or v_bit is null then null
      else json_build_object('ad', v_ad, 'baslangic_saat', v_bas, 'bitis_saat', v_bit, 'mola_dakika', coalesce(v_mola, 0))
    end,
    'ayarlar', (
      select json_build_object('cikis_tolerans_dk', a.cikis_tolerans_dk, 'erken_giris_payi_dk', a.erken_giris_payi_dk)
      from public.sirket_ayarlari a where a.firma_id = v_p.firma_id
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
      where s.firma_id = v_p.firma_id
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

-- Bildirim aboneliği: aynı telefon başka firmaya geçerse firma da güncellenir
create or replace function public.push_abone_ol(p_token text, p_endpoint text, p_p256dh text, p_auth text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_firma uuid;
begin
  v_pid := public.oturum_personel(p_token);
  select firma_id into v_firma from public.personeller where id = v_pid;
  if p_endpoint is null or p_endpoint !~ '^https://' or p_p256dh is null or p_auth is null then
    raise exception 'ABONELIK_GECERSIZ';
  end if;
  -- Başka firmaya ait eski abonelik silinir (firma_id değiştirilemez)
  delete from public.push_abonelikleri where endpoint = p_endpoint and firma_id <> v_firma;
  insert into public.push_abonelikleri (endpoint, p256dh, auth, personel_id)
  values (p_endpoint, p_p256dh, p_auth, v_pid)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, personel_id = v_pid, guncelleme = now();
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
  delete from public.push_abonelikleri where endpoint = p_endpoint and firma_id <> public.aktif_firma_id();
  insert into public.push_abonelikleri (endpoint, p256dh, auth, user_id)
  values (p_endpoint, p_p256dh, p_auth, auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_id = auth.uid(), guncelleme = now();
end;
$function$;

-- =====================================================================
-- 7) Panel: cihaz, izin hesapları, ay kilidi
-- =====================================================================
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
  -- personel_yetkisi firma kontrolü içerir
  if not (public.personel_yetkisi(t.personel_id) and public.yetkisi_var('cihaz')) then
    raise exception 'YETKISIZ';
  end if;
  if t.durum <> 'BEKLEMEDE' then
    raise exception 'TALEP_SONUCLANMIS';
  end if;

  if p_onay then
    if exists (select 1 from public.personeller where cihaz_id = t.cihaz_id and id <> t.personel_id and aktif and firma_id = t.firma_id) then
      raise exception 'CIHAZ_BASKASINDA';
    end if;
    perform set_config('mns.korumali_islem', '1', true);
    update public.personeller set cihaz_id = t.cihaz_id where id = t.personel_id;
    delete from public.mobil_oturumlar where personel_id = t.personel_id;
  end if;

  update public.cihaz_talepleri
     set durum = case when p_onay then 'ONAYLANDI' else 'REDDEDILDI' end,
         karar_veren = auth.uid(),
         karar_zamani = now()
   where id = t.id;
end;
$function$;

create or replace function public.izin_gun_sayisi(p_personel_id uuid, p_bas date, p_bit date)
 returns integer
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select count(*)::integer
  from generate_series(p_bas, p_bit, interval '1 day') as g(gun)
  where not exists (
      select 1 from public.resmi_tatiller t
      where t.tarih = g.gun::date
        and (t.firma_id is null or t.firma_id = (select firma_id from public.personeller where id = p_personel_id))
    )
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
    select izin_gunu_dk into v_gun_dk from public.sirket_ayarlari where firma_id = new.firma_id;
    new.gun_sayisi := round((extract(epoch from (new.bitis_saat - new.baslangic_saat)) / 60.0) / coalesce(v_gun_dk, 450), 2);
  else
    new.baslangic_saat := null;
    new.bitis_saat := null;
    new.gun_sayisi := public.izin_gun_sayisi(new.personel_id, new.baslangic_tarihi, new.bitis_tarihi);
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

    -- Yalnızca kaydın kendi firmasının kilidi (a0_firma_doldur önce çalıştığı için firma_id doludur)
    select k.ay into v_ay
      from public.ay_kilitleri k
     where k.firma_id = (v_satir ->> 'firma_id')::uuid
       and k.ay between to_char(v_bas, 'YYYY-MM') and to_char(v_bit, 'YYYY-MM')
     limit 1;
    if v_ay is not null then
      raise exception 'AY_KILITLI: % ayı kapatılmış', v_ay;
    end if;
  end loop;

  return coalesce(new, old);
end;
$function$;

-- =====================================================================
-- 8) Panel kullanıcıları (yalnızca kendi firması)
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
    'subeler', coalesce((select json_agg(ys.sube_id) from public.yonetici_subeleri ys where ys.user_id = y.user_id), '[]'::json),
    'firma', json_build_object('id', f.id, 'ad', f.ad, 'kod', f.kod),
    'sistem', public.sistem_yoneticisi()
  )
  from public.yoneticiler y
  join public.firmalar f on f.id = y.firma_id and f.aktif
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
    where y.firma_id = public.aktif_firma_id()
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
    where y not in ('plan', 'izin', 'mesai', 'manuel', 'cihaz', 'pin', 'personel', 'rapor')
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
  delete from public.yoneticiler where user_id = p_user_id and firma_id = public.aktif_firma_id();
end;
$function$;

-- Sistem yöneticisi işlemleri (yalnızca sunucudan, service_role ile çağrılır; Adım 4'te arayüz)
create or replace function public.sistem_firma_olustur(p_ad text, p_kod text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  insert into public.firmalar (ad, kod) values (trim(p_ad), lower(trim(p_kod))) returning id into v_id;
  insert into public.sirket_ayarlari (firma_id) values (v_id);
  return v_id;
end;
$function$;
revoke execute on function public.sistem_firma_olustur(text, text) from public, anon, authenticated;

commit;
