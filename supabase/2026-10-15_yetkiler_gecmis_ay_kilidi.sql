-- Yetki kutucukları, işlem geçmişi ve kapanmış ay kilidi (15.10.2026)
-- Önce 2026-10-15_sube_muduru_rolleri.sql çalıştırılmış olmalı.
-- Supabase > SQL Editor'de bir kez, tek parça olarak çalıştırın. Hata olursa hiçbir şey değişmez.
--
-- 1) Yetkiler: şube müdürünün yapabilecekleri tek tek açılıp kapanır.
--      plan     : vardiya planı hazırlama
--      izin     : izin taleplerini onaylama/reddetme, izin ve rapor girme
--      manuel   : manuel giriş/çıkış ekleme
--      cihaz    : kayıtlı cihaz kilidini açma
--      pin      : PIN verme ve sıfırlama
--      personel : kendi şubesine personel ekleme, pasife alma
--      rapor    : rapor indirme (yalnızca arayüzde uygulanır)
--    Genel yönetici her zaman hepsine sahiptir. Mevcut şube müdürlerine bugünkü
--    yetkileri (plan, izin, manuel, cihaz) verilir; kullanım değişmez.
-- 2) İşlem geçmişi: panelden yapılan her ekleme/değişiklik/silme kim, ne zaman,
--    önce/sonra değerleriyle kaydedilir. Yalnızca genel yönetici görür, kimse silemez.
--    Personelin mobilden yaptığı giriş/çıkış ve talepler kaydedilmez (zaten hareket kaydıdır).
-- 3) Ay kilidi: genel yöneticinin kapattığı aya ait giriş/çıkış, izin ve plan
--    panelden değiştirilemez. Personelin mobilden giriş/çıkışı etkilenmez.

begin;

-- =====================================================================
-- 1) YETKİLER
-- =====================================================================
alter table public.yoneticiler add column if not exists yetkiler text[] not null default '{}';

update public.yoneticiler
   set yetkiler = array['plan', 'izin', 'manuel', 'cihaz']
 where rol = 'SUBE' and cardinality(yetkiler) = 0;

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

-- İzinler: görmek herkese (kendi personeli), değiştirmek "izin" yetkisine bağlı
drop policy if exists "sube_muduru_izinler" on public.izinler;
drop policy if exists "sube_muduru_izin_okuma" on public.izinler;
drop policy if exists "sube_muduru_izin_ekleme" on public.izinler;
drop policy if exists "sube_muduru_izin_degistirme" on public.izinler;
drop policy if exists "sube_muduru_izin_silme" on public.izinler;
create policy "sube_muduru_izin_okuma" on public.izinler
  for select to authenticated using (public.personel_yetkisi(personel_id));
create policy "sube_muduru_izin_ekleme" on public.izinler
  for insert to authenticated
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('izin'));
create policy "sube_muduru_izin_degistirme" on public.izinler
  for update to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('izin'))
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('izin'));
create policy "sube_muduru_izin_silme" on public.izinler
  for delete to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('izin'));

-- Vardiya planı: görmek herkese (kendi personeli), değiştirmek "plan" yetkisine bağlı
drop policy if exists "vardiya_plani_yonetici" on public.vardiya_plani;
drop policy if exists "vardiya_plani_okuma" on public.vardiya_plani;
drop policy if exists "vardiya_plani_ekleme" on public.vardiya_plani;
drop policy if exists "vardiya_plani_degistirme" on public.vardiya_plani;
drop policy if exists "vardiya_plani_silme" on public.vardiya_plani;
create policy "vardiya_plani_okuma" on public.vardiya_plani
  for select to authenticated using (public.personel_yetkisi(personel_id));
create policy "vardiya_plani_ekleme" on public.vardiya_plani
  for insert to authenticated
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('plan'));
create policy "vardiya_plani_degistirme" on public.vardiya_plani
  for update to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('plan'))
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('plan'));
create policy "vardiya_plani_silme" on public.vardiya_plani
  for delete to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('plan'));

-- Manuel giriş/çıkış: "manuel" yetkisi
drop policy if exists "sube_muduru_manuel_ekleme" on public.hareketler;
create policy "sube_muduru_manuel_ekleme" on public.hareketler
  for insert to authenticated
  with check (
    manuel = true and public.yetkisi_var('manuel')
    and public.personel_yetkisi(personel_id) and public.sube_yetkisi(sube_id)
  );

-- Personel ekleme / pasife alma: "personel" yetkisi, yalnızca kendi şubelerine
drop policy if exists "sube_muduru_personel_ekleme" on public.personeller;
drop policy if exists "sube_muduru_personel_degistirme" on public.personeller;
create policy "sube_muduru_personel_ekleme" on public.personeller
  for insert to authenticated
  with check (public.yetkisi_var('personel') and public.sube_yetkisi(varsayilan_sube_id));
