-- Telefona anlık bildirim abonelikleri (15.10.2026)
-- Önce 2026-10-15_ayarlar_izin.sql çalıştırılmış olmalı.
-- Supabase > SQL Editor'de bir kez, tek parça olarak çalıştırın.
--
-- Her telefon/tarayıcı bir abonelik (endpoint) üretir. Aynı telefon hem personel
-- uygulamasında hem yönetim panelinde kullanılabileceği için bir abonelik hem
-- personele hem panel kullanıcısına bağlı olabilir.
-- Tabloya doğrudan erişim yoktur: abone olma/çıkma aşağıdaki fonksiyonlarla,
-- bildirim gönderimi yalnızca sunucudan (service_role) yapılır.

begin;

create table if not exists public.push_abonelikleri (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_id uuid references auth.users (id) on delete set null,
  personel_id uuid references public.personeller (id) on delete set null,
  created_at timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create index if not exists push_abonelikleri_user on public.push_abonelikleri (user_id);
create index if not exists push_abonelikleri_personel on public.push_abonelikleri (personel_id);
alter table public.push_abonelikleri enable row level security;

-- Personel (mobil oturum anahtarıyla)
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

-- Panel kullanıcısı (Supabase oturumuyla)
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

revoke all on function public.panel_push_abone_ol(text, text, text) from public, anon;
revoke all on function public.panel_push_abonelik_birak(text) from public, anon;
grant execute on function public.panel_push_abone_ol(text, text, text) to authenticated;
grant execute on function public.panel_push_abonelik_birak(text) to authenticated;

commit;
