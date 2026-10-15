-- Tolerans ayarları, yıllık izin hakkı/bakiyesi ve saatlik izin (15.10.2026)
-- Önce 2026-10-15_yetkiler_gecmis_ay_kilidi.sql çalıştırılmış olmalı.
-- Supabase > SQL Editor'de bir kez, tek parça olarak çalıştırın. Hata olursa hiçbir şey değişmez.

begin;

-- =====================================================================
-- 1) ŞİRKET AYARLARI (tek satır)
-- =====================================================================
create table if not exists public.sirket_ayarlari (
  id boolean primary key default true check (id),
  -- Vardiya başlangıcından bu kadar dakika sonrasına kadar gecikme sayılmaz
  gecikme_tolerans_dk integer not null default 5 check (gecikme_tolerans_dk between 0 and 120),
  -- Vardiya bitişinden bu kadar dakika sonrası plan dışı mesai sayılır
  mesai_tolerans_dk integer not null default 15 check (mesai_tolerans_dk between 0 and 240),
  -- Bu süreyi aşan çalışmada vardiya molası düşülür
  mola_esigi_dk integer not null default 240 check (mola_esigi_dk between 0 and 720),
  -- Çıkış basılmazsa vardiya bitişinden bu kadar sonra "çıkış eksik" sayılır (fazla mesai payı)
  cikis_tolerans_dk integer not null default 360 check (cikis_tolerans_dk between 30 and 720),
  -- Vardiya başlangıcından bu kadar önce yapılan giriş o vardiyaya sayılır
  erken_giris_payi_dk integer not null default 240 check (erken_giris_payi_dk between 0 and 480),
  -- Saatlik izinlerin güne çevrilmesinde kullanılan günlük çalışma süresi (45 sa / 6 gün = 450 dk)
  izin_gunu_dk integer not null default 450 check (izin_gunu_dk between 60 and 720),
  guncelleme timestamptz not null default now()
);
insert into public.sirket_ayarlari (id) values (true) on conflict do nothing;

alter table public.sirket_ayarlari enable row level security;
drop policy if exists "ayarlar_okuma" on public.sirket_ayarlari;
drop policy if exists "ayarlar_degistirme" on public.sirket_ayarlari;
create policy "ayarlar_okuma" on public.sirket_ayarlari
  for select to authenticated using (public.panel_kullanicisi());
create policy "ayarlar_degistirme" on public.sirket_ayarlari
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop trigger if exists islem_gecmisi_yaz on public.sirket_ayarlari;
create trigger islem_gecmisi_yaz after insert or update or delete on public.sirket_ayarlari
  for each row execute function public.islem_gecmisi_yaz();

-- =====================================================================
-- 2) PERSONEL: KIDEM BİLGİLERİ
-- =====================================================================
alter table public.personeller add column if not exists ise_giris_tarihi date;
alter table public.personeller add column if not exists dogum_tarihi date;
-- Sisteme geçişte personelin kalan (devreden) yıllık izin günü ve bunun geçerli olduğu tarih
alter table public.personeller add column if not exists devreden_izin_gun numeric(6, 2) not null default 0;
alter table public.personeller add column if not exists devir_tarihi date;

-- =====================================================================
-- 3) İZİNLER: SAATLİK İZİN VE GÜN SAYISI
-- =====================================================================
alter table public.izinler add column if not exists baslangic_saat time;
alter table public.izinler add column if not exists bitis_saat time;
-- İzinden düşülecek gün (iş günü; saatlikte saat / günlük çalışma süresi)
alter table public.izinler add column if not exists gun_sayisi numeric(6, 2);

