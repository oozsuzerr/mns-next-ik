-- İşe başlama ve ayrılış kontrol listeleri (17.10.2026)
--
-- * kontrol_sablonlari: firmanın kendi madde listesi (tür: Giriş / Çıkış). Boşsa uygulama yasal
--   gereklere göre hazırlanmış varsayılan listeyi kullanır. Yalnızca genel yönetici düzenler.
-- * kontrol_listeleri: bir personel için başlatılan liste (personel başına her türden bir tane).
-- * kontrol_maddeleri: listenin maddeleri; son tarih, yapıldı işareti, yapan ve not.
-- * Görme: personele yetkili panel kullanıcısı. Başlatma, işaretleme, silme: ayrıca "personel" yetkisi.
-- Önce deneme projesinde, sonra canlıda. Uygulama kodu tablolar yokken de açılır.
-- Geri alma: dosyanın sonu.

begin;

create table if not exists public.kontrol_sablonlari (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  tur text not null check (tur in ('Giriş', 'Çıkış')),
  sira integer not null default 0,
  baslik text not null check (char_length(trim(baslik)) between 1 and 150),
  aciklama text check (aciklama is null or char_length(aciklama) <= 500),
  gun integer check (gun is null or gun between -60 and 120),
  created_at timestamptz not null default now()
);
create index if not exists kontrol_sablonlari_firma on public.kontrol_sablonlari (firma_id, tur, sira);
alter table public.kontrol_sablonlari enable row level security;

drop policy if exists sablon_okuma on public.kontrol_sablonlari;
create policy sablon_okuma on public.kontrol_sablonlari for select to authenticated
  using (public.panel_kullanicisi());
drop policy if exists sablon_yazma on public.kontrol_sablonlari;
create policy sablon_yazma on public.kontrol_sablonlari for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists firma_siniri on public.kontrol_sablonlari;
create policy firma_siniri on public.kontrol_sablonlari as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

create table if not exists public.kontrol_listeleri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  personel_id uuid not null references public.personeller (id) on delete cascade,
  tur text not null check (tur in ('Giriş', 'Çıkış')),
  baslangic date not null,
  tamamlandi_at timestamptz,
  created_at timestamptz not null default now(),
  unique (personel_id, tur)
);
create index if not exists kontrol_listeleri_firma on public.kontrol_listeleri (firma_id, created_at desc);
alter table public.kontrol_listeleri enable row level security;

create table if not exists public.kontrol_maddeleri (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null references public.firmalar (id),
  liste_id uuid not null references public.kontrol_listeleri (id) on delete cascade,
  personel_id uuid not null references public.personeller (id) on delete cascade,
  sira integer not null default 0,
  baslik text not null check (char_length(trim(baslik)) between 1 and 150),
  aciklama text check (aciklama is null or char_length(aciklama) <= 500),
  son_tarih date,
  tamamlandi boolean not null default false,
  tamamlayan uuid,
  tamamlayan_ad text,
  tamamlanma timestamptz,
  notu text check (notu is null or char_length(notu) <= 300)
);
create index if not exists kontrol_maddeleri_liste on public.kontrol_maddeleri (liste_id, sira);
alter table public.kontrol_maddeleri enable row level security;

do $$
declare
  v_tablo text;
begin
  foreach v_tablo in array array['kontrol_listeleri', 'kontrol_maddeleri'] loop
    execute format('drop policy if exists kontrol_okuma on public.%I', v_tablo);
    execute format('create policy kontrol_okuma on public.%I for select to authenticated using (public.personel_yetkisi(personel_id))', v_tablo);
    execute format('drop policy if exists kontrol_yazma on public.%I', v_tablo);
    execute format('create policy kontrol_yazma on public.%I for all to authenticated
      using (public.personel_yetkisi(personel_id) and public.yetkisi_var(''personel''))
      with check (public.personel_yetkisi(personel_id) and public.yetkisi_var(''personel''))', v_tablo);
    execute format('drop policy if exists firma_siniri on public.%I', v_tablo);
    execute format('create policy firma_siniri on public.%I as restrictive for all to authenticated
      using (firma_id = public.aktif_firma_id()) with check (firma_id = public.aktif_firma_id())', v_tablo);
  end loop;

  foreach v_tablo in array array['kontrol_sablonlari', 'kontrol_listeleri', 'kontrol_maddeleri'] loop
    execute format('drop trigger if exists a0_firma_doldur on public.%I', v_tablo);
    execute format('create trigger a0_firma_doldur before insert or update on public.%I for each row execute function public.firma_doldur()', v_tablo);
  end loop;
  foreach v_tablo in array array['kontrol_listeleri', 'kontrol_maddeleri'] loop
    execute format('drop trigger if exists islem_gecmisi_yaz on public.%I', v_tablo);
    execute format('create trigger islem_gecmisi_yaz after insert or delete or update on public.%I for each row execute function public.islem_gecmisi_yaz()', v_tablo);
  end loop;
end $$;

-- Madde aynı listenin personeline ait olmalı; yapan ve zamanı veritabanı yazar
create or replace function public.kontrol_maddesi_doldur()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.personel_id is distinct from (select personel_id from public.kontrol_listeleri where id = new.liste_id) then
    raise exception 'LISTE_UYUSMAZ';
  end if;
  if tg_op = 'INSERT' or new.tamamlandi is distinct from old.tamamlandi then
    if new.tamamlandi then
      new.tamamlayan := auth.uid();
      new.tamamlanma := now();
    else
      new.tamamlayan := null;
      new.tamamlayan_ad := null;
      new.tamamlanma := null;
    end if;
  else
    -- İşaret değişmeden yapan/zaman elle değiştirilemez
    new.tamamlayan := old.tamamlayan;
    new.tamamlanma := old.tamamlanma;
  end if;
  return new;
end;
$function$;
revoke execute on function public.kontrol_maddesi_doldur() from public, anon, authenticated;

drop trigger if exists b_madde_doldur on public.kontrol_maddeleri;
create trigger b_madde_doldur before insert or update on public.kontrol_maddeleri
  for each row execute function public.kontrol_maddesi_doldur();

commit;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop table if exists public.kontrol_maddeleri;
-- drop table if exists public.kontrol_listeleri;
-- drop table if exists public.kontrol_sablonlari;
-- drop function if exists public.kontrol_maddesi_doldur();
-- commit;
