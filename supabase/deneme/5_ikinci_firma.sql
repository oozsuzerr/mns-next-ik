-- DENEME: ikinci firma (yalnızca deneme projesinde, 2026-10-16_firma_2_sinir.sql çalıştırıldıktan sonra)
-- CANLI VERİTABANINDA ÇALIŞTIRMAYIN.
--
-- Önce Authentication > Users > "Add user" ile ("Auto Confirm User" işaretli) açın:
--   genelb@deneme.test   -> Deneme B firmasının genel yöneticisi
--
-- Ayrıştırma testi için: Deneme B'deki "Ali Başka" personelinin T.C.'si MNS'deki Ali Deneme ile AYNI (10000000001),
-- PIN'i farklı (5678). Mobil bağlantılar: /mobil?f=mns ve /mobil?f=denemeb

begin;

select public.sistem_firma_olustur('Deneme B', 'denemeb');

insert into public.subeler (id, firma_id, ad, enlem, boylam, limit_metre)
select 'a0000000-0000-0000-0000-0000000000b1', id, 'B Merkez', 39.9208000, 32.8541000, 150
from public.firmalar where kod = 'denemeb';

insert into public.vardiyalar (id, firma_id, ad, baslangic_saat, bitis_saat, mola_dakika)
select 'b0000000-0000-0000-0000-0000000000b1', id, 'B Gündüz', '09:00', '18:00', 60
from public.firmalar where kod = 'denemeb';

insert into public.personeller
  (id, firma_id, sicil_no, tc_kimlik, ad, soyad, departman, varsayilan_sube_id, varsayilan_vardiya_id, pin_hash, ise_giris_tarihi)
select v.id::uuid, f.id, v.sicil, v.tc, v.ad, v.soyad, 'Genel',
       'a0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b1',
       extensions.crypt(v.pin, extensions.gen_salt('bf')), '2024-05-01'
from public.firmalar f,
     (values
       ('c0000000-0000-0000-0000-0000000000b1', 'D001', '10000000001', 'Ali',   'Başka', '5678'),
       ('c0000000-0000-0000-0000-0000000000b2', 'B002', '20000000002', 'Elif',  'Bfirma', '5678')
     ) as v(id, sicil, tc, ad, soyad, pin)
where f.kod = 'denemeb';

insert into public.hareketler (personel_id, sube_id, islem_turu, durum_notu, manuel, created_at) values
  ('c0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b1', 'İşe Giriş', 'Normal', false,
   ((now() at time zone 'Europe/Istanbul')::date + time '09:05') at time zone 'Europe/Istanbul');

insert into public.izinler (personel_id, izin_turu, sgk_kodu, baslangic_tarihi, bitis_tarihi, aciklama, durum) values
  ('c0000000-0000-0000-0000-0000000000b2', 'Mazeret İzni', '13 - Diğer Nedenler',
   (now() at time zone 'Europe/Istanbul')::date + 3, (now() at time zone 'Europe/Istanbul')::date + 3, 'B firması bekleyen talep', 'BEKLEMEDE');

insert into public.yoneticiler (user_id, firma_id, rol, ad)
select u.id, f.id, 'GENEL', 'Deneme B Yöneticisi'
from auth.users u, public.firmalar f
where u.email = 'genelb@deneme.test' and f.kod = 'denemeb';

commit;

-- Kontrol: firma başına personel sayısı (MNS 5, Deneme B 2) ve yöneticiler
select f.ad, (select count(*) from public.personeller p where p.firma_id = f.id) as personel,
       (select string_agg(u.email, ', ') from public.yoneticiler y join auth.users u on u.id = y.user_id where y.firma_id = f.id) as yoneticiler
from public.firmalar f order by f.created_at;