-- Tarih aralığındaki iş günleri: resmi tatiller ve hafta tatilleri (plandaki tatil,
-- plan yoksa Pazar) sayılmaz
create or replace function public.izin_gun_sayisi(p_personel_id uuid, p_bas date, p_bit date)
 returns integer
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select count(*)::integer
  from generate_series(p_bas, p_bit, interval '1 day') as g(gun)
  where not exists (select 1 from public.resmi_tatiller t where t.tarih = g.gun::date)
    and not (
      exists (
        select 1 from public.vardiya_plani v
        where v.personel_id = p_personel_id and v.tarih = g.gun::date and v.tur = 'TATIL'
      )
      or (
        extract(isodow from g.gun) = 7
        and not exists (select 1 from public.vardiya_plani v where v.personel_id = p_personel_id and v.tarih = g.gun::date)
      )
    );
$function$;

create or replace function public.izin_gun_hesapla()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_gun_dk integer;
begin
  if new.izin_turu = 'Saatlik İzin' then
    if new.baslangic_saat is null or new.bitis_saat is null or new.bitis_saat <= new.baslangic_saat then
      raise exception 'SAAT_GECERSIZ';
    end if;
    new.bitis_tarihi := new.baslangic_tarihi;
    select izin_gunu_dk into v_gun_dk from public.sirket_ayarlari where id;
    new.gun_sayisi := round((extract(epoch from (new.bitis_saat - new.baslangic_saat)) / 60.0) / coalesce(v_gun_dk, 450), 2);
  else
    new.baslangic_saat := null;
    new.bitis_saat := null;
    new.gun_sayisi := public.izin_gun_sayisi(new.personel_id, new.baslangic_tarihi, new.bitis_tarihi);
  end if;
  return new;
end;
$function$;

drop trigger if exists izin_gun_hesapla on public.izinler;
create trigger izin_gun_hesapla
  before insert or update of izin_turu, baslangic_tarihi, bitis_tarihi, baslangic_saat, bitis_saat, personel_id
  on public.izinler
  for each row execute function public.izin_gun_hesapla();

-- Mevcut kayıtların gün sayısını doldur (SQL Editor'de oturum olmadığından kilit ve geçmiş etkilenmez)
update public.izinler
   set gun_sayisi = public.izin_gun_sayisi(personel_id, baslangic_tarihi, bitis_tarihi)
 where gun_sayisi is null;

-- =====================================================================
-- 4) YILLIK İZİN HESABI (İş Kanunu md. 53)
--    1-5 yıl: 14 gün, 6-14 yıl: 20 gün, 15 yıl ve üstü: 26 gün.
--    18 yaş ve altı ile 50 yaş ve üstüne en az 20 gün.
--    Hak, her işe giriş yıldönümünde kazanılır.
-- =====================================================================
create or replace function public._yillik_izin_hesapla(p_personel_id uuid)
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_p record;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_baslangic date;
  v_yd date;
  v_gun integer;
  v_yas integer;
  v_hak numeric := 0;
  v_kidem integer := 0;
  v_sonraki date;
  v_sonraki_gun integer;
  v_kullanilan numeric;
  v_bekleyen numeric;
