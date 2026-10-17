-- Duyurular (17.10.2026)
--
-- * duyurular: panelden yazılan duyuru. sube_id boşsa bütün firmaya, doluysa yalnızca o şubenin
--   personeline gider. bitis_tarihi geçince mobilde görünmez (panelde arşivde kalır).
-- * duyuru_okumalar: personelin mobilde "Okudum" demesi (kim, ne zaman)
-- * Yazma: genel yönetici her duyuruyu; şube müdürü yalnızca kendi şubesine olanı.
--   Okuma: genel yönetici hepsini; şube müdürü firma geneli + kendi şubeleri.
-- * Mobil: mobil_duyurular(token) listeyi, duyuru_okundu(token, id) okundu kaydını yazar.
-- Önce deneme projesinde, sonra canlıda. Uygulama kodu bu tablolar yokken de açılır
-- (yalnızca İK > Duyurular ve mobildeki duyuru kartı çalışmaz).
-- Geri alma: dosyanın sonu.

begin;

create table if not exists public.duyurular (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  sube_id uuid references public.subeler (id) on delete cascade,
  baslik text not null check (char_length(trim(baslik)) between 1 and 150),
  metin text not null check (char_length(trim(metin)) between 1 and 4000),
  onemli boolean not null default false,
  bitis_tarihi date,
  yazan uuid default auth.uid(),
  yazan_ad text,
  created_at timestamptz not null default now()
);
create index if not exists duyurular_firma on public.duyurular (firma_id, created_at desc);
alter table public.duyurular enable row level security;

drop policy if exists duyuru_okuma on public.duyurular;
create policy duyuru_okuma on public.duyurular for select to authenticated
  using (public.is_admin() or (public.panel_kullanicisi() and (sube_id is null or public.sube_yetkisi(sube_id))));
drop policy if exists duyuru_yazma on public.duyurular;
create policy duyuru_yazma on public.duyurular for all to authenticated
  using (public.is_admin() or (sube_id is not null and public.sube_yetkisi(sube_id)))
  with check (public.is_admin() or (sube_id is not null and public.sube_yetkisi(sube_id)));
drop policy if exists firma_siniri on public.duyurular;
create policy firma_siniri on public.duyurular as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

create table if not exists public.duyuru_okumalar (
  duyuru_id uuid not null references public.duyurular (id) on delete cascade,
  personel_id uuid not null references public.personeller (id) on delete cascade,
  firma_id uuid not null references public.firmalar (id),
  okundu timestamptz not null default now(),
  primary key (duyuru_id, personel_id)
);
create index if not exists duyuru_okumalar_personel on public.duyuru_okumalar (personel_id);
alter table public.duyuru_okumalar enable row level security;

-- Panel yalnızca okur; kayıt mobildeki duyuru_okundu ile yazılır
drop policy if exists okuma_panel on public.duyuru_okumalar;
create policy okuma_panel on public.duyuru_okumalar for select to authenticated
  using (public.personel_yetkisi(personel_id));
drop policy if exists firma_siniri on public.duyuru_okumalar;
create policy firma_siniri on public.duyuru_okumalar as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

drop trigger if exists a0_firma_doldur on public.duyurular;
create trigger a0_firma_doldur before insert or update on public.duyurular
  for each row execute function public.firma_doldur();
drop trigger if exists islem_gecmisi_yaz on public.duyurular;
create trigger islem_gecmisi_yaz after insert or delete or update on public.duyurular
  for each row execute function public.islem_gecmisi_yaz();
drop trigger if exists a0_firma_doldur on public.duyuru_okumalar;
create trigger a0_firma_doldur before insert or update on public.duyuru_okumalar
  for each row execute function public.firma_doldur();

-- Mobil: personelin görebileceği güncel duyurular (son 90 gün, süresi dolmamış), yeniden eskiye
create or replace function public.mobil_duyurular(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_firma uuid;
  v_sube uuid;
begin
  v_pid := public.oturum_personel(p_token);
  select firma_id, varsayilan_sube_id into v_firma, v_sube from public.personeller where id = v_pid;

  return (
    select coalesce(json_agg(x order by x.onemli desc, x.created_at desc), '[]'::json)
    from (
      select d.id, d.baslik, d.metin, d.onemli, d.created_at, d.yazan_ad, s.ad as sube_ad,
             o.okundu is not null as okundu
      from public.duyurular d
      left join public.subeler s on s.id = d.sube_id
      left join public.duyuru_okumalar o on o.duyuru_id = d.id and o.personel_id = v_pid
      where d.firma_id = v_firma
        and (d.sube_id is null or d.sube_id = v_sube)
        and (d.bitis_tarihi is null or d.bitis_tarihi >= current_date)
        and d.created_at >= now() - interval '90 days'
      order by d.onemli desc, d.created_at desc
      limit 30
    ) x
  );
end;
$function$;

create or replace function public.duyuru_okundu(p_token text, p_duyuru_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_firma uuid;
  v_sube uuid;
begin
  v_pid := public.oturum_personel(p_token);
  select firma_id, varsayilan_sube_id into v_firma, v_sube from public.personeller where id = v_pid;

  if not exists (
    select 1 from public.duyurular d
    where d.id = p_duyuru_id and d.firma_id = v_firma and (d.sube_id is null or d.sube_id = v_sube)
  ) then
    return json_build_object('ok', false, 'hata', 'DUYURU_YOK');
  end if;

  insert into public.duyuru_okumalar (duyuru_id, personel_id, firma_id)
  values (p_duyuru_id, v_pid, v_firma)
  on conflict do nothing;
  return json_build_object('ok', true);
end;
$function$;

revoke execute on function public.mobil_duyurular(text) from public;
revoke execute on function public.duyuru_okundu(text, uuid) from public;
grant execute on function public.mobil_duyurular(text) to anon, authenticated;
grant execute on function public.duyuru_okundu(text, uuid) to anon, authenticated;

commit;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop function if exists public.duyuru_okundu(text, uuid);
-- drop function if exists public.mobil_duyurular(text);
-- drop table if exists public.duyuru_okumalar;
-- drop table if exists public.duyurular;
-- commit;
