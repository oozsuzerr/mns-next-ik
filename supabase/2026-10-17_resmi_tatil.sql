-- Resmi tatil yönetimi: yarım gün (arife) desteği (17.10.2026)
--
-- * resmi_tatiller.yarim_gun: arife günleri (13:00 sonrası tatil). Puantajda sabah iş günü sayılır.
-- * izin_gun_sayisi: yarım gün tatil izinden 0,5 gün düşer (önceden her tatil satırı tam gün sayılıyordu).
--   Dönüş tipi integer -> numeric; izinler.gun_sayisi zaten numeric(6,2).
-- Ortak (Türkiye geneli) tatiller panelden yalnızca sistem yöneticisi tarafından /api/sistem/tatil ile
-- eklenir; firmaya özel tatili genel yönetici mevcut kurallarla ekler (veritabanı değişikliği gerekmez).
-- Önce deneme projesinde, sonra canlıda; uygulama kodundan ÖNCE çalıştırılmalı (panel yarim_gun okur).
-- Geri alma: dosyanın sonu.

begin;

alter table public.resmi_tatiller add column if not exists yarim_gun boolean not null default false;

-- Dönüş tipi değiştiği için önce silinir (izin_gun_hesapla tetikleyicisi adıyla çağırır, bağımlılık yok)
drop function if exists public.izin_gun_sayisi(uuid, date, date);
create function public.izin_gun_sayisi(p_personel_id uuid, p_bas date, p_bit date)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(sum(
           case
             when exists (
               select 1 from public.resmi_tatiller t
               where t.tarih = g.gun::date and not t.yarim_gun
                 and (t.firma_id is null or t.firma_id = (select firma_id from public.personeller where id = p_personel_id))
             ) then 0
             when exists (
               select 1 from public.vardiya_plani v
               where v.personel_id = p_personel_id and v.tarih = g.gun::date and v.tur = 'TATIL'
             ) then 0
             when extract(isodow from g.gun) = 7
                  and not exists (select 1 from public.vardiya_plani v where v.personel_id = p_personel_id and v.tarih = g.gun::date)
               then 0
             -- Arife: öğleden önce çalışılır, izinden yarım gün düşer
             when exists (
               select 1 from public.resmi_tatiller t
               where t.tarih = g.gun::date and t.yarim_gun
                 and (t.firma_id is null or t.firma_id = (select firma_id from public.personeller where id = p_personel_id))
             ) then 0.5
             else 1
           end), 0)
  from generate_series(p_bas, p_bit, interval '1 day') as g(gun);
$function$;

commit;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop function if exists public.izin_gun_sayisi(uuid, date, date);
-- create function public.izin_gun_sayisi(p_personel_id uuid, p_bas date, p_bit date)
--  returns integer language sql stable security definer set search_path to 'public'
-- as $function$
--   select count(*)::integer
--   from generate_series(p_bas, p_bit, interval '1 day') as g(gun)
--   where not exists (
--       select 1 from public.resmi_tatiller t
--       where t.tarih = g.gun::date
--         and (t.firma_id is null or t.firma_id = (select firma_id from public.personeller where id = p_personel_id))
--     )
--     and not (
--       exists (select 1 from public.vardiya_plani v where v.personel_id = p_personel_id and v.tarih = g.gun::date and v.tur = 'TATIL')
--       or (extract(isodow from g.gun) = 7
--           and not exists (select 1 from public.vardiya_plani v where v.personel_id = p_personel_id and v.tarih = g.gun::date))
--     );
-- $function$;
-- alter table public.resmi_tatiller drop column if exists yarim_gun;
-- commit;
