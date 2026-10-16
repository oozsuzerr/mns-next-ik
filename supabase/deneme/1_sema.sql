-- DENEME PROJESİ KURULUMU 1/4: tablolar, kısıtlar, indeksler (yalnızca mns-ik-deneme projesinde!)
-- Canlı şema dökümünden (16.10.2026) üretildi. CANLI VERİTABANINDA ÇALIŞTIRMAYIN.
-- Sıra: 1_sema.sql -> 2_fonksiyonlar.sql -> 3_kurallar.sql -> 4_ornek_veri.sql

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tablolar
-- ---------------------------------------------------------------------
create table public.subeler (
  id uuid not null default gen_random_uuid(),
  ad text not null,
  enlem numeric(10,7) not null,
  boylam numeric(10,7) not null,
  limit_metre integer default 50,
  created_at timestamp with time zone default now()
);

create table public.vardiyalar (
  id uuid not null default gen_random_uuid(),
  ad text not null,
  baslangic_saat time without time zone not null,
  bitis_saat time without time zone not null,
  mola_dakika integer default 60,
  created_at timestamp with time zone default now()
);

create table public.personeller (
  id uuid not null default gen_random_uuid(),
  sicil_no text not null,
  tc_kimlik character varying(11) not null,
  ad text not null,
  soyad text not null,
  departman text,
  varsayilan_sube_id uuid,
  rol text default 'PERSONEL'::text,
  cihaz_id text,
  aktif boolean default true,
  created_at timestamp with time zone default now(),
  varsayilan_vardiya_id uuid,
  pin_hash text,
  pin_hatali integer not null default 0,
  kilit_bitis timestamp with time zone,
  pin_tanimli boolean generated always as (pin_hash is not null) stored,
  ise_giris_tarihi date,
  dogum_tarihi date,
  devreden_izin_gun numeric(6,2) not null default 0,
  devir_tarihi date
);

create table public.hareketler (
  id uuid not null default gen_random_uuid(),
  personel_id uuid,
  sube_id uuid,
  islem_turu text not null,
  enlem numeric(10,7),
  boylam numeric(10,7),
  mesafe_metre integer,
  durum_notu text,
  created_at timestamp with time zone default now(),
  manuel boolean default false,
  yonetici_notu text
);

create table public.izinler (
  id uuid not null default gen_random_uuid(),
  personel_id uuid,
  izin_turu text not null,
  baslangic_tarihi date not null,
  bitis_tarihi date not null,
  aciklama text,
  created_at timestamp with time zone default now(),
  sgk_kodu text,
  durum text default 'ONAYLANDI'::text,
  baslangic_saat time without time zone,
  bitis_saat time without time zone,
  gun_sayisi numeric(6,2),
  karar_notu text
);

create table public.resmi_tatiller (
  id uuid not null default gen_random_uuid(),
  tarih date not null,
  ad text not null
);

create table public.vardiya_plani (
  id uuid not null default gen_random_uuid(),
  personel_id uuid not null,
  tarih date not null,
  tur text not null default 'VARDIYA'::text,
  vardiya_id uuid,
  sube_id uuid,
  olusturan uuid default auth.uid(),
  created_at timestamp with time zone not null default now()
);

create table public.mesai_talepleri (
  id uuid not null default gen_random_uuid(),
  personel_id uuid not null,
  tarih date not null,
  baslangic_saat time without time zone not null,
  bitis_saat time without time zone not null,
  sure_dk integer not null default 0,
  neden text not null,
  durum text not null default 'BEKLEMEDE'::text,
  karar_veren uuid,
  karar_zamani timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  karar_notu text
);

