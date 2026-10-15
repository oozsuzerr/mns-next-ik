-- Şube müdürü rolleri ve şubeye göre yetki (15.10.2026)
-- Supabase > SQL Editor'de bir kez, tek parça olarak çalıştırın.
--
-- Roller:
--   GENEL : bugünkü yöneticiler. Her şeyi görür ve yönetir (mevcut kurallar aynen geçerli).
--   SUBE  : şube müdürü. Yalnızca atandığı şubelerin personelini görür; bu personel için
--           vardiya planı, izin talepleri, manuel giriş/çıkış ve cihaz kilidi açma yapabilir.
--           Personel ekleme/pasife alma, PIN, vardiya tanımları, şubeler ve resmi tatiller
--           yalnızca GENEL'dedir.
--
-- Mevcut yöneticiler otomatik olarak GENEL olur; bugünkü kullanım değişmez.

begin;

-- ---------------------------------------------------------------------
-- 1) Yönetici tablosu: rol ve ad; şube atamaları
-- ---------------------------------------------------------------------
alter table public.yoneticiler add column if not exists rol text not null default 'GENEL';
alter table public.yoneticiler add column if not exists ad text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'yoneticiler_rol_kontrol') then
    alter table public.yoneticiler add constraint yoneticiler_rol_kontrol check (rol in ('GENEL', 'SUBE'));
  end if;
end $$;

create unique index if not exists yoneticiler_user_id_tekil on public.yoneticiler (user_id);

create table if not exists public.yonetici_subeleri (
  user_id uuid not null references public.yoneticiler (user_id) on delete cascade,
  sube_id uuid not null references public.subeler (id) on delete cascade,
  primary key (user_id, sube_id)
);
-- Doğrudan erişim yok; yalnızca aşağıdaki fonksiyonlar okur/yazar
alter table public.yonetici_subeleri enable row level security;

-- ---------------------------------------------------------------------
-- 2) Yetki fonksiyonları
-- ---------------------------------------------------------------------
-- is_admin artık yalnızca GENEL yöneticidir. Bugünkü bütün "admin_tum_erisim"
-- kuralları bu fonksiyona bağlı olduğundan şube müdürü onlardan yararlanamaz.
create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.yoneticiler where user_id = auth.uid() and rol = 'GENEL');
$function$;

-- Panele girebilen herhangi bir kullanıcı (GENEL ya da SUBE)
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

-- Personelin varsayılan şubesi müdürün şubelerinden biriyse yetkilidir
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

-- ---------------------------------------------------------------------
-- 3) Şube müdürü kuralları (mevcut admin_tum_erisim kurallarının yanına eklenir)
-- ---------------------------------------------------------------------
drop policy if exists "sube_muduru_okuma" on public.subeler;
create policy "sube_muduru_okuma" on public.subeler
  for select to authenticated using (public.sube_yetkisi(id));

drop policy if exists "panel_okuma" on public.vardiyalar;
create policy "panel_okuma" on public.vardiyalar
  for select to authenticated using (public.panel_kullanicisi());

drop policy if exists "panel_okuma" on public.resmi_tatiller;
create policy "panel_okuma" on public.resmi_tatiller
  for select to authenticated using (public.panel_kullanicisi());

drop policy if exists "sube_muduru_okuma" on public.personeller;
create policy "sube_muduru_okuma" on public.personeller
  for select to authenticated using (public.personel_yetkisi(id));

-- Hareketler: kendi personelinin hareketleri ya da kendi şubesinde yapılan hareketler
drop policy if exists "sube_muduru_okuma" on public.hareketler;
create policy "sube_muduru_okuma" on public.hareketler
  for select to authenticated using (public.personel_yetkisi(personel_id) or public.sube_yetkisi(sube_id));

-- Manuel giriş/çıkış ekleme (yalnızca manuel kayıt, yalnızca kendi personeli ve şubesi)
drop policy if exists "sube_muduru_manuel_ekleme" on public.hareketler;
create policy "sube_muduru_manuel_ekleme" on public.hareketler
  for insert to authenticated
  with check (manuel = true and public.personel_yetkisi(personel_id) and public.sube_yetkisi(sube_id));

