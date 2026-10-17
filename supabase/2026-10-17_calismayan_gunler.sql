-- Firma bazında çalışılmayan günler (17.10.2026)
--
-- * sirket_ayarlari.calismayan_gunler: vardiya planı girilmemiş günlerde tatil sayılan haftanın günleri
--   (ISO: 1 = Pazartesi ... 7 = Pazar). Varsayılan {7}: yalnızca Pazar (bugünkü davranış).
-- * sirket_ayarlari.izinde_dusulmeyen: yıllık izinde hangi çalışılmayan günler izinden düşülmez
--     'pazar' (varsayılan): yalnızca Pazar; Cumartesi gibi diğer çalışılmayan günler izin günü sayılır
--     'hepsi': bütün çalışılmayan günler (sözleşmede Cumartesi de hafta tatili olarak belirlenmişse)
-- * izin_gun_sayisi bu ayarları kullanır; izin sonrasındaki düşülecek çalışılmayan günleri de sayar.
--   mobil_ozet ayarları mobile gönderir.
-- Önce deneme projesinde, sonra canlıda; uygulama kodundan ÖNCE çalıştırılmalı.

begin;

alter table public.sirket_ayarlari add column if not exists calismayan_gunler smallint[] not null default '{7}';
alter table public.sirket_ayarlari add column if not exists izinde_dusulmeyen text not null default 'pazar';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sirket_ayarlari_calismayan_kontrol') then
    alter table public.sirket_ayarlari add constraint sirket_ayarlari_calismayan_kontrol
      check (calismayan_gunler <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(calismayan_gunler) <= 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sirket_ayarlari_izinde_dusulmeyen_kontrol') then
    alter table public.sirket_ayarlari add constraint sirket_ayarlari_izinde_dusulmeyen_kontrol
      check (izinde_dusulmeyen in ('pazar', 'hepsi'));
  end if;
end $$;

-- Yıllık izin günü: plan varsa plan; yoksa firmanın çalışılmayan günleri ve izin kuralı.
-- İzin bitişinden sonraki ilk iş gününe kadar olan çalışılmayan günler de değerlendirilir:
-- 5 günlük işyerinde Pazartesi-Cuma izin alan Pazartesi işe döner, aradaki Cumartesi izinden düşer
-- ("yalnızca Pazar" kuralı). Pazar, resmi tatil ve planda tatil işaretli günler düşülmez.
create or replace function public.izin_gun_sayisi(p_personel_id uuid, p_bas date, p_bit date)
 returns numeric
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_firma uuid;
  v_gunler smallint[];
  v_kural text;
  v_toplam numeric := 0;
  v_gun date := p_bas;
  v_dow smallint;
  v_plan text;
  v_tatil boolean;
  v_yarim boolean;
begin
  select p.firma_id, coalesce(a.calismayan_gunler, '{7}'::smallint[]), coalesce(a.izinde_dusulmeyen, 'pazar')
    into v_firma, v_gunler, v_kural
    from public.personeller p
    left join public.sirket_ayarlari a on a.firma_id = p.firma_id
   where p.id = p_personel_id;
  v_gunler := coalesce(v_gunler, '{7}'::smallint[]);
  v_kural := coalesce(v_kural, 'pazar');

  while v_gun <= p_bit + 14 loop
    v_dow := extract(isodow from v_gun)::smallint;
    select case when bool_or(v.tur = 'TATIL') then 'TATIL' when count(*) > 0 then 'VARDIYA' end
      into v_plan
      from public.vardiya_plani v
     where v.personel_id = p_personel_id and v.tarih = v_gun;
    select coalesce(bool_or(not t.yarim_gun), false), coalesce(bool_or(t.yarim_gun), false)
      into v_tatil, v_yarim
      from public.resmi_tatiller t
     where t.tarih = v_gun and (t.firma_id is null or t.firma_id = v_firma);

    if v_gun > p_bit then
      -- İzin sonrası: ilk iş gününde durulur; aradaki düşülecek çalışılmayan günler (ör. Cumartesi) eklenir
      exit when not v_tatil and (v_plan = 'VARDIYA' or (v_plan is null and not (v_dow = any (v_gunler))));
      if not v_tatil and v_plan is null and v_dow = any (v_gunler) and v_kural = 'pazar' and v_dow <> 7 then
        v_toplam := v_toplam + 1;
      end if;
    elsif v_tatil or v_plan = 'TATIL' then
      null;
    elsif v_plan is null and v_dow = any (v_gunler) and (v_kural = 'hepsi' or v_dow = 7) then
      null;
    elsif v_yarim then
      -- Arife: öğleden önce çalışılır, izinden yarım gün düşer
      v_toplam := v_toplam + 0.5;
    else
      v_toplam := v_toplam + 1;
    end if;
    v_gun := v_gun + 1;
  end loop;

  return v_toplam;
end;
$function$;

-- Mobil özet: ayarlara çalışılmayan günler eklendi (gövde 2026-10-16_firma_2_sinir.sql ile aynı)
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

  select id, sicil_no, ad, soyad, departman, varsayilan_vardiya_id, firma_id into v_p
  from public.personeller where id = v_pid;

  select v.ad, v.baslangic_saat::text, v.bitis_saat::text, v.mola_dakika into v_ad, v_bas, v_bit, v_mola
  from public.vardiyalar v where v.id = v_p.varsayilan_vardiya_id;

  if v_bas is null then
    select v.ad, v.baslangic_saat::text, v.bitis_saat::text, v.mola_dakika into v_ad, v_bas, v_bit, v_mola
    from public.vardiyalar v where v.firma_id = v_p.firma_id order by v.created_at asc limit 1;
  end if;

  return json_build_object(
    'firma', (select json_build_object('ad', f.ad, 'kod', f.kod) from public.firmalar f where f.id = v_p.firma_id),
    'personel', json_build_object(
      'id', v_p.id, 'sicil_no', v_p.sicil_no, 'ad', v_p.ad, 'soyad', v_p.soyad, 'departman', v_p.departman
    ),
    'vardiya', case
      when v_bas is null or v_bit is null then null
      else json_build_object('ad', v_ad, 'baslangic_saat', v_bas, 'bitis_saat', v_bit, 'mola_dakika', coalesce(v_mola, 0))
    end,
    'ayarlar', (
      select json_build_object(
        'cikis_tolerans_dk', a.cikis_tolerans_dk,
        'erken_giris_payi_dk', a.erken_giris_payi_dk,
        'calismayan_gunler', a.calismayan_gunler
      )
      from public.sirket_ayarlari a where a.firma_id = v_p.firma_id
    ),
    'yillik_izin', public._yillik_izin_hesapla(v_pid),
    'talepler', (
      select coalesce(json_agg(t order by t.created_at desc), '[]'::json)
      from (
        select i.id, i.izin_turu, i.baslangic_tarihi, i.bitis_tarihi, i.baslangic_saat::text as baslangic_saat,
               i.bitis_saat::text as bitis_saat, i.gun_sayisi, i.durum, i.karar_notu, i.created_at
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
               x.sure_dk, x.neden, x.durum, x.karar_notu, x.created_at
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
      where s.firma_id = v_p.firma_id
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

-- Geri alma (ayarlar varsayılandayken davranış zaten eskisiyle aynıdır):
-- alter table public.sirket_ayarlari drop column if exists calismayan_gunler, drop column if exists izinde_dusulmeyen;
-- ve 2026-10-17_resmi_tatil.sql içindeki izin_gun_sayisi tanımını yeniden çalıştırın.