begin
  select ise_giris_tarihi, dogum_tarihi, devreden_izin_gun, devir_tarihi into v_p
  from public.personeller where id = p_personel_id;

  if v_p.ise_giris_tarihi is null then
    return json_build_object('tanimli', false);
  end if;

  -- Devir tarihi varsa hak ve kullanım o tarihten sonrası sayılır; öncesi devreden gündedir
  v_baslangic := coalesce(v_p.devir_tarihi, v_p.ise_giris_tarihi);

  for y in 1..80 loop
    v_yd := (v_p.ise_giris_tarihi + make_interval(years => y))::date;
    v_gun := case when y <= 5 then 14 when y < 15 then 20 else 26 end;
    if v_p.dogum_tarihi is not null then
      v_yas := extract(year from age(v_yd, v_p.dogum_tarihi))::integer;
      if v_yas <= 18 or v_yas >= 50 then
        v_gun := greatest(v_gun, 20);
      end if;
    end if;

    if v_yd > v_bugun then
      v_sonraki := v_yd;
      v_sonraki_gun := v_gun;
      exit;
    end if;

    v_kidem := y;
    if v_yd > v_baslangic then
      v_hak := v_hak + v_gun;
    end if;
  end loop;

  select coalesce(sum(gun_sayisi) filter (where coalesce(durum, 'ONAYLANDI') = 'ONAYLANDI'), 0),
         coalesce(sum(gun_sayisi) filter (where durum = 'BEKLEMEDE'), 0)
    into v_kullanilan, v_bekleyen
    from public.izinler
   where personel_id = p_personel_id
     and izin_turu in ('Yıllık İzin', 'Saatlik İzin')
     and baslangic_tarihi >= v_baslangic;

  return json_build_object(
    'tanimli', true,
    'kidem_yil', v_kidem,
    'devreden', v_p.devreden_izin_gun,
    'hak_edilen', v_hak,
    'kullanilan', v_kullanilan,
    'bekleyen', v_bekleyen,
    'kalan', v_p.devreden_izin_gun + v_hak - v_kullanilan,
    'sonraki_hak_tarihi', v_sonraki,
    'sonraki_hak_gun', v_sonraki_gun
  );
end;
$function$;

revoke all on function public._yillik_izin_hesapla(uuid) from public, anon, authenticated;

-- Panel: görebildiği personelin izin bakiyeleri
create or replace function public.izin_bakiyeleri()
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(json_object_agg(p.id, public._yillik_izin_hesapla(p.id)), '{}'::json)
  from public.personeller p
  where public.panel_kullanicisi() and public.personel_yetkisi(p.id);
$function$;

-- =====================================================================
-- 5) MOBİL: SAATLİK İZİN TALEBİ
-- =====================================================================
drop function if exists public.izin_talep_olustur(text, text, date, date, text);
create or replace function public.izin_talep_olustur(
  p_token text, p_tur text, p_baslangic date, p_bitis date, p_aciklama text default null,
  p_baslangic_saat time default null, p_bitis_saat time default null
)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_kod text;
begin
  v_pid := public.oturum_personel(p_token);

  if p_tur not in ('Raporlu / İstirahat', 'Yıllık İzin', 'Mazeret İzni', 'Ücretsiz İzin', 'Saatlik İzin') then
    return json_build_object('ok', false, 'hata', 'TUR_GECERSIZ');
  end if;

  if p_baslangic is null or p_bitis is null or p_bitis < p_baslangic or (p_bitis - p_baslangic) > 90 then
    return json_build_object('ok', false, 'hata', 'TARIH_GECERSIZ');
  end if;

  if p_tur = 'Saatlik İzin' and (p_baslangic_saat is null or p_bitis_saat is null or p_bitis_saat <= p_baslangic_saat) then
    return json_build_object('ok', false, 'hata', 'SAAT_GECERSIZ');
  end if;

  v_kod := case p_tur
    when 'Raporlu / İstirahat' then '01 - İstirahat / Sağlık Raporu'
    when 'Yıllık İzin' then 'Ücretli İzin'
    when 'Saatlik İzin' then 'Ücretli İzin'
    when 'Ücretsiz İzin' then '05 - Ücretsiz İzin'
    else '13 - Diğer Nedenler'
  end;

  insert into public.izinler
    (personel_id, izin_turu, sgk_kodu, baslangic_tarihi, bitis_tarihi, baslangic_saat, bitis_saat, aciklama, durum)
  values
    (v_pid, p_tur, v_kod, p_baslangic, case when p_tur = 'Saatlik İzin' then p_baslangic else p_bitis end,
     case when p_tur = 'Saatlik İzin' then p_baslangic_saat end,
     case when p_tur = 'Saatlik İzin' then p_bitis_saat end,
     coalesce(nullif(left(trim(coalesce(p_aciklama, '')), 300), ''), 'Mobil personel talebi'),
     'BEKLEMEDE');

  return json_build_object('ok', true);
