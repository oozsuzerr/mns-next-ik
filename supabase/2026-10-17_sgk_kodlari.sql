-- SGK eksik gün kodu düzeltmesi (17.10.2026)
--
-- Hata: ücretsiz izin "05 - Ücretsiz İzin" olarak kaydediliyordu; SGK listesinde 05 = Tutukluluk,
-- ücretsiz izin = 21 (Diğer ücretsiz izin). Mazeret izni "13 - Diğer Nedenler" olarak kaydediliyordu;
-- yasal mazeret izinleri (evlilik, ölüm, babalık vb.) ücretlidir, eksik gün doğurmaz.
-- * Mobil izin talebi fonksiyonu doğru kodları yazar
-- * Mevcut kayıtlar düzeltilir (SQL Editor'den çalıştığı için ay kilidi ve işlem geçmişi etkilenmez)
-- Önce deneme projesinde, sonra canlıda.

begin;

update public.izinler
   set sgk_kodu = '21 - Diğer Ücretsiz İzin'
 where izin_turu = 'Ücretsiz İzin' and (sgk_kodu is null or sgk_kodu like '05%');

update public.izinler
   set sgk_kodu = 'Ücretli İzin'
 where izin_turu = 'Mazeret İzni' and (sgk_kodu is null or sgk_kodu like '13%');

create or replace function public.izin_talep_olustur(p_token text, p_tur text, p_baslangic date, p_bitis date, p_aciklama text default null::text, p_baslangic_saat time without time zone default null::time without time zone, p_bitis_saat time without time zone default null::time without time zone)
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

  -- SGK eksik gün kodları: 01 istirahat, 21 diğer ücretsiz izin; ücretli izinler eksik gün doğurmaz
  v_kod := case p_tur
    when 'Raporlu / İstirahat' then '01 - İstirahat / Sağlık Raporu'
    when 'Ücretsiz İzin' then '21 - Diğer Ücretsiz İzin'
    else 'Ücretli İzin'
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

commit;