create table public.cihaz_talepleri (
  id uuid not null default gen_random_uuid(),
  personel_id uuid not null,
  cihaz_id text not null,
  cihaz_bilgisi text,
  durum text not null default 'BEKLEMEDE'::text,
  karar_veren uuid,
  karar_zamani timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table public.mobil_oturumlar (
  token_hash text not null,
  personel_id uuid not null,
  cihaz_id text not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now()
);

create table public.push_abonelikleri (
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_id uuid,
  personel_id uuid,
  created_at timestamp with time zone not null default now(),
  guncelleme timestamp with time zone not null default now()
);

create table public.yoneticiler (
  user_id uuid not null,
  created_at timestamp with time zone not null default now(),
  rol text not null default 'GENEL'::text,
  ad text,
  yetkiler text[] not null default '{}'::text[]
);

create table public.yonetici_subeleri (
  user_id uuid not null,
  sube_id uuid not null
);

create table public.islem_gecmisi (
  id bigint generated always as identity,
  zaman timestamp with time zone not null default now(),
  kullanici_id uuid,
  kullanici_eposta text,
  tablo text not null,
  islem text not null,
  kayit_id text,
  personel_id uuid,
  once jsonb,
  sonra jsonb
);

create table public.ay_kilitleri (
  ay text not null,
  kilitleyen uuid default auth.uid(),
  kilit_zamani timestamp with time zone not null default now()
);

create table public.sirket_ayarlari (
  id boolean not null default true,
  gecikme_tolerans_dk integer not null default 5,
  mesai_tolerans_dk integer not null default 15,
  mola_esigi_dk integer not null default 240,
  cikis_tolerans_dk integer not null default 360,
  erken_giris_payi_dk integer not null default 240,
  izin_gunu_dk integer not null default 450,
  guncelleme timestamp with time zone not null default now()
);

-- ---------------------------------------------------------------------
-- Kısıtlar
-- ---------------------------------------------------------------------
alter table public.subeler add constraint subeler_pkey primary key (id);
alter table public.vardiyalar add constraint vardiyalar_pkey primary key (id);

alter table public.personeller add constraint personeller_pkey primary key (id);
alter table public.personeller add constraint personeller_sicil_no_key unique (sicil_no);
alter table public.personeller add constraint personeller_tc_kimlik_key unique (tc_kimlik);
alter table public.personeller add constraint personeller_varsayilan_sube_id_fkey foreign key (varsayilan_sube_id) references public.subeler (id);
alter table public.personeller add constraint personeller_varsayilan_vardiya_id_fkey foreign key (varsayilan_vardiya_id) references public.vardiyalar (id);

alter table public.hareketler add constraint hareketler_pkey primary key (id);
alter table public.hareketler add constraint hareketler_personel_id_fkey foreign key (personel_id) references public.personeller (id) on delete cascade;
alter table public.hareketler add constraint hareketler_sube_id_fkey foreign key (sube_id) references public.subeler (id);

alter table public.izinler add constraint izinler_pkey primary key (id);
alter table public.izinler add constraint izinler_karar_notu_uzunluk check (char_length(karar_notu) <= 300);
alter table public.izinler add constraint izinler_personel_id_fkey foreign key (personel_id) references public.personeller (id) on delete cascade;

alter table public.resmi_tatiller add constraint resmi_tatiller_pkey primary key (id);
alter table public.resmi_tatiller add constraint resmi_tatiller_tarih_key unique (tarih);

alter table public.vardiya_plani add constraint vardiya_plani_pkey primary key (id);
alter table public.vardiya_plani add constraint vardiya_plani_personel_id_fkey foreign key (personel_id) references public.personeller (id) on delete cascade;
alter table public.vardiya_plani add constraint vardiya_plani_sube_id_fkey foreign key (sube_id) references public.subeler (id) on delete set null;
alter table public.vardiya_plani add constraint vardiya_plani_vardiya_id_fkey foreign key (vardiya_id) references public.vardiyalar (id) on delete cascade;
alter table public.vardiya_plani add constraint vardiya_plani_tur_check check (tur = any (array['VARDIYA'::text, 'TATIL'::text]));
alter table public.vardiya_plani add constraint vardiya_plani_tur_vardiya check (((tur = 'VARDIYA'::text) and (vardiya_id is not null)) or ((tur = 'TATIL'::text) and (vardiya_id is null)));

alter table public.mesai_talepleri add constraint mesai_talepleri_pkey primary key (id);
alter table public.mesai_talepleri add constraint mesai_karar_notu_uzunluk check (char_length(karar_notu) <= 300);
alter table public.mesai_talepleri add constraint mesai_talepleri_durum_check check (durum = any (array['BEKLEMEDE'::text, 'ONAYLANDI'::text, 'REDDEDILDI'::text]));
alter table public.mesai_talepleri add constraint mesai_talepleri_personel_id_fkey foreign key (personel_id) references public.personeller (id) on delete cascade;

alter table public.cihaz_talepleri add constraint cihaz_talepleri_pkey primary key (id);
alter table public.cihaz_talepleri add constraint cihaz_talepleri_durum_check check (durum = any (array['BEKLEMEDE'::text, 'ONAYLANDI'::text, 'REDDEDILDI'::text, 'IPTAL'::text]));
alter table public.cihaz_talepleri add constraint cihaz_talepleri_personel_id_fkey foreign key (personel_id) references public.personeller (id) on delete cascade;

alter table public.mobil_oturumlar add constraint mobil_oturumlar_pkey primary key (token_hash);
alter table public.mobil_oturumlar add constraint mobil_oturumlar_personel_id_fkey foreign key (personel_id) references public.personeller (id) on delete cascade;

alter table public.push_abonelikleri add constraint push_abonelikleri_pkey primary key (endpoint);
alter table public.push_abonelikleri add constraint push_abonelikleri_personel_id_fkey foreign key (personel_id) references public.personeller (id) on delete set null;
alter table public.push_abonelikleri add constraint push_abonelikleri_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

alter table public.yoneticiler add constraint yoneticiler_pkey primary key (user_id);
alter table public.yoneticiler add constraint yoneticiler_rol_kontrol check (rol = any (array['GENEL'::text, 'SUBE'::text]));
alter table public.yoneticiler add constraint yoneticiler_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.yonetici_subeleri add constraint yonetici_subeleri_pkey primary key (user_id, sube_id);
alter table public.yonetici_subeleri add constraint yonetici_subeleri_sube_id_fkey foreign key (sube_id) references public.subeler (id) on delete cascade;
alter table public.yonetici_subeleri add constraint yonetici_subeleri_user_id_fkey foreign key (user_id) references public.yoneticiler (user_id) on delete cascade;

alter table public.islem_gecmisi add constraint islem_gecmisi_pkey primary key (id);

alter table public.ay_kilitleri add constraint ay_kilitleri_pkey primary key (ay);
alter table public.ay_kilitleri add constraint ay_kilitleri_ay_check check (ay ~ '^[0-9]{4}-[0-9]{2}$'::text);

alter table public.sirket_ayarlari add constraint sirket_ayarlari_pkey primary key (id);
alter table public.sirket_ayarlari add constraint sirket_ayarlari_id_check check (id);
alter table public.sirket_ayarlari add constraint sirket_ayarlari_cikis_tolerans_dk_check check ((cikis_tolerans_dk >= 30) and (cikis_tolerans_dk <= 720));
alter table public.sirket_ayarlari add constraint sirket_ayarlari_erken_giris_payi_dk_check check ((erken_giris_payi_dk >= 0) and (erken_giris_payi_dk <= 480));
alter table public.sirket_ayarlari add constraint sirket_ayarlari_gecikme_tolerans_dk_check check ((gecikme_tolerans_dk >= 0) and (gecikme_tolerans_dk <= 120));
alter table public.sirket_ayarlari add constraint sirket_ayarlari_izin_gunu_dk_check check ((izin_gunu_dk >= 60) and (izin_gunu_dk <= 720));
alter table public.sirket_ayarlari add constraint sirket_ayarlari_mesai_tolerans_dk_check check ((mesai_tolerans_dk >= 0) and (mesai_tolerans_dk <= 240));
alter table public.sirket_ayarlari add constraint sirket_ayarlari_mola_esigi_dk_check check ((mola_esigi_dk >= 0) and (mola_esigi_dk <= 720));

-- ---------------------------------------------------------------------
-- İndeksler (birincil anahtar ve tekil kısıt indeksleri yukarıda kendiliğinden oluşur)
-- ---------------------------------------------------------------------
create index cihaz_talepleri_personel on public.cihaz_talepleri using btree (personel_id, created_at desc);
create unique index cihaz_talepleri_tek_bekleyen on public.cihaz_talepleri using btree (personel_id) where (durum = 'BEKLEMEDE'::text);
create index hareketler_personel_zaman_idx on public.hareketler using btree (personel_id, created_at);
create index islem_gecmisi_personel on public.islem_gecmisi using btree (personel_id);
create index islem_gecmisi_zaman on public.islem_gecmisi using btree (zaman desc);
create index mesai_talepleri_personel on public.mesai_talepleri using btree (personel_id, tarih);
create index mesai_talepleri_tarih on public.mesai_talepleri using btree (tarih);
create index mobil_oturumlar_personel_idx on public.mobil_oturumlar using btree (personel_id);
create unique index personeller_tc_kimlik_uidx on public.personeller using btree (tc_kimlik);
create index push_abonelikleri_personel on public.push_abonelikleri using btree (personel_id);
create index push_abonelikleri_user on public.push_abonelikleri using btree (user_id);
create index vardiya_plani_tarih on public.vardiya_plani using btree (tarih);
create unique index vardiya_plani_tatil_tekil on public.vardiya_plani using btree (personel_id, tarih) where (tur = 'TATIL'::text);
create unique index vardiya_plani_vardiya_tekil on public.vardiya_plani using btree (personel_id, tarih, vardiya_id) where (tur = 'VARDIYA'::text);
create unique index yoneticiler_user_id_tekil on public.yoneticiler using btree (user_id);

-- ---------------------------------------------------------------------
-- RLS: hepsi açık (kurallar 3_kurallar.sql'de)
-- ---------------------------------------------------------------------
alter table public.subeler enable row level security;
alter table public.vardiyalar enable row level security;
alter table public.personeller enable row level security;
alter table public.hareketler enable row level security;
alter table public.izinler enable row level security;
alter table public.resmi_tatiller enable row level security;
alter table public.vardiya_plani enable row level security;
alter table public.mesai_talepleri enable row level security;
alter table public.cihaz_talepleri enable row level security;
alter table public.mobil_oturumlar enable row level security;
alter table public.push_abonelikleri enable row level security;
alter table public.yoneticiler enable row level security;
alter table public.yonetici_subeleri enable row level security;
alter table public.islem_gecmisi enable row level security;
alter table public.ay_kilitleri enable row level security;
alter table public.sirket_ayarlari enable row level security;

insert into public.sirket_ayarlari (id) values (true);

commit;
