-- Fazla mesai talepleri (15.10.2026)
-- Önce 2026-10-15_bildirimler.sql çalıştırılmış olmalı.
-- Supabase > SQL Editor'de bir kez, tek parça olarak çalıştırın. Hata olursa hiçbir şey değişmez.
-- Canlıdaki mevcut kodu bozmaz: yalnızca yeni tablo/fonksiyon ekler, mobil_ozet'e alan ekler.
--
-- Akış: personel mobilden tarih + saat aralığı + neden girer -> BEKLEMEDE.
--       Genel yönetici ya da "mesai" yetkili şube müdürü onaylar/reddeder.
-- Yeni yetki: "mesai" (Fazla mesai onayı). İzin yetkisi olan mevcut müdürlere otomatik verilir.

begin;

-- =====================================================================
-- 1) TABLO
-- =====================================================================
create table if not exists public.mesai_talepleri (
  id uuid primary key default gen_random_uuid(),
  personel_id uuid not null references public.personeller (id) on delete cascade,
  tarih date not null,
  baslangic_saat time not null,
  -- Bitiş başlangıçtan küçük ya da eşitse mesai gece yarısını geçmiştir (ertesi gün biter)
  bitis_saat time not null,
  sure_dk integer not null default 0,
  neden text not null,
  durum text not null default 'BEKLEMEDE' check (durum in ('BEKLEMEDE', 'ONAYLANDI', 'REDDEDILDI')),
  karar_veren uuid,
  karar_zamani timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mesai_talepleri_tarih on public.mesai_talepleri (tarih);
create index if not exists mesai_talepleri_personel on public.mesai_talepleri (personel_id, tarih);

-- Süre hesabı, doğrulama ve karar bilgisi
create or replace function public.mesai_talebi_hazirla()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_dk integer;
begin
  v_dk := (extract(epoch from (new.bitis_saat - new.baslangic_saat)) / 60)::integer;
  if v_dk <= 0 then
    v_dk := v_dk + 1440;
  end if;
  if v_dk < 15 or v_dk > 960 then
    raise exception 'SURE_GECERSIZ';
  end if;
  new.sure_dk := v_dk;
  new.neden := left(trim(coalesce(new.neden, '')), 300);
  if length(new.neden) < 3 then
    raise exception 'NEDEN_GEREKLI';
  end if;

  if tg_op = 'UPDATE' and new.durum is distinct from old.durum then
    new.karar_veren := auth.uid();
    new.karar_zamani := now();
  end if;
  return new;
end;
$function$;

drop trigger if exists mesai_talebi_hazirla on public.mesai_talepleri;
create trigger mesai_talebi_hazirla
  before insert or update on public.mesai_talepleri
  for each row execute function public.mesai_talebi_hazirla();

-- Kapalı ay kilidi ve işlem geçmişi (mevcut ortak tetikleyiciler; "tarih" sütununu kullanır)
drop trigger if exists ay_kilidi_kontrol on public.mesai_talepleri;
create trigger ay_kilidi_kontrol
  before insert or update or delete on public.mesai_talepleri
  for each row execute function public.ay_kilidi_kontrol();
drop trigger if exists islem_gecmisi_yaz on public.mesai_talepleri;
create trigger islem_gecmisi_yaz
  after insert or update or delete on public.mesai_talepleri
  for each row execute function public.islem_gecmisi_yaz();

-- =====================================================================
-- 2) ERİŞİM KURALLARI
-- =====================================================================
alter table public.mesai_talepleri enable row level security;
drop policy if exists "mesai_okuma" on public.mesai_talepleri;
drop policy if exists "mesai_ekleme" on public.mesai_talepleri;
drop policy if exists "mesai_degistirme" on public.mesai_talepleri;
drop policy if exists "mesai_silme" on public.mesai_talepleri;
create policy "mesai_okuma" on public.mesai_talepleri
  for select to authenticated using (public.personel_yetkisi(personel_id));
create policy "mesai_ekleme" on public.mesai_talepleri
  for insert to authenticated
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('mesai'));
create policy "mesai_degistirme" on public.mesai_talepleri
  for update to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('mesai'))
  with check (public.personel_yetkisi(personel_id) and public.yetkisi_var('mesai'));
create policy "mesai_silme" on public.mesai_talepleri
  for delete to authenticated
  using (public.personel_yetkisi(personel_id) and public.yetkisi_var('mesai'));

-- =====================================================================
-- 3) YENİ YETKİ: mesai
-- =====================================================================
update public.yoneticiler
   set yetkiler = yetkiler || array['mesai']
 where rol = 'SUBE' and 'izin' = any (yetkiler) and not ('mesai' = any (yetkiler));

