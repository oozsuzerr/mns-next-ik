-- Çok firmalı yapı, Adım 4: sistem yöneticisi ekranı için fonksiyonlar (16.10.2026)
--
-- Önkoşul: 2026-10-16_firma_2_sinir.sql çalıştırılmış olmalı.
-- !!! Önce deneme projesinde çalıştırılacak, sonra onayla canlıya uygulanacak. !!!
--
-- Yeni firma ve ilk yöneticisi /api/sistem/firma üzerinden (sunucu, service_role) açılır;
-- burada yalnızca listeleme ve aktif/pasif yapma vardır. İkisi de çağıranın sistem yöneticisi
-- olduğunu kendisi denetler.

begin;

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

create or replace function public.sistem_firma_durum(p_firma_id uuid, p_aktif boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.sistem_yoneticisi() then
    raise exception 'YETKISIZ';
  end if;
  update public.firmalar set aktif = p_aktif where id = p_firma_id;
  if not found then
    raise exception 'FIRMA_YOK';
  end if;
  -- Pasif firmanın personeli mobilden düşer
  if not p_aktif then
    delete from public.mobil_oturumlar where firma_id = p_firma_id;
  end if;
end;
$function$;

revoke execute on function public.sistem_firma_listesi() from public, anon;
revoke execute on function public.sistem_firma_durum(uuid, boolean) from public, anon;
grant execute on function public.sistem_firma_listesi() to authenticated;
grant execute on function public.sistem_firma_durum(uuid, boolean) to authenticated;

commit;

-- ---------------------------------------------------------------------
-- Sistem yöneticisi atama (dosyadan ayrı, elle çalıştırın; e-postayı kendi hesabınızla değiştirin)
-- ---------------------------------------------------------------------
-- Deneme projesi:
--   insert into public.sistem_yoneticileri (user_id)
--   select id from auth.users where email = 'genel@deneme.test' on conflict do nothing;
-- Canlı:
--   insert into public.sistem_yoneticileri (user_id)
--   select id from auth.users where email = '<sizin e-postanız>' on conflict do nothing;
