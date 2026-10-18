-- İşe alım (18.10.2026)
--
-- * ise_alim_ilanlari: açık pozisyon (şubeye bağlı ya da firma geneli), kadro sayısı, durum.
-- * adaylar: ilana başvuran aday, aşaması (Başvuru -> Ön görüşme -> Mülakat -> Teklif -> İşe alındı /
--   Reddedildi / Vazgeçti), kaynak, puan, KVKK onayı. İşe alınınca personel kaydına bağlanabilir.
-- * aday_gorusmeleri: adayla yapılan görüşmeler (tarih, tür, görüşmeci, puan, not).
-- * CV dosyaları "aday-cv" gizli kovasında: <firma_id>/<ilan_id>/<dosya>.
-- * Erişim: genel yönetici her ilana; şube müdürü yalnızca kendi şubesinin ilanına. Yazma için ayrıca
--   "personel" yetkisi. İlan açma/kapama da aynı kurala tabidir.
-- * KVKK: aday verisi işe alım amacıyla sınırlı süre saklanmalı; panelde eski adayları silme düğmesi vardır.
-- Önce deneme projesinde, sonra canlıda. Uygulama kodu tablolar yokken de açılır.
-- Geri alma: dosyanın sonu.

begin;

create table if not exists public.ise_alim_ilanlari (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  sube_id uuid references public.subeler (id) on delete set null,
  baslik text not null check (char_length(trim(baslik)) between 1 and 150),
  departman text check (departman is null or char_length(departman) <= 100),
  aciklama text check (aciklama is null or char_length(aciklama) <= 3000),
  kadro integer not null default 1 check (kadro between 1 and 500),
  durum text not null default 'Açık' check (durum in ('Açık', 'Beklemede', 'Kapandı')),
  acilis date not null default current_date,
  kapanis date,
  created_at timestamptz not null default now()
);
create index if not exists ise_alim_ilanlari_firma on public.ise_alim_ilanlari (firma_id, acilis desc);

