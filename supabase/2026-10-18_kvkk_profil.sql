-- KVKK aydınlatma onayı, mobil profil ve personelin maaş özeti (18.10.2026)
--
-- * firmalar.kvkk_metni / kvkk_surum: firmanın aydınlatma metni (boşsa uygulamadaki varsayılan metin). Genel yönetici
--   metni değiştirince sürüm artar ve bütün personelden yeniden onay istenir.
-- * kvkk_onaylari: personelin hangi sürümü ne zaman onayladığı. Yalnızca mobil uygulama (mobil_kvkk_onayla) yazar;
--   panel okur (personel yetkisi kadar). Silinemez, değiştirilemez.
-- * mobil_profil: personelin ünvanı, departmanı ve KVKK durumu (mobil uygulama açılışında).
-- * mobil_maas_ozeti: firma "personel maaş özetini görsün" kuralını açtıysa ve bordro modülü açıksa personelin kendi
--   ücreti, ayın onaylı mesaileri, onaylı avans/masrafı ve ek kazançları (tahmini net uygulamada hesaplanır).
-- Önce deneme projesinde, sonra canlıda. Önkoşul: 2026-10-18_ek_kazanc.sql. Tekrar çalıştırılabilir.
-- Geri alma: dosyanın sonu.

begin;

alter table public.firmalar add column if not exists kvkk_metni text check (kvkk_metni is null or char_length(kvkk_metni) <= 20000);
alter table public.firmalar add column if not exists kvkk_surum integer not null default 1 check (kvkk_surum >= 1);

create table if not exists public.kvkk_onaylari (
  id bigint generated always as identity primary key,
  firma_id uuid not null references public.firmalar (id) on delete cascade,
  personel_id uuid not null references public.personeller (id) on delete cascade,
  surum integer not null,
  onay_zamani timestamptz not null default now(),
  cihaz text check (cihaz is null or char_length(cihaz) <= 300),
  unique (personel_id, surum)
);
alter table public.kvkk_onaylari enable row level security;

drop policy if exists kvkk_okuma on public.kvkk_onaylari;
create policy kvkk_okuma on public.kvkk_onaylari for select to authenticated
  using (public.personel_yetkisi(personel_id));
drop policy if exists firma_siniri on public.kvkk_onaylari;
create policy firma_siniri on public.kvkk_onaylari as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

