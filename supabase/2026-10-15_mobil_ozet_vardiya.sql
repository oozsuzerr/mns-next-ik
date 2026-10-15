-- Eksik çıkış uyarısı için mobil_ozet güncellemesi (15.10.2026)
-- Supabase > SQL Editor'de bir kez çalıştırın.
--
-- Değişenler (geri kalan her şey aynı):
--   1) 'vardiya': personelin vardiyasının başlangıç/bitiş saati. Personele vardiya
--      atanmamışsa paneldeki puantajla aynı şekilde ilk tanımlı vardiya kullanılır.
--   2) 'son_hareketler': son 31 günün hareketleri (eskiden yeniye). Mobil uygulama
--      "mesaide mi / çıkışı mı unuttu" hesabını bununla yapar. Ekrandaki "Son işlemler"
--      listesi için 'gecmis' (son 5 işlem) aynen kalır.

CREATE OR REPLACE FUNCTION public.mobil_ozet(p_token text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pid uuid;
  v_p record;
  v_bas text;
  v_bit text;
begin
  v_pid := public.oturum_personel(p_token);

  select id, sicil_no, ad, soyad, departman, varsayilan_vardiya_id into v_p
  from public.personeller where id = v_pid;

  select v.baslangic_saat::text, v.bitis_saat::text into v_bas, v_bit
  from public.vardiyalar v where v.id = v_p.varsayilan_vardiya_id;

  if v_bas is null then
    select v.baslangic_saat::text, v.bitis_saat::text into v_bas, v_bit
    from public.vardiyalar v order by v.created_at asc limit 1;
  end if;

  return json_build_object(
    'personel', json_build_object(
      'id', v_p.id, 'sicil_no', v_p.sicil_no, 'ad', v_p.ad, 'soyad', v_p.soyad, 'departman', v_p.departman
    ),
    'vardiya', case
      when v_bas is null or v_bit is null then null
      else json_build_object('baslangic_saat', v_bas, 'bitis_saat', v_bit)
    end,
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