create table if not exists public.adaylar (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  ilan_id uuid not null references public.ise_alim_ilanlari (id) on delete cascade,
  ad text not null check (char_length(trim(ad)) between 1 and 100),
  soyad text not null check (char_length(trim(soyad)) between 1 and 100),
  telefon text check (telefon is null or char_length(telefon) <= 30),
  eposta text check (eposta is null or char_length(eposta) <= 150),
  kaynak text check (kaynak is null or kaynak in ('Kariyer sitesi', 'İŞKUR', 'Tavsiye', 'Sosyal medya', 'Doğrudan başvuru', 'Diğer')),
  asama text not null default 'Başvuru' check (asama in ('Başvuru', 'Ön görüşme', 'Mülakat', 'Teklif', 'İşe alındı', 'Reddedildi', 'Vazgeçti')),
  puan integer check (puan is null or puan between 1 and 5),
  notlar text check (notlar is null or char_length(notlar) <= 2000),
  cv_yolu text unique,
  kvkk_onay boolean not null default false,
  basvuru date not null default current_date,
  personel_id uuid references public.personeller (id) on delete set null,
  created_at timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create index if not exists adaylar_ilan on public.adaylar (ilan_id, asama);

create table if not exists public.aday_gorusmeleri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  aday_id uuid not null references public.adaylar (id) on delete cascade,
  tarih timestamptz not null,
  tur text not null default 'Yüz yüze' check (tur in ('Telefon', 'Yüz yüze', 'Online')),
  gorusmeci text check (gorusmeci is null or char_length(gorusmeci) <= 150),
  puan integer check (puan is null or puan between 1 and 5),
  notlar text check (notlar is null or char_length(notlar) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists aday_gorusmeleri_aday on public.aday_gorusmeleri (aday_id, tarih);

-- İlana erişim: kendi firmasının ilanı; genel yönetici hepsine, şube müdürü kendi şubesininkine
create or replace function public.ilan_yetkisi(p_ilan_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.ise_alim_ilanlari i
    where i.id = p_ilan_id and i.firma_id = public.aktif_firma_id()
      and (public.is_admin() or (i.sube_id is not null and public.sube_yetkisi(i.sube_id)))
  );
$function$;

create or replace function public.aday_yetkisi(p_aday_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.adaylar a where a.id = p_aday_id and public.ilan_yetkisi(a.ilan_id));
$function$;

alter table public.ise_alim_ilanlari enable row level security;
alter table public.adaylar enable row level security;
alter table public.aday_gorusmeleri enable row level security;

drop policy if exists ilan_okuma on public.ise_alim_ilanlari;
create policy ilan_okuma on public.ise_alim_ilanlari for select to authenticated
  using (public.is_admin() or (sube_id is not null and public.sube_yetkisi(sube_id)));
drop policy if exists ilan_yazma on public.ise_alim_ilanlari;
create policy ilan_yazma on public.ise_alim_ilanlari for all to authenticated
  using (public.yetkisi_var('personel') and (public.is_admin() or (sube_id is not null and public.sube_yetkisi(sube_id))))
  with check (public.yetkisi_var('personel') and (public.is_admin() or (sube_id is not null and public.sube_yetkisi(sube_id))));

drop policy if exists aday_okuma on public.adaylar;
create policy aday_okuma on public.adaylar for select to authenticated
  using (public.ilan_yetkisi(ilan_id));
drop policy if exists aday_yazma on public.adaylar;
create policy aday_yazma on public.adaylar for all to authenticated
  using (public.ilan_yetkisi(ilan_id) and public.yetkisi_var('personel'))
  with check (public.ilan_yetkisi(ilan_id) and public.yetkisi_var('personel')
              and (personel_id is null or public.personel_yetkisi(personel_id)));

drop policy if exists gorusme_okuma on public.aday_gorusmeleri;
create policy gorusme_okuma on public.aday_gorusmeleri for select to authenticated
  using (public.aday_yetkisi(aday_id));
drop policy if exists gorusme_yazma on public.aday_gorusmeleri;
create policy gorusme_yazma on public.aday_gorusmeleri for all to authenticated
  using (public.aday_yetkisi(aday_id) and public.yetkisi_var('personel'))
  with check (public.aday_yetkisi(aday_id) and public.yetkisi_var('personel'));

do $$
declare
  v_tablo text;
begin
  foreach v_tablo in array array['ise_alim_ilanlari', 'adaylar', 'aday_gorusmeleri'] loop
    execute format('drop policy if exists firma_siniri on public.%I', v_tablo);
    execute format('create policy firma_siniri on public.%I as restrictive for all to authenticated
      using (firma_id = public.aktif_firma_id()) with check (firma_id = public.aktif_firma_id())', v_tablo);
    execute format('drop trigger if exists a0_firma_doldur on public.%I', v_tablo);
    execute format('create trigger a0_firma_doldur before insert or update on public.%I for each row execute function public.firma_doldur()', v_tablo);
    execute format('drop trigger if exists islem_gecmisi_yaz on public.%I', v_tablo);
    execute format('create trigger islem_gecmisi_yaz after insert or delete or update on public.%I for each row execute function public.islem_gecmisi_yaz()', v_tablo);
  end loop;
end $$;

-- Aday ilanın firmasından olmalı; görüşme adayın firmasından; güncelleme zamanı
create or replace function public.ise_alim_kontrol()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_table_name = 'adaylar' then
    if not exists (select 1 from public.ise_alim_ilanlari i where i.id = new.ilan_id and i.firma_id = new.firma_id) then
      raise exception 'FIRMA_UYUSMAZ: ilan';
    end if;
    new.guncelleme := now();
  elsif tg_table_name = 'aday_gorusmeleri' then
    if not exists (select 1 from public.adaylar a where a.id = new.aday_id and a.firma_id = new.firma_id) then
      raise exception 'FIRMA_UYUSMAZ: aday';
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.ise_alim_kontrol() from public, anon, authenticated;

drop trigger if exists b_ise_alim_kontrol on public.adaylar;
create trigger b_ise_alim_kontrol before insert or update on public.adaylar
  for each row execute function public.ise_alim_kontrol();
drop trigger if exists b_ise_alim_kontrol on public.aday_gorusmeleri;
create trigger b_ise_alim_kontrol before insert or update on public.aday_gorusmeleri
  for each row execute function public.ise_alim_kontrol();

-- CV deposu
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aday-cv', 'aday-cv', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists aday_cv_okuma on storage.objects;
create policy aday_cv_okuma on storage.objects for select to authenticated
  using (
    bucket_id = 'aday-cv'
    and (storage.foldername(name))[1] = public.aktif_firma_id()::text
    and public.ilan_yetkisi(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists aday_cv_yukleme on storage.objects;
create policy aday_cv_yukleme on storage.objects for insert to authenticated
  with check (
    bucket_id = 'aday-cv'
    and public.yetkisi_var('personel')
    and (storage.foldername(name))[1] = public.aktif_firma_id()::text
    and public.ilan_yetkisi(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists aday_cv_silme on storage.objects;
create policy aday_cv_silme on storage.objects for delete to authenticated
  using (
    bucket_id = 'aday-cv'
    and public.yetkisi_var('personel')
    and (storage.foldername(name))[1] = public.aktif_firma_id()::text
    and public.ilan_yetkisi(((storage.foldername(name))[2])::uuid)
  );

commit;

-- =====================================================================
-- GERİ ALMA (CV dosyaları Storage'da kalır)
-- =====================================================================
-- begin;
-- drop policy if exists aday_cv_okuma on storage.objects;
-- drop policy if exists aday_cv_yukleme on storage.objects;
-- drop policy if exists aday_cv_silme on storage.objects;
-- drop table if exists public.aday_gorusmeleri;
-- drop table if exists public.adaylar;
-- drop table if exists public.ise_alim_ilanlari;
-- drop function if exists public.aday_yetkisi(uuid);
-- drop function if exists public.ilan_yetkisi(uuid);
-- drop function if exists public.ise_alim_kontrol();
-- commit;
