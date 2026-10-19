-- Ücretsiz deneme hesabı (19.10.2026)
--
-- * firmalar.deneme_bitis: deneme firmasının son kullanım günü (boş = kalıcı firma). Süresi dolan
--   deneme firmaları her sabah deneme_suresi_dolanlari_kapat() ile pasife alınır; veriler silinmez.
-- * deneme_talepleri: app.mnsnext.com.tr/deneme formundan gelen başvurular ve e-posta doğrulama kodları.
--   Yalnızca sunucu (service_role) erişir; panel ve mobilden okunamaz.
-- * firma_durumu: giriş yapan panel kullanıcısının firması kapalı olsa bile durumunu döndürür
--   (girişte "deneme süreniz doldu" mesajı ve paneldeki kalan gün uyarısı için).
-- * sistem_deneme_ayarla: sistem yöneticisi deneme süresini uzatır ya da firmayı kalıcı yapar.
-- * sistem_firma_listesi: deneme_bitis eklendi (gövde 2026-10-18_firma_paketi.sql ile aynı).
-- Önce deneme projesinde, sonra canlıda. Uygulama kodundan ÖNCE çalıştırılmalı.
-- Geri alma: dosyanın sonu.

begin;

alter table public.firmalar add column if not exists deneme_bitis date;

create table if not exists public.deneme_talepleri (
  id uuid primary key default gen_random_uuid(),
  eposta text not null,
  firma_ad text not null,
  personel_sayisi text,
  ad text not null,
  soyad text not null,
  telefon text not null,
  kod_hash text not null,
  kod_son timestamptz not null,
  hatali_deneme integer not null default 0,
  ip text,
  kvkk_onay timestamptz not null,
  ticari_ileti boolean not null default false,
  durum text not null default 'BEKLIYOR' check (durum in ('BEKLIYOR', 'ACILDI', 'IPTAL')),
  firma_id uuid references public.firmalar (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists deneme_talepleri_eposta_idx on public.deneme_talepleri (eposta, created_at desc);
create index if not exists deneme_talepleri_ip_idx on public.deneme_talepleri (ip, created_at desc);

alter table public.deneme_talepleri enable row level security;
revoke all on public.deneme_talepleri from public, anon, authenticated;

-- Panel: kendi firmasının durumu (firma kapalıyken de çalışır)
create or replace function public.firma_durumu()
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select json_build_object('aktif', f.aktif, 'deneme_bitis', f.deneme_bitis, 'ad', f.ad)
  from public.yoneticiler y
  join public.firmalar f on f.id = y.firma_id
  where y.user_id = auth.uid();
$function$;

-- Sistem yöneticisi: deneme bitişini değiştir (boş = kalıcı firma). Bugün ya da sonrası verilirse firma açılır.
create or replace function public.sistem_deneme_ayarla(p_firma_id uuid, p_bitis date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if not public.sistem_yoneticisi() then
    raise exception 'YETKISIZ';
  end if;
  update public.firmalar
     set deneme_bitis = p_bitis,
         aktif = case when p_bitis is null or p_bitis >= v_bugun then true else aktif end
   where id = p_firma_id;
  if not found then
    raise exception 'FIRMA_YOK';
  end if;
end;
$function$;

-- Zamanlanmış görev (service_role): süresi dolan denemeleri kapatır, eski bekleyen başvuruları siler
create or replace function public.deneme_suresi_dolanlari_kapat()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_sayi integer;
begin
  update public.firmalar set aktif = false
   where aktif and deneme_bitis is not null and deneme_bitis < v_bugun;
  get diagnostics v_sayi = row_count;

  delete from public.deneme_talepleri
   where durum <> 'ACILDI' and created_at < now() - interval '30 days';
  return v_sayi;
end;
$function$;

-- Sistem yöneticisi firma listesi: deneme_bitis eklendi
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
      'deneme_bitis', f.deneme_bitis,
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

revoke execute on function public.firma_durumu() from public, anon;
revoke execute on function public.sistem_deneme_ayarla(uuid, date) from public, anon;
revoke execute on function public.deneme_suresi_dolanlari_kapat() from public, anon, authenticated;
grant execute on function public.firma_durumu() to authenticated;
grant execute on function public.sistem_deneme_ayarla(uuid, date) to authenticated;

commit;

-- Geri alma (gerekirse ayrı çalıştırın):
-- begin;
-- drop function if exists public.deneme_suresi_dolanlari_kapat();
-- drop function if exists public.sistem_deneme_ayarla(uuid, date);
-- drop function if exists public.firma_durumu();
-- drop table if exists public.deneme_talepleri;
-- alter table public.firmalar drop column if exists deneme_bitis;
-- -- sistem_firma_listesi için 2026-10-18_firma_paketi.sql içindeki tanımı yeniden çalıştırın
-- commit;
