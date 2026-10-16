-- DENEME PROJESİ KURULUMU 4/4: örnek veri (gerçek kişi bilgisi içermez)
-- CANLI VERİTABANINDA ÇALIŞTIRMAYIN.
--
-- Önce Supabase > Authentication > Users > "Add user" ile iki deneme kullanıcısı açın
-- ("Auto Confirm User" işaretli):
--   genel@deneme.test   -> genel yönetici
--   mudur@deneme.test   -> Kadıköy şube müdürü
-- Şifreleri siz belirleyin; bu dosyada şifre yok.
--
-- Personel mobil girişleri: T.C. 10000000001 ... 10000000005, PIN 1234 (yalnızca deneme)

begin;

-- Şubeler (konumlar örnek)
insert into public.subeler (id, ad, enlem, boylam, limit_metre) values
  ('a0000000-0000-0000-0000-000000000001', 'Merkez',  41.0082000, 28.9784000, 150),
  ('a0000000-0000-0000-0000-000000000002', 'Kadıköy', 40.9909000, 29.0290000, 150);

-- Vardiyalar
insert into public.vardiyalar (id, ad, baslangic_saat, bitis_saat, mola_dakika, created_at) values
  ('b0000000-0000-0000-0000-000000000001', 'Gündüz', '08:00', '17:00', 60, now() - interval '2 minutes'),
  ('b0000000-0000-0000-0000-000000000002', 'Akşam',  '14:00', '22:00', 30, now() - interval '1 minute');

-- Personel
insert into public.personeller
  (id, sicil_no, tc_kimlik, ad, soyad, departman, varsayilan_sube_id, varsayilan_vardiya_id, pin_hash, ise_giris_tarihi)
values
  ('c0000000-0000-0000-0000-000000000001', 'D001', '10000000001', 'Ali',    'Deneme',  'Satış',   'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', extensions.crypt('1234', extensions.gen_salt('bf')), '2022-03-01'),
  ('c0000000-0000-0000-0000-000000000002', 'D002', '10000000002', 'Ayşe',   'Örnek',   'Satış',   'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', extensions.crypt('1234', extensions.gen_salt('bf')), '2019-06-15'),
  ('c0000000-0000-0000-0000-000000000003', 'D003', '10000000003', 'Mehmet', 'Sınama',  'Depo',    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', extensions.crypt('1234', extensions.gen_salt('bf')), '2024-01-10'),
  ('c0000000-0000-0000-0000-000000000004', 'D004', '10000000004', 'Zeynep', 'Test',    'Depo',    'a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', extensions.crypt('1234', extensions.gen_salt('bf')), '2023-09-01'),
  ('c0000000-0000-0000-0000-000000000005', 'D005', '10000000005', 'Can',    'Prova',   'Muhasebe','a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', null, '2025-02-01');

-- Bugünün ve dünün hareketleri (Türkiye saatiyle)
insert into public.hareketler (personel_id, sube_id, islem_turu, durum_notu, manuel, created_at) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'İşe Giriş', 'Normal', false, ((now() at time zone 'Europe/Istanbul')::date + time '07:58') at time zone 'Europe/Istanbul'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'İşe Giriş', 'Normal', false, ((now() at time zone 'Europe/Istanbul')::date + time '08:17') at time zone 'Europe/Istanbul'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'İşe Çıkış', 'Normal', false, ((now() at time zone 'Europe/Istanbul')::date + time '12:30') at time zone 'Europe/Istanbul'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'İşe Giriş', 'Normal', false, ((now() at time zone 'Europe/Istanbul')::date - 1 + time '08:01') at time zone 'Europe/Istanbul'),
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'İşe Çıkış', 'Normal', false, ((now() at time zone 'Europe/Istanbul')::date - 1 + time '17:20') at time zone 'Europe/Istanbul'),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'İşe Giriş', 'Normal', false, ((now() at time zone 'Europe/Istanbul')::date - 1 + time '14:05') at time zone 'Europe/Istanbul');

-- İzin ve fazla mesai talepleri
insert into public.izinler (personel_id, izin_turu, sgk_kodu, baslangic_tarihi, bitis_tarihi, aciklama, durum) values
  ('c0000000-0000-0000-0000-000000000004', 'Yıllık İzin', 'Ücretli İzin', (now() at time zone 'Europe/Istanbul')::date, (now() at time zone 'Europe/Istanbul')::date + 2, 'Deneme izni', 'ONAYLANDI'),
  ('c0000000-0000-0000-0000-000000000002', 'Mazeret İzni', '13 - Diğer Nedenler', (now() at time zone 'Europe/Istanbul')::date + 7, (now() at time zone 'Europe/Istanbul')::date + 7, 'Bekleyen deneme talebi', 'BEKLEMEDE');

insert into public.mesai_talepleri (personel_id, tarih, baslangic_saat, bitis_saat, neden, durum) values
  ('c0000000-0000-0000-0000-000000000001', (now() at time zone 'Europe/Istanbul')::date - 1, '17:00', '19:18', 'Sayım', 'ONAYLANDI'),
  ('c0000000-0000-0000-0000-000000000003', (now() at time zone 'Europe/Istanbul')::date - 1, '22:00', '23:30', 'Sevkiyat', 'BEKLEMEDE');

-- Resmi tatil örneği
insert into public.resmi_tatiller (tarih, ad) values ('2026-10-29', 'Cumhuriyet Bayramı');

-- Panel kullanıcıları (Authentication'da açtığınız e-postalar)
insert into public.yoneticiler (user_id, rol, ad)
select id, 'GENEL', 'Deneme Genel Yönetici' from auth.users where email = 'genel@deneme.test';

insert into public.yoneticiler (user_id, rol, ad, yetkiler)
select id, 'SUBE', 'Deneme Kadıköy Müdürü', array['plan', 'izin', 'mesai', 'manuel', 'cihaz'] from auth.users where email = 'mudur@deneme.test';

insert into public.yonetici_subeleri (user_id, sube_id)
select id, 'a0000000-0000-0000-0000-000000000002' from auth.users where email = 'mudur@deneme.test';

commit;

-- Kontrol: iki satır dönmeli
select y.rol, u.email from public.yoneticiler y join auth.users u on u.id = y.user_id;