-- Genel yönetici: aydınlatma metnini kaydeder (boş = varsayılan metin); metin değişince sürüm artar
create or replace function public.kvkk_metni_kaydet(p_metin text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_firma uuid := public.aktif_firma_id();
  v_surum integer;
begin
  if not public.is_admin() or v_firma is null then
    raise exception 'YETKISIZ';
  end if;
  update public.firmalar
     set kvkk_metni = nullif(btrim(p_metin), ''),
         kvkk_surum = case when coalesce(kvkk_metni, '') is distinct from coalesce(nullif(btrim(p_metin), ''), '') then kvkk_surum + 1 else kvkk_surum end
   where id = v_firma
  returning kvkk_surum into v_surum;
  return v_surum;
end;
$function$;

-- Panel: firmanın metni ve sürümü
create or replace function public.kvkk_bilgisi()
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select json_build_object('metin', f.kvkk_metni, 'surum', f.kvkk_surum, 'firma', f.ad)
    from public.firmalar f where f.id = public.aktif_firma_id() and public.panel_kullanicisi();
$function$;

-- Mobil: profil ve KVKK durumu
create or replace function public.mobil_profil(p_token text)
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid := public.oturum_personel(p_token);
begin
  return (
    select json_build_object(
      'unvan', p.unvan,
      'departman', p.departman,
      'firma', f.ad,
      'kvkk', json_build_object(
        'surum', f.kvkk_surum,
        'metin', f.kvkk_metni,
        'onayli', exists (select 1 from public.kvkk_onaylari k where k.personel_id = p.id and k.surum = f.kvkk_surum),
        'onay_zamani', (select max(k.onay_zamani) from public.kvkk_onaylari k where k.personel_id = p.id and k.surum = f.kvkk_surum)
      ),
      'maas_ozeti', ('bordro' = any (f.moduller)) and coalesce((select (b.yasal -> 'kurallar' ->> 'personelMaasOzeti')::boolean from public.bordro_ayarlari b where b.firma_id = f.id), false)
    )
    from public.personeller p join public.firmalar f on f.id = p.firma_id
   where p.id = v_pid
  );
end;
$function$;

-- Mobil: aydınlatma metnini okudum, onaylıyorum
create or replace function public.mobil_kvkk_onayla(p_token text, p_surum integer, p_cihaz text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid := public.oturum_personel(p_token);
  v_firma uuid;
  v_surum integer;
begin
  select p.firma_id, f.kvkk_surum into v_firma, v_surum
    from public.personeller p join public.firmalar f on f.id = p.firma_id where p.id = v_pid;
  if p_surum is distinct from v_surum then
    raise exception 'SURUM_DEGISTI';
  end if;
  perform set_config('mns.mobil_islem', '1', true);
  insert into public.kvkk_onaylari (firma_id, personel_id, surum, cihaz)
  values (v_firma, v_pid, v_surum, left(p_cihaz, 300))
  on conflict (personel_id, surum) do nothing;
end;
$function$;

-- Mobil: personelin aylık maaş özeti için veriler (yalnızca firma açtıysa)
create or replace function public.mobil_maas_ozeti(p_token text, p_ay text)
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid := public.oturum_personel(p_token);
  v_firma uuid;
  v_acik boolean;
  v_bas date;
  v_son date;
begin
  if p_ay !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'AY_GECERSIZ';
  end if;
  v_bas := (p_ay || '-01')::date;
  v_son := (v_bas + interval '1 month')::date;
  select p.firma_id, ('bordro' = any (f.moduller)) and coalesce((select (b.yasal -> 'kurallar' ->> 'personelMaasOzeti')::boolean from public.bordro_ayarlari b where b.firma_id = f.id), false)
    into v_firma, v_acik
    from public.personeller p join public.firmalar f on f.id = p.firma_id where p.id = v_pid;
  if not coalesce(v_acik, false) then
    return json_build_object('acik', false);
  end if;
  return json_build_object(
    'acik', true,
    'ucret', (select o.ucret from public.personel_ozluk o where o.personel_id = v_pid),
    'ucret_turu', (select o.ucret_turu from public.personel_ozluk o where o.personel_id = v_pid),
    'ayarlar', (select json_build_object('yasal', b.yasal, 'mesai_kalemleri', b.mesai_kalemleri) from public.bordro_ayarlari b where b.firma_id = v_firma),
    'calismayan_gunler', (select a.calismayan_gunler from public.sirket_ayarlari a where a.firma_id = v_firma),
    'tatiller', (
      select coalesce(json_agg(t.tarih order by t.tarih), '[]'::json) from public.resmi_tatiller t
       where t.tarih >= v_bas and t.tarih < v_son and not coalesce(t.yarim_gun, false) and (t.firma_id is null or t.firma_id = v_firma)
    ),
    'mesailer', (
      select coalesce(json_agg(json_build_object('tarih', m.tarih, 'sure_dk', m.sure_dk) order by m.tarih), '[]'::json)
        from public.mesai_talepleri m where m.personel_id = v_pid and m.durum = 'ONAYLANDI' and m.tarih >= v_bas and m.tarih < v_son
    ),
    'avans', (select coalesce(sum(o.tutar), 0) from public.odeme_talepleri o where o.personel_id = v_pid and o.tur = 'Avans' and o.durum in ('ONAYLANDI', 'ODENDI') and o.tarih >= v_bas and o.tarih < v_son),
    'masraf', (select coalesce(sum(o.tutar), 0) from public.odeme_talepleri o where o.personel_id = v_pid and o.tur = 'Masraf' and o.durum in ('ONAYLANDI', 'ODENDI') and o.tarih >= v_bas and o.tarih < v_son),
    'ekler', (
      select coalesce(json_agg(json_build_object('tur', e.tur, 'tutar', e.tutar, 'vergili', e.vergili)), '[]'::json)
        from public.ek_kazanclar e where e.personel_id = v_pid and e.donem = p_ay
    )
  );
end;
$function$;

revoke execute on function public.kvkk_metni_kaydet(text) from public, anon;
revoke execute on function public.kvkk_bilgisi() from public, anon;
revoke execute on function public.mobil_profil(text) from public;
revoke execute on function public.mobil_kvkk_onayla(text, integer, text) from public;
revoke execute on function public.mobil_maas_ozeti(text, text) from public;
grant execute on function public.kvkk_metni_kaydet(text) to authenticated;
grant execute on function public.kvkk_bilgisi() to authenticated;
grant execute on function public.mobil_profil(text) to anon, authenticated;
grant execute on function public.mobil_kvkk_onayla(text, integer, text) to anon, authenticated;
grant execute on function public.mobil_maas_ozeti(text, text) to anon, authenticated;

commit;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop function if exists public.mobil_maas_ozeti(text, text);
-- drop function if exists public.mobil_kvkk_onayla(text, integer, text);
-- drop function if exists public.mobil_profil(text);
-- drop function if exists public.kvkk_bilgisi();
-- drop function if exists public.kvkk_metni_kaydet(text);
-- drop table if exists public.kvkk_onaylari;
-- alter table public.firmalar drop column if exists kvkk_surum;
-- alter table public.firmalar drop column if exists kvkk_metni;
-- commit;
