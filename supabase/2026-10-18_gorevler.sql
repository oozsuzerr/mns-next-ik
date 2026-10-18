-- Görevlendirme (18.10.2026)
--
-- * gorevler: yöneticinin personele verdiği görev. Durum: Bekliyor -> Devam ediyor -> Tamamlandı (ya da İptal).
--   Personel mobilden durumu değiştirir ve not düşer (personel_notu); yönetici panelden görev verir,
--   düzenler, iptal eder ya da tamamlandı işaretler.
-- * Kim görev verebilir: personele yetkili panel kullanıcısı (genel yönetici her personele, şube müdürü
--   kendi şubesinin personeline). Atayan, zamanlar ve personel notu veritabanında korunur.
-- * Modül anahtarı "gorev": firma paketine eklenir; tam paketli mevcut firmalarda otomatik açılır.
-- * Mobil: mobil_gorevler(token) listeler (görüldü işaretler), gorev_guncelle(token, id, durum, not).
--   Mobil işlemler "mns.mobil_islem" bayrağını koyar: aynı tarayıcıda panel oturumu da açık olsa
--   (auth.uid() dolu) personel işlemi yönetici işlemi sanılmaz. Performans "Gördüm" de aynı şekilde düzeltildi.
-- Önce deneme projesinde, sonra canlıda. Önkoşul: 2026-10-18_firma_paketi.sql.
-- Geri alma: dosyanın sonu.

begin;

-- Firma paketine "gorev" modülü
alter table public.firmalar drop constraint if exists firmalar_moduller_kontrol;
alter table public.firmalar add constraint firmalar_moduller_kontrol
  check (moduller <@ '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim,gorev}'::text[]);
alter table public.firmalar alter column moduller set default '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim,gorev}';
update public.firmalar set moduller = moduller || '{gorev}'::text[]
 where moduller @> '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim}'::text[] and not ('gorev' = any (moduller));

create table if not exists public.gorevler (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  personel_id uuid not null references public.personeller (id) on delete cascade,
  baslik text not null check (char_length(trim(baslik)) between 1 and 150),
  aciklama text check (aciklama is null or char_length(aciklama) <= 2000),
  oncelik text not null default 'Normal' check (oncelik in ('Düşük', 'Normal', 'Yüksek', 'Acil')),
  son_tarih date,
  durum text not null default 'Bekliyor' check (durum in ('Bekliyor', 'Devam ediyor', 'Tamamlandı', 'İptal')),
  atayan uuid,
  atayan_ad text,
  personel_notu text check (personel_notu is null or char_length(personel_notu) <= 1000),
  goruldu timestamptz,
  tamamlanma timestamptz,
  tamamlayan text check (tamamlayan is null or tamamlayan in ('personel', 'yonetici')),
  created_at timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create index if not exists gorevler_personel on public.gorevler (personel_id, durum, created_at desc);
create index if not exists gorevler_firma on public.gorevler (firma_id, created_at desc);
alter table public.gorevler enable row level security;

drop policy if exists gorev_okuma on public.gorevler;
create policy gorev_okuma on public.gorevler for select to authenticated
  using (public.personel_yetkisi(personel_id));
drop policy if exists gorev_yazma on public.gorevler;
create policy gorev_yazma on public.gorevler for all to authenticated
  using (public.personel_yetkisi(personel_id))
  with check (public.personel_yetkisi(personel_id));
drop policy if exists firma_siniri on public.gorevler;
create policy firma_siniri on public.gorevler as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());
drop policy if exists modul_siniri on public.gorevler;
create policy modul_siniri on public.gorevler as restrictive for all to authenticated
  using (public.modul_acik('gorev')) with check (public.modul_acik('gorev'));

-- Panel işleminde: atayan veritabanından yazılır; personel notu ve "görüldü" panelden değiştirilemez.
-- Mobil işlem (mns.mobil_islem) panel işlemi sayılmaz.
create or replace function public.gorev_doldur()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  new.guncelleme := now();
  if auth.uid() is not null and coalesce(current_setting('mns.mobil_islem', true), '') <> '1' then
    if tg_op = 'INSERT' then
      new.atayan := auth.uid();
      new.personel_notu := null;
      new.goruldu := null;
      new.tamamlayan := case when new.durum = 'Tamamlandı' then 'yonetici' end;
    else
      if new.personel_id <> old.personel_id then
        raise exception 'DEGISTIRILEMEZ';
      end if;
      new.atayan := old.atayan;
      new.atayan_ad := old.atayan_ad;
      new.personel_notu := old.personel_notu;
      new.goruldu := old.goruldu;
      if new.durum = 'Tamamlandı' and old.durum <> 'Tamamlandı' then
        new.tamamlayan := 'yonetici';
      elsif new.durum <> 'Tamamlandı' then
        new.tamamlayan := null;
      else
        new.tamamlayan := old.tamamlayan;
      end if;
    end if;
    if new.durum = 'Tamamlandı' and (tg_op = 'INSERT' or old.durum <> 'Tamamlandı') then
      new.tamamlanma := now();
    elsif new.durum <> 'Tamamlandı' then
      new.tamamlanma := null;
    elsif tg_op = 'UPDATE' then
      new.tamamlanma := old.tamamlanma;
    end if;
  end if;
  return new;