end;
$function$;

-- =====================================================================
-- 6) MOBİL ÖZET: ayarlar, yıllık izin ve son talepler eklendi
--    (2026-10-15_mobil_ozet_plan.sql sürümünün yerine geçer; önceki her şey aynen duruyor)
-- =====================================================================
create or replace function public.mobil_ozet(p_token text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_p record;
  v_ad text;
  v_bas text;
  v_bit text;
  v_mola integer;
begin
  v_pid := public.oturum_personel(p_token);

  select id, sicil_no, ad, soyad, departman, varsayilan_vardiya_id into v_p
  from public.personeller where id = v_pid;

  select v.ad, v.baslangic_saat::text, v.bitis_saat::text, v.mola_dakika into v_ad, v_bas, v_bit, v_mola
  from public.vardiyalar v where v.id = v_p.varsayilan_vardiya_id;

  if v_bas is null then
    select v.ad, v.baslangic_saat::text, v.bitis_saat::text, v.mola_dakika into v_ad, v_bas, v_bit, v_mola
    from public.vardiyalar v order by v.created_at asc limit 1;
  end if;

  return json_build_object(
    'personel', json_build_object(
      'id', v_p.id, 'sicil_no', v_p.sicil_no, 'ad', v_p.ad, 'soyad', v_p.soyad, 'departman', v_p.departman
    ),
    'vardiya', case
      when v_bas is null or v_bit is null then null
      else json_build_object('ad', v_ad, 'baslangic_saat', v_bas, 'bitis_saat', v_bit, 'mola_dakika', coalesce(v_mola, 0))
    end,
    'ayarlar', (
      select json_build_object('cikis_tolerans_dk', a.cikis_tolerans_dk, 'erken_giris_payi_dk', a.erken_giris_payi_dk)
      from public.sirket_ayarlari a where a.id
    ),
    'yillik_izin', public._yillik_izin_hesapla(v_pid),
    'talepler', (
      select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
      from (
        select i.id, i.izin_turu, i.baslangic_tarihi, i.bitis_tarihi, i.baslangic_saat::text as baslangic_saat,
               i.bitis_saat::text as bitis_saat, i.gun_sayisi, i.durum, i.created_at
        from public.izinler i
        where i.personel_id = v_pid
        order by i.created_at desc
        limit 10
      ) t
    ),
    'plan', (
      select coalesce(json_agg(json_build_object(
        'tarih', p.tarih,
        'tur', p.tur,
        'vardiya_id', p.vardiya_id,
        'ad', v.ad,
        'baslangic_saat', v.baslangic_saat::text,
        'bitis_saat', v.bitis_saat::text,
        'mola_dakika', v.mola_dakika
      ) order by p.tarih, v.baslangic_saat), '[]'::json)
      from public.vardiya_plani p
      left join public.vardiyalar v on v.id = p.vardiya_id
      where p.personel_id = v_pid
        and p.tarih between current_date - 32 and current_date + 31
    ),
    'subeler', (
      select coalesce(json_agg(json_build_object(
        'id', s.id, 'ad', s.ad, 'enlem', s.enlem, 'boylam', s.boylam, 'limit_metre', s.limit_metre
      )), '[]'::json)
      from public.subeler s
    ),
    'gecmis', (
      select coalesce(json_agg(x), '[]'::json)
      from (
        select h.id, h.islem_turu, h.created_at, s.ad as sube_ad
        from public.hareketler h
        left join public.subeler s on s.id = h.sube_id
        where h.personel_id = v_pid
        order by h.created_at desc
        limit 5
      ) x
    ),
    'son_hareketler', (
      select coalesce(json_agg(y order by y.created_at), '[]'::json)
      from (
        select h.id, h.islem_turu, h.created_at
        from public.hareketler h
        where h.personel_id = v_pid
          and h.created_at >= now() - interval '31 days'
      ) y
    )
  );
end;
$function$;

commit;
