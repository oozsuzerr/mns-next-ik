-- mobil_ozet: vardiya planı eklendi (15.10.2026)
-- Önce 2026-10-15_vardiya_plani.sql çalıştırılmış olmalı.
-- Supabase > SQL Editor'de bir kez çalıştırın. 2026-10-15_mobil_ozet_vardiya.sql'deki
-- sürümün yerine geçer; o sürümdeki her şey aynen duruyor.
--
-- Değişenler:
--   1) 'vardiya' alanına vardiya adı ve mola süresi eklendi.
--   2) 'plan': personelin bugünden 32 gün öncesinden 31 gün sonrasına kadarki vardiya
--      planı. Mobil uygulama mesai ve eksik çıkış hesabında o günün planlı
--      vardiyasını kullanır; "Vardiyam" ekranı da bunu gösterecek.

CREATE OR REPLACE FUNCTION public.mobil_ozet(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
