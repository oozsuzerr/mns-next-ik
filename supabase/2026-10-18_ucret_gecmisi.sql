-- Ücret geçmişi (18.10.2026)
--
-- * personel_ucret_gecmisi: Özlük'te ücret ya da ücret türü her değiştiğinde (ve ilk girildiğinde) bir satır eklenir;
--   gecerlilik = değişikliğin yapıldığı gün (Türkiye saati). Böylece "ücret listesi" raporunda ücretin hangi tarihten
--   beri geçerli olduğu ve eski ücretler görünür. Satırları uygulama yazamaz; yalnızca tetikleyici ekler.
-- * Yalnızca genel yönetici okur (ücret bilgisi). Mevcut ücretler bir kez geçmişe aktarılır.
-- Önce deneme projesinde, sonra canlıda. Önkoşul: 2026-10-17_ozluk_belge.sql. Tekrar çalıştırılabilir.
-- Geri alma: dosyanın sonu.

begin;

create table if not exists public.personel_ucret_gecmisi (
  id bigint generated always as identity primary key,
  firma_id uuid not null references public.firmalar (id) on delete cascade,
  personel_id uuid not null references public.personeller (id) on delete cascade,
  ucret numeric(12, 2),
  ucret_turu text,
  gecerlilik date not null,
  kaydeden uuid,
  zaman timestamptz not null default now()
);
create index if not exists personel_ucret_gecmisi_kisi on public.personel_ucret_gecmisi (personel_id, gecerlilik);
alter table public.personel_ucret_gecmisi enable row level security;

drop policy if exists ucret_gecmisi_okuma on public.personel_ucret_gecmisi;
create policy ucret_gecmisi_okuma on public.personel_ucret_gecmisi for select to authenticated
  using (public.is_admin() and public.personel_yetkisi(personel_id));
drop policy if exists firma_siniri on public.personel_ucret_gecmisi;
create policy firma_siniri on public.personel_ucret_gecmisi as restrictive for all to authenticated
  using (firma_id = public.aktif_firma_id())
  with check (firma_id = public.aktif_firma_id());

create or replace function public.ucret_gecmisi_yaz()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE' and new.ucret is not distinct from old.ucret and new.ucret_turu is not distinct from old.ucret_turu then
    return new;
  end if;
  if tg_op = 'INSERT' and new.ucret is null and new.ucret_turu is null then
    return new;
  end if;
  insert into public.personel_ucret_gecmisi (firma_id, personel_id, ucret, ucret_turu, gecerlilik, kaydeden)
  values (new.firma_id, new.personel_id, new.ucret, new.ucret_turu, (now() at time zone 'Europe/Istanbul')::date, auth.uid());
  return new;
end;
$function$;
revoke execute on function public.ucret_gecmisi_yaz() from public, anon, authenticated;

drop trigger if exists ucret_gecmisi_yaz on public.personel_ozluk;
create trigger ucret_gecmisi_yaz after insert or update of ucret, ucret_turu on public.personel_ozluk
  for each row execute function public.ucret_gecmisi_yaz();

-- Mevcut ücretler (geçmişi olmayanlar) bir kez aktarılır; geçerlilik son güncelleme günü
insert into public.personel_ucret_gecmisi (firma_id, personel_id, ucret, ucret_turu, gecerlilik)
select o.firma_id, o.personel_id, o.ucret, o.ucret_turu, (o.guncelleme at time zone 'Europe/Istanbul')::date
  from public.personel_ozluk o
 where o.ucret is not null
   and not exists (select 1 from public.personel_ucret_gecmisi g where g.personel_id = o.personel_id);

commit;

-- Kontrol:
-- select count(*) from public.personel_ucret_gecmisi;

-- =====================================================================
-- GERİ ALMA
-- =====================================================================
-- begin;
-- drop trigger if exists ucret_gecmisi_yaz on public.personel_ozluk;
-- drop function if exists public.ucret_gecmisi_yaz();
-- drop table if exists public.personel_ucret_gecmisi;
-- commit;
