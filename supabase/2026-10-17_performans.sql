-- Performans değerlendirme (17.10.2026)
--
-- * performans_kriterleri: firmanın değerlendirme kriterleri ve ağırlıkları (genel yönetici düzenler).
-- * performans_donemleri: değerlendirme dönemi (ör. "2026 2. yarı"). Kapalı dönemde değişiklik yapılamaz.
-- * performans_degerlendirmeleri: personel başına dönemde bir değerlendirme. Puanlar kriterlerin o anki
--   adı ve ağırlığıyla birlikte saklanır (kriter sonradan değişse de eski değerlendirme bozulmaz).
--   Durum: Taslak -> Tamamlandı. Tamamlananı personel mobilde görür ve "Gördüm" der.
-- * Görme: personele yetkili panel kullanıcısı. Yazma: ayrıca "personel" yetkisi; değerlendiren ve
--   zamanlar veritabanında yazılır.
-- Önce deneme projesinde, sonra canlıda. Uygulama kodu tablolar yokken de açılır.
-- Geri alma: dosyanın sonu.

begin;

create table if not exists public.performans_kriterleri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  ad text not null check (char_length(trim(ad)) between 1 and 100),
  aciklama text check (aciklama is null or char_length(aciklama) <= 300),
  agirlik integer not null default 1 check (agirlik between 1 and 10),
  sira integer not null default 0,
  created_at timestamptz not null default now(),
  unique (firma_id, ad)
);

create table if not exists public.performans_donemleri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  ad text not null check (char_length(trim(ad)) between 1 and 100),
  baslangic date not null,
  bitis date not null,
  acik boolean not null default true,
  created_at timestamptz not null default now(),
  unique (firma_id, ad),
  check (bitis >= baslangic)
);

create table if not exists public.performans_degerlendirmeleri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  donem_id uuid not null references public.performans_donemleri (id) on delete cascade,
  personel_id uuid not null references public.personeller (id) on delete cascade,
  puanlar jsonb not null default '[]'::jsonb check (jsonb_typeof(puanlar) = 'array'),
  ortalama numeric(4, 2) check (ortalama is null or ortalama between 1 and 5),
  guclu_yonler text check (guclu_yonler is null or char_length(guclu_yonler) <= 1500),
  gelisim_alanlari text check (gelisim_alanlari is null or char_length(gelisim_alanlari) <= 1500),
  hedefler text check (hedefler is null or char_length(hedefler) <= 1500),
  genel_yorum text check (genel_yorum is null or char_length(genel_yorum) <= 1500),
  durum text not null default 'Taslak' check (durum in ('Taslak', 'Tamamlandı')),
  degerlendiren uuid,
  degerlendiren_ad text,
  tamamlanma timestamptz,
  personel_gordu timestamptz,
  created_at timestamptz not null default now(),
  guncelleme timestamptz not null default now(),
  unique (donem_id, personel_id)
);
create index if not exists performans_degerlendirmeleri_personel on public.performans_degerlendirmeleri (personel_id);

alter table public.performans_kriterleri enable row level security;
alter table public.performans_donemleri enable row level security;
alter table public.performans_degerlendirmeleri enable row level security;

do $$
declare
  v_tablo text;
begin
  -- Kriter ve dönem: panel kullanıcıları okur, genel yönetici yazar
  foreach v_tablo in array array['performans_kriterleri', 'performans_donemleri'] loop
    execute format('drop policy if exists perf_okuma on public.%I', v_tablo);
    execute format('create policy perf_okuma on public.%I for select to authenticated using (public.panel_kullanicisi())', v_tablo);
    execute format('drop policy if exists perf_yazma on public.%I', v_tablo);
    execute format('create policy perf_yazma on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', v_tablo);
  end loop;

  foreach v_tablo in array array['performans_kriterleri', 'performans_donemleri', 'performans_degerlendirmeleri'] loop
    execute format('drop policy if exists firma_siniri on public.%I', v_tablo);
    execute format('create policy firma_siniri on public.%I as restrictive for all to authenticated
      using (firma_id = public.aktif_firma_id()) with check (firma_id = public.aktif_firma_id())', v_tablo);
    execute format('drop trigger if exists a0_firma_doldur on public.%I', v_tablo);
    execute format('create trigger a0_firma_doldur before insert or update on public.%I for each row execute function public.firma_doldur()', v_tablo);
    execute format('drop trigger if exists islem_gecmisi_yaz on public.%I', v_tablo);
    execute format('create trigger islem_gecmisi_yaz after insert or delete or update on public.%I for each row execute function public.islem_gecmisi_yaz()', v_tablo);
  end loop;
end $$;

drop policy if exists perf_okuma on public.performans_degerlendirmeleri;
create policy perf_okuma on public.performans_degerlendirmeleri for select to authenticated
  using (public.personel_yetkisi(personel_id));
drop policy if exists perf_yazma on public.performans_degerlendirmeleri;
create policy perf_yazma on public.performans_degerlendirmeleri for all to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('personel'))
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('personel'));

