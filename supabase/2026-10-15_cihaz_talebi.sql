-- Cihaz kilidi: "bir telefon bir personel" kuralı ve yönetici onaylı yeni telefon talebi (15.10.2026)
-- Önce 2026-10-15_yetkiler_gecmis_ay_kilidi.sql çalıştırılmış olmalı.
-- Supabase > SQL Editor'de bir kez, tek parça olarak çalıştırın. Hata olursa hiçbir şey değişmez.
-- Canlıdaki mevcut kodu bozmaz: personel_giris aynı parametrelerle aynı yanıtları vermeye devam eder;
-- yalnızca "telefon başka personele kayıtlı" durumunda yeni bir hata kodu (CIHAZ_BASKASINDA) döner.
--
-- Kurallar:
--   * Personel yalnızca kendi kayıtlı telefonundan giriş yapabilir (eskisi gibi).
--   * Bir telefona kayıtlı aktif personel varsa o telefondan başka personel giriş yapamaz (yeni).
--   * Telefonu değişen / tarayıcı verisi silinen personel, doğru T.C. + PIN ile "yeni telefon talebi"
--     gönderir. "cihaz" yetkili şube müdürü ya da genel yönetici panelden onaylar; onayla telefon
--     değişir, eski telefondaki oturum kapanır.

begin;

-- =====================================================================
-- 1) TABLO
-- =====================================================================
create table if not exists public.cihaz_talepleri (
  id uuid primary key default gen_random_uuid(),
  personel_id uuid not null references public.personeller (id) on delete cascade,
  cihaz_id text not null,
  -- Yöneticiye gösterilen kısa telefon bilgisi (ör. "iPhone, ana ekran uygulaması")
  cihaz_bilgisi text,
  durum text not null default 'BEKLEMEDE' check (durum in ('BEKLEMEDE', 'ONAYLANDI', 'REDDEDILDI', 'IPTAL')),
  karar_veren uuid,
  karar_zamani timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cihaz_talepleri_personel on public.cihaz_talepleri (personel_id, created_at desc);
-- Bir personelin aynı anda tek bekleyen talebi olur
create unique index if not exists cihaz_talepleri_tek_bekleyen on public.cihaz_talepleri (personel_id) where durum = 'BEKLEMEDE';

-- Kararlar işlem geçmişine yazılır (mobilden gelen talepler oturumsuz olduğu için yazılmaz)
drop trigger if exists islem_gecmisi_yaz on public.cihaz_talepleri;
create trigger islem_gecmisi_yaz
  after insert or update or delete on public.cihaz_talepleri
  for each row execute function public.islem_gecmisi_yaz();

-- Okuma: "cihaz" yetkisi olan, kendi personelinin taleplerini görür.
-- Ekleme/değiştirme kuralı yok: yalnızca aşağıdaki fonksiyonlarla değişir.
alter table public.cihaz_talepleri enable row level security;
drop policy if exists "cihaz_talepleri_okuma" on public.cihaz_talepleri;
create policy "cihaz_talepleri_okuma" on public.cihaz_talepleri
  for select to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('cihaz'));

-- =====================================================================
-- 2) T.C. + PIN DOĞRULAMA (ortak; dışarıdan çağrılamaz)
-- =====================================================================
-- Hatalı PIN sayacını ve 15 dakikalık kilidi işletir. Başarılıysa o_id dolu, o_hata boş döner.
create or replace function public._pin_dogrula(p_tc text, p_pin text, out o_id uuid, out o_cihaz text, out o_hata text)
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

revoke execute on function public._pin_dogrula(text, text) from public, anon, authenticated;

-- =====================================================================
-- 3) MOBİL GİRİŞ
-- =====================================================================
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
-- 4) YENİ TELEFON TALEBİ (mobil, oturumsuz: T.C. + PIN ile)
-- =====================================================================
create or replace function public.cihaz_talebi_olustur(p_tc text, p_pin text, p_cihaz text, p_bilgi text default null)
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

-- Talep durumunu yalnızca talebi gönderen telefon sorgulayabilir (talep no + cihaz kimliği)
create or replace function public.cihaz_talebi_durum(p_talep_id uuid, p_cihaz text)
 returns json
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select json_build_object('ok', true, 'durum', durum)
       from public.cihaz_talepleri
      where id = p_talep_id and cihaz_id = p_cihaz),
    json_build_object('ok', false, 'hata', 'TALEP_YOK')
  );
$function$;

-- =====================================================================
-- 5) KARAR (panel: "cihaz" yetkisi)
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

revoke execute on function public.cihaz_talebi_karar(uuid, boolean) from anon;

commit;

-- İsteğe bağlı kontrol: aynı telefona kayıtlı birden fazla aktif personel var mı?
-- (Bu kişiler kendi telefonlarından girmeye devam eder; yeni kural yalnızca yeni eşleşmeleri engeller.
--  Ayırmak için ilgili personelin panelden "Kilidi aç" ile kilidini açın.)
-- select cihaz_id, string_agg(ad || ' ' || soyad, ', ') from public.personeller
--  where aktif and cihaz_id is not null group by cihaz_id having count(*) > 1;