-- İzinler: kendi personelinin taleplerini görme, onaylama, ekleme, silme
drop policy if exists "sube_muduru_izinler" on public.izinler;
create policy "sube_muduru_izinler" on public.izinler
  for all to authenticated
  using (public.personel_yetkisi(personel_id))
  with check (public.personel_yetkisi(personel_id));

-- Vardiya planı: genel yönetici her şey, şube müdürü kendi personeli
drop policy if exists "vardiya_plani_yonetici" on public.vardiya_plani;
create policy "vardiya_plani_yonetici" on public.vardiya_plani
  for all to authenticated
  using (public.personel_yetkisi(personel_id))
  with check (public.personel_yetkisi(personel_id));

-- ---------------------------------------------------------------------
-- 4) Cihaz kilidi açma: şube müdürü kendi personeli için yapabilir
-- ---------------------------------------------------------------------
create or replace function public.cihaz_sifirla(p_personel_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.personel_yetkisi(p_personel_id) then
    raise exception 'YETKISIZ';
  end if;

  update public.personeller set cihaz_id = null where id = p_personel_id;
  delete from public.mobil_oturumlar where personel_id = p_personel_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5) Panel kullanıcısı bilgisi ve yönetimi
-- ---------------------------------------------------------------------
-- Giriş yapan kullanıcının rolü ve şubeleri (panel değilse null)
create or replace function public.yonetici_bilgisi()
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select json_build_object(
    'rol', y.rol,
    'ad', y.ad,
    'subeler', coalesce((select json_agg(ys.sube_id) from public.yonetici_subeleri ys where ys.user_id = y.user_id), '[]'::json)
  )
  from public.yoneticiler y
  where y.user_id = auth.uid();
$function$;

-- Tüm panel kullanıcıları (yalnızca genel yönetici)
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
      'ben', y.user_id = auth.uid(),
      'son_giris', u.last_sign_in_at,
      'subeler', coalesce((select json_agg(ys.sube_id) from public.yonetici_subeleri ys where ys.user_id = y.user_id), '[]'::json)
    ) order by y.rol, u.email), '[]'::json)
    from public.yoneticiler y
    left join auth.users u on u.id = y.user_id
  );
end;
$function$;

-- Panel kullanıcısı ekle / güncelle (yalnızca genel yönetici).
-- Hesap önce Supabase Auth'ta oluşturulmuş olmalı (panel bunu kendisi yapar).
create or replace function public.yonetici_kaydet(p_eposta text, p_ad text, p_rol text, p_subeler uuid[])
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

  select id into v_uid from auth.users where lower(email) = lower(trim(p_eposta));
  if v_uid is null then
    raise exception 'KULLANICI_YOK';
  end if;
  if v_uid = auth.uid() and p_rol <> 'GENEL' then
    raise exception 'KENDINI_DEGISTIREMEZ';
  end if;

  insert into public.yoneticiler (user_id, rol, ad)
  values (v_uid, p_rol, nullif(trim(coalesce(p_ad, '')), ''))
  on conflict (user_id) do update set rol = excluded.rol, ad = excluded.ad;

  delete from public.yonetici_subeleri where user_id = v_uid;
  if p_rol = 'SUBE' then
    insert into public.yonetici_subeleri (user_id, sube_id)
    select v_uid, s from unnest(p_subeler) as s
    on conflict do nothing;
  end if;
end;
$function$;

-- Panel erişimini kaldır (yalnızca genel yönetici, kendini kaldıramaz).
-- Supabase Auth hesabı silinmez; yalnızca panele girişi kapanır.
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

-- Yönetim fonksiyonları yalnızca giriş yapmış kullanıcılara açık (içeride ayrıca genel yönetici kontrolü var)
revoke all on function public.yonetici_listesi() from public, anon;
revoke all on function public.yonetici_kaydet(text, text, text, uuid[]) from public, anon;
revoke all on function public.yonetici_kaldir(uuid) from public, anon;
grant execute on function public.yonetici_listesi() to authenticated;
grant execute on function public.yonetici_kaydet(text, text, text, uuid[]) to authenticated;
grant execute on function public.yonetici_kaldir(uuid) to authenticated;

commit;