create policy "sube_muduru_personel_degistirme" on public.personeller
  for update to authenticated
  using (public.yetkisi_var('personel') and public.personel_yetkisi(id))
  with check (public.yetkisi_var('personel') and public.sube_yetkisi(varsayilan_sube_id));

-- PIN, cihaz ve kilit alanları yalnızca ilgili işlemlerle (fonksiyonlarla) değişebilir.
-- Böylece "personel" yetkisi olan müdür bu alanlara doğrudan yazamaz.
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

drop trigger if exists personel_korumali_alanlar on public.personeller;
create trigger personel_korumali_alanlar
  before insert or update on public.personeller
  for each row execute function public.personel_korumali_alanlar();

-- Cihaz kilidi: "cihaz" yetkisi
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

-- PIN: "pin" yetkisi; "personel" yetkisi olan müdür, PIN'i hiç olmayan (yeni eklediği)
-- personele ilk PIN'i verebilir
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

-- Rol bilgisine yetkiler eklendi
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

drop function if exists public.yonetici_kaydet(text, text, text, uuid[]);
create or replace function public.yonetici_kaydet(
  p_eposta text, p_ad text, p_rol text, p_subeler uuid[], p_yetkiler text[] default '{}'
)
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
    where y not in ('plan', 'izin', 'manuel', 'cihaz', 'pin', 'personel', 'rapor')
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

revoke all on function public.yonetici_kaydet(text, text, text, uuid[], text[]) from public, anon;
grant execute on function public.yonetici_kaydet(text, text, text, uuid[], text[]) to authenticated;

-- =====================================================================
-- 2) İŞLEM GEÇMİŞİ
-- =====================================================================
create table if not exists public.islem_gecmisi (
  id bigint generated always as identity primary key,
  zaman timestamptz not null default now(),
  kullanici_id uuid,
  kullanici_eposta text,
  tablo text not null,
  islem text not null,
  kayit_id text,
  personel_id uuid,
  once jsonb,
  sonra jsonb
);
create index if not exists islem_gecmisi_zaman on public.islem_gecmisi (zaman desc);
create index if not exists islem_gecmisi_personel on public.islem_gecmisi (personel_id);

alter table public.islem_gecmisi enable row level security;
drop policy if exists "islem_gecmisi_okuma" on public.islem_gecmisi;
create policy "islem_gecmisi_okuma" on public.islem_gecmisi
  for select to authenticated using (public.is_admin());
-- Ekleme/değiştirme/silme kuralı yok: kayıtlar yalnızca tetikleyiciyle yazılır, kimse değiştiremez

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
-- 3) KAPANMIŞ AY KİLİDİ
-- =====================================================================
create table if not exists public.ay_kilitleri (
  ay text primary key check (ay ~ '^[0-9]{4}-[0-9]{2}$'),
  kilitleyen uuid default auth.uid(),
  kilit_zamani timestamptz not null default now()
);
alter table public.ay_kilitleri enable row level security;
drop policy if exists "ay_kilitleri_okuma" on public.ay_kilitleri;
drop policy if exists "ay_kilitleri_ekleme" on public.ay_kilitleri;
drop policy if exists "ay_kilitleri_silme" on public.ay_kilitleri;
create policy "ay_kilitleri_okuma" on public.ay_kilitleri
  for select to authenticated using (public.panel_kullanicisi());
create policy "ay_kilitleri_ekleme" on public.ay_kilitleri
  for insert to authenticated with check (public.is_admin());
create policy "ay_kilitleri_silme" on public.ay_kilitleri
  for delete to authenticated using (public.is_admin());

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

-- Tetikleyiciler
do $$
declare
  t text;
begin
  foreach t in array array['hareketler', 'izinler', 'vardiya_plani'] loop
    execute format('drop trigger if exists ay_kilidi_kontrol on public.%I', t);
    execute format(
      'create trigger ay_kilidi_kontrol before insert or update or delete on public.%I
         for each row execute function public.ay_kilidi_kontrol()', t);
  end loop;

  foreach t in array array[
    'hareketler', 'izinler', 'vardiya_plani', 'personeller', 'vardiyalar', 'subeler',
    'resmi_tatiller', 'yoneticiler', 'yonetici_subeleri', 'ay_kilitleri'
  ] loop
    execute format('drop trigger if exists islem_gecmisi_yaz on public.%I', t);
    execute format(
      'create trigger islem_gecmisi_yaz after insert or update or delete on public.%I
         for each row execute function public.islem_gecmisi_yaz()', t);
  end loop;
end $$;

commit;