-- Dönem açık olmalı ve firmayla uyuşmalı; değerlendiren, zamanlar ve "personel gördü" veritabanında yazılır
create or replace function public.performans_doldur()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_acik boolean;
  v_firma uuid;
begin
  select acik, firma_id into v_acik, v_firma from public.performans_donemleri where id = new.donem_id;
  if v_firma is distinct from new.firma_id then
    raise exception 'FIRMA_UYUSMAZ: donem';
  end if;

  -- Panel kullanıcısının işlemi (mobilde "Gördüm" sistem fonksiyonuyla yazılır, auth.uid() boştur)
  if auth.uid() is not null then
    if not v_acik then
      raise exception 'DONEM_KAPALI';
    end if;
    if tg_op = 'UPDATE' then
      if old.donem_id <> new.donem_id or old.personel_id <> new.personel_id then
        raise exception 'DEGISTIRILEMEZ';
      end if;
      new.personel_gordu := old.personel_gordu;
    else
      new.personel_gordu := null;
    end if;
    new.degerlendiren := auth.uid();
    new.guncelleme := now();
    if new.durum = 'Tamamlandı' and (tg_op = 'INSERT' or old.durum <> 'Tamamlandı') then
      new.tamamlanma := now();
    elsif new.durum = 'Taslak' then
      new.tamamlanma := null;
      new.personel_gordu := null;
    elsif tg_op = 'UPDATE' then
      new.tamamlanma := old.tamamlanma;
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.performans_doldur() from public, anon, authenticated;

drop trigger if exists b_performans_doldur on public.performans_degerlendirmeleri;
create trigger b_performans_doldur before insert or update on public.performans_degerlendirmeleri
  for each row execute function public.performans_doldur();

-- Kapalı dönemin değerlendirmesi silinemez
create or replace function public.performans_silme_kontrol()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is not null and exists (select 1 from public.performans_donemleri where id = old.donem_id and not acik) then
    raise exception 'DONEM_KAPALI';
  end if;
  return old;
end;
$function$;
revoke execute on function public.performans_silme_kontrol() from public, anon, authenticated;

drop trigger if exists b_performans_silme on public.performans_degerlendirmeleri;
create trigger b_performans_silme before delete on public.performans_degerlendirmeleri
  for each row execute function public.performans_silme_kontrol();

-- Mobil: personelin tamamlanmış değerlendirmeleri
create or replace function public.mobil_performans(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
begin
  v_pid := public.oturum_personel(p_token);
  return (
    select coalesce(json_agg(x order by x.bitis desc), '[]'::json)
    from (
      select d.id, o.ad as donem, o.bitis, d.puanlar, d.ortalama, d.guclu_yonler, d.gelisim_alanlari, d.hedefler,
             d.genel_yorum, d.degerlendiren_ad, d.tamamlanma, d.personel_gordu
      from public.performans_degerlendirmeleri d
      join public.performans_donemleri o on o.id = d.donem_id
      where d.personel_id = v_pid and d.durum = 'Tamamlandı'
      order by o.bitis desc
      limit 10
    ) x
  );
end;
$function$;

create or replace function public.performans_goruldu(p_token text, p_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
begin
  v_pid := public.oturum_personel(p_token);
  update public.performans_degerlendirmeleri
     set personel_gordu = coalesce(personel_gordu, now())
   where id = p_id and personel_id = v_pid and durum = 'Tamamlandı';
  return json_build_object('ok', found);
end;
$function$;

revoke execute on function public.mobil_performans(text) from public;
revoke execute on function public.performans_goruldu(text, uuid) from public;
grant execute on function public.mobil_performans(text) to anon, authenticated;
grant execute on function public.performans_goruldu(text, uuid) to anon, authenticated;

commit;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop function if exists public.performans_goruldu(text, uuid);
-- drop function if exists public.mobil_performans(text);
-- drop table if exists public.performans_degerlendirmeleri;
-- drop table if exists public.performans_donemleri;
-- drop table if exists public.performans_kriterleri;
-- drop function if exists public.performans_doldur();
-- drop function if exists public.performans_silme_kontrol();
-- commit;