create or replace function public.yonetici_kaydet(
  p_eposta text, p_ad text, p_rol text, p_subeler uuid[], p_yetkiler text[] default '{}'
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid;
begin
  if not public.is_admin() then
    raise exception 'YETKISIZ';
  end if;
  if p_rol not in ('GENEL', 'SUBE') then
    raise exception 'ROL_GECERSIZ';
  end if;
  if p_rol = 'SUBE' and coalesce(array_length(p_subeler, 1), 0) = 0 then
    raise exception 'SUBE_SECILMELI';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_yetkiler, '{}')) y
    where y not in ('plan', 'izin', 'mesai', 'manuel', 'cihaz', 'pin', 'personel', 'rapor')
  ) then
    raise exception 'YETKI_GECERSIZ';
  end if;

  select id into v_uid from auth.users where lower(email) = lower(trim(p_eposta));
  if v_uid is null then
    raise exception 'KULLANICI_YOK';
  end if;
  if v_uid = auth.uid() and p_rol <> 'GENEL' then
    raise exception 'KENDINI_DEGISTIREMEZ';
  end if;

  insert into public.yoneticiler (user_id, rol, ad, yetkiler)
  values (
    v_uid, p_rol, nullif(trim(coalesce(p_ad, '')), ''),
    case when p_rol = 'SUBE' then coalesce(p_yetkiler, '{}') else '{}' end
  )
  on conflict (user_id) do update
    set rol = excluded.rol, ad = excluded.ad, yetkiler = excluded.yetkiler;

  delete from public.yonetici_subeleri where user_id = v_uid;
  if p_rol = 'SUBE' then
    insert into public.yonetici_subeleri (user_id, sube_id)
    select v_uid, s from unnest(p_subeler) as s
    on conflict do nothing;
  end if;
end;
$function$;

-- =====================================================================
-- 4) MOBİL: FAZLA MESAİ TALEBİ
-- =====================================================================
create or replace function public.mesai_talep_olustur(
  p_token text, p_tarih date, p_baslangic_saat time, p_bitis_saat time, p_neden text
)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pid uuid;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_bas timestamp;
  v_bit timestamp;
begin
  v_pid := public.oturum_personel(p_token);

  -- Yapılmış mesai bildirilir: bugün ya da en çok 31 gün öncesi
  if p_tarih is null or p_tarih > v_bugun or p_tarih < v_bugun - 31 then
    return json_build_object('ok', false, 'hata', 'TARIH_GECERSIZ');
  end if;
  if p_baslangic_saat is null or p_bitis_saat is null then
    return json_build_object('ok', false, 'hata', 'SURE_GECERSIZ');
  end if;
  if length(trim(coalesce(p_neden, ''))) < 3 then
    return json_build_object('ok', false, 'hata', 'NEDEN_GEREKLI');
  end if;

  -- Aynı kişinin aynı zamana denk gelen bekleyen/onaylı talebi olamaz
  v_bas := p_tarih + p_baslangic_saat;
  v_bit := p_tarih + p_bitis_saat;
  if v_bit <= v_bas then
    v_bit := v_bit + interval '1 day';
  end if;
  if exists (
    select 1 from public.mesai_talepleri m
    where m.personel_id = v_pid and m.durum in ('BEKLEMEDE', 'ONAYLANDI')
      and tsrange(m.tarih + m.baslangic_saat,
                  m.tarih + m.bitis_saat + case when m.bitis_saat <= m.baslangic_saat then interval '1 day' else interval '0' end)
          && tsrange(v_bas, v_bit)
  ) then
    return json_build_object('ok', false, 'hata', 'CAKISMA');
  end if;

  begin
    insert into public.mesai_talepleri (personel_id, tarih, baslangic_saat, bitis_saat, neden)
    values (v_pid, p_tarih, p_baslangic_saat, p_bitis_saat, p_neden);
  exception when others then
    if sqlerrm like '%SURE_GECERSIZ%' then
      return json_build_object('ok', false, 'hata', 'SURE_GECERSIZ');
    elsif sqlerrm like '%AY_KILITLI%' then
      return json_build_object('ok', false, 'hata', 'AY_KILITLI');
    end if;
    raise;
  end;

  return json_build_object('ok', true);
end;
$function$;

-- =====================================================================
-- 5) MOBİL ÖZET: mesai talepleri eklendi
--    (2026-10-15_ayarlar_izin.sql sürümünün yerine geçer; önceki her şey aynen duruyor)
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
    'mesai_talepleri', (
      select coalesce(json_agg(m order by m.created_at desc), '[]'::json)
      from (
        select x.id, x.tarih, x.baslangic_saat::text as baslangic_saat, x.bitis_saat::text as bitis_saat,
               x.sure_dk, x.neden, x.durum, x.created_at
        from public.mesai_talepleri x
        where x.personel_id = v_pid
        order by x.created_at desc
        limit 10
      ) m
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