end;
$function$;
revoke execute on function public.gorev_doldur() from public, anon, authenticated;

drop trigger if exists a0_firma_doldur on public.gorevler;
create trigger a0_firma_doldur before insert or update on public.gorevler
  for each row execute function public.firma_doldur();
drop trigger if exists b_gorev_doldur on public.gorevler;
create trigger b_gorev_doldur before insert or update on public.gorevler
  for each row execute function public.gorev_doldur();
drop trigger if exists islem_gecmisi_yaz on public.gorevler;
create trigger islem_gecmisi_yaz after insert or delete or update on public.gorevler
  for each row execute function public.islem_gecmisi_yaz();

-- Mobil: açık görevler + son 30 günde kapananlar; listelenen yeni görevler "görüldü" olur
create or replace function public.mobil_gorevler(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_sonuc json;
begin
  v_pid := public.oturum_personel(p_token);
  perform set_config('mns.mobil_islem', '1', true);
  if not exists (select 1 from public.personeller p join public.firmalar f on f.id = p.firma_id
                 where p.id = v_pid and 'gorev' = any (f.moduller)) then
    return '[]'::json;
  end if;

  select coalesce(json_agg(x order by x.acik desc, x.son_tarih nulls last, x.created_at desc), '[]'::json) into v_sonuc
  from (
    select g.id, g.baslik, g.aciklama, g.oncelik, g.son_tarih, g.durum, g.atayan_ad, g.personel_notu,
           g.tamamlanma, g.created_at, g.goruldu is null as yeni,
           g.durum in ('Bekliyor', 'Devam ediyor') as acik
    from public.gorevler g
    where g.personel_id = v_pid
      and (g.durum in ('Bekliyor', 'Devam ediyor') or g.guncelleme >= now() - interval '30 days')
    order by g.created_at desc
    limit 50
  ) x;

  update public.gorevler set goruldu = now() where personel_id = v_pid and goruldu is null;
  return v_sonuc;
end;
$function$;

create or replace function public.gorev_guncelle(p_token text, p_id uuid, p_durum text, p_not text default null)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_eski text;
begin
  v_pid := public.oturum_personel(p_token);
  perform set_config('mns.mobil_islem', '1', true);
  if p_durum not in ('Devam ediyor', 'Tamamlandı') then
    return json_build_object('ok', false, 'hata', 'DURUM_GECERSIZ');
  end if;
  select durum into v_eski from public.gorevler where id = p_id and personel_id = v_pid;
  if v_eski is null then
    return json_build_object('ok', false, 'hata', 'GOREV_YOK');
  end if;
  if v_eski in ('Tamamlandı', 'İptal') then
    return json_build_object('ok', false, 'hata', 'GOREV_KAPALI');
  end if;

  update public.gorevler
     set durum = p_durum,
         personel_notu = coalesce(nullif(left(trim(coalesce(p_not, '')), 1000), ''), personel_notu),
         goruldu = coalesce(goruldu, now()),
         tamamlanma = case when p_durum = 'Tamamlandı' then now() end,
         tamamlayan = case when p_durum = 'Tamamlandı' then 'personel' end
   where id = p_id;
  return json_build_object('ok', true);
end;
$function$;

revoke execute on function public.mobil_gorevler(text) from public;
revoke execute on function public.gorev_guncelle(text, uuid, text, text) from public;
grant execute on function public.mobil_gorevler(text) to anon, authenticated;
grant execute on function public.gorev_guncelle(text, uuid, text, text) to anon, authenticated;

-- Performans "Gördüm": aynı düzeltme (gövdeler 2026-10-17_performans.sql ile aynı, yalnızca bayrak eklendi)
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

  if auth.uid() is not null and coalesce(current_setting('mns.mobil_islem', true), '') <> '1' then
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
  perform set_config('mns.mobil_islem', '1', true);
  update public.performans_degerlendirmeleri
     set personel_gordu = coalesce(personel_gordu, now())
   where id = p_id and personel_id = v_pid and durum = 'Tamamlandı';
  return json_build_object('ok', found);
end;
$function$;

commit;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop function if exists public.gorev_guncelle(text, uuid, text, text);
-- drop function if exists public.mobil_gorevler(text);
-- drop table if exists public.gorevler;
-- drop function if exists public.gorev_doldur();
-- update public.firmalar set moduller = array_remove(moduller, 'gorev');
-- alter table public.firmalar drop constraint if exists firmalar_moduller_kontrol;
-- alter table public.firmalar add constraint firmalar_moduller_kontrol
--   check (moduller <@ '{duyuru,zimmet,odeme,kontrol,egitim,performans,isealim}'::text[]);
-- commit;
