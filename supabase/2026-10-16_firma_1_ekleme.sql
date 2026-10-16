-- Çok firmalı yapı, Adım 2: firma tablosu ve firma_id sütunları (16.10.2026)
--
-- Canlı şema dökümüyle (16.10.2026) karşılaştırıldı: tablo listesi tam, sütun adları uyumlu.
-- !!! Önce deneme projesinde çalıştırılacak, sonra onayla canlıya uygulanacak. !!!
--
-- Bu adım uygulamanın davranışını DEĞİŞTİRMEZ:
--   * Tek firma (MNS) vardır, bütün mevcut satırlar ona bağlanır.
--   * Güvenlik kuralları (RLS) değişmez; firma sınırı Adım 3'te gelir.
--   * Uygulama firma_id göndermez; "firma_doldur" tetikleyicisi doldurur.
-- Geri alma: dosyanın sonundaki "GERİ ALMA" bölümü.

begin;

-- ---------------------------------------------------------------------
-- 1) Firmalar
-- ---------------------------------------------------------------------
create table if not exists public.firmalar (
  id uuid primary key default gen_random_uuid(),
  ad text not null,
  kod text not null unique check (kod ~ '^[a-z0-9-]{3,20}$'),
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.firmalar enable row level security;
-- Okuma/yazma kuralları Adım 3'te (kendi firmasını görme, sistem yöneticisi)

insert into public.firmalar (ad, kod) values ('MNS', 'mns') on conflict (kod) do nothing;

-- ---------------------------------------------------------------------
-- 2) Yeni satırlara firma atayan tetikleyici
-- ---------------------------------------------------------------------
-- Sıra: satırda zaten varsa o; personel_id varsa personelin firması;
-- panel kullanıcısıysa onun firması; hâlâ boşsa (yalnızca bu geçiş döneminde) MNS.
-- Adım 3'te son yedek kaldırılır ve çapraz firma kontrolü eklenir.
create or replace function public.firma_doldur()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_satir jsonb := to_jsonb(new);
  v_firma uuid;
begin
  if v_satir ->> 'firma_id' is not null then
    return new;
  end if;

  if v_satir ? 'personel_id' and v_satir ->> 'personel_id' is not null then
    select firma_id into v_firma from public.personeller where id = (v_satir ->> 'personel_id')::uuid;
  end if;

  if v_firma is null and auth.uid() is not null then
    select firma_id into v_firma from public.yoneticiler where user_id = auth.uid();
  end if;

  if v_firma is null then
    select id into v_firma from public.firmalar where kod = 'mns';  -- GEÇİCİ (Adım 3'te kalkar)
  end if;

  return jsonb_populate_record(new, jsonb_build_object('firma_id', v_firma));
end;
$function$;

revoke execute on function public.firma_doldur() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Firmaya ait tablolara firma_id
-- ---------------------------------------------------------------------
-- Liste şema dökümüyle karşılaştırılacak (eksik tablo kalmamalı).
-- resmi_tatiller ayrı: boş firma_id = Türkiye geneli ortak tatil.
do $$
declare
  v_mns uuid := (select id from public.firmalar where kod = 'mns');
  v_tablo text;
  v_tablolar text[] := array[
    'subeler',
    'vardiyalar',
    'personeller',
    'hareketler',
    'izinler',
    'vardiya_plani',
    'mesai_talepleri',
    'cihaz_talepleri',
    'yoneticiler',
    'yonetici_subeleri',
    'islem_gecmisi',
    'ay_kilitleri',
    'sirket_ayarlari',
    'push_abonelikleri',
    'mobil_oturumlar'
  ];
begin
  foreach v_tablo in array v_tablolar loop
    execute format('alter table public.%I add column if not exists firma_id uuid references public.firmalar (id)', v_tablo);
    -- Doldurma sırasında mevcut tetikleyiciler veriyi değiştirmez (şema dökümüyle kontrol edildi):
    --   ay_kilidi_kontrol, islem_gecmisi_yaz, personel_korumali_alanlar: SQL Editor'de auth.uid() boş, atlanır
    --   izin_gun_hesapla: yalnızca tarih/saat/tür sütunları değişince çalışır, firma_id değil
    --   mesai_talebi_hazirla: aynı süreyi yeniden hesaplar; durum değişmediği için karar alanları korunur
    --   vardiya_plani_kontrol: yalnızca kontrol eder
    execute format('update public.%I set firma_id = %L where firma_id is null', v_tablo, v_mns);
    execute format('alter table public.%I alter column firma_id set not null', v_tablo);
    execute format('create index if not exists %I on public.%I (firma_id)', v_tablo || '_firma', v_tablo);
    -- personeller önce dolar; diğer tablolar personelin firmasını okuyabilir
    execute format('drop trigger if exists firma_doldur on public.%I', v_tablo);
    execute format(
      'create trigger firma_doldur before insert on public.%I for each row execute function public.firma_doldur()',
      v_tablo
    );
  end loop;
end $$;

alter table public.resmi_tatiller add column if not exists firma_id uuid references public.firmalar (id);
create index if not exists resmi_tatiller_firma on public.resmi_tatiller (firma_id);
-- Mevcut resmi tatiller ortak liste olarak kalır (firma_id boş)

commit;

-- =====================================================================
-- GERİ ALMA (yalnızca gerekirse, Adım 3 uygulanmadan önce)
-- =====================================================================
-- begin;
-- do $$
-- declare v_tablo text;
-- begin
--   foreach v_tablo in array array['subeler','vardiyalar','personeller','hareketler','izinler','vardiya_plani',
--     'mesai_talepleri','cihaz_talepleri','yoneticiler','yonetici_subeleri','islem_gecmisi','ay_kilitleri',
--     'sirket_ayarlari','push_abonelikleri','mobil_oturumlar','resmi_tatiller'] loop
--     execute format('drop trigger if exists firma_doldur on public.%I', v_tablo);
--     execute format('alter table public.%I drop column if exists firma_id', v_tablo);
--   end loop;
-- end $$;
-- drop function if exists public.firma_doldur();
-- drop table if exists public.firmalar;
-- commit;
