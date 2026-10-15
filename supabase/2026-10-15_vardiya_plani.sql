-- Vardiya planı tablosu (15.10.2026)
-- Supabase > SQL Editor'de bir kez çalıştırın. Mevcut tablolara dokunmaz.
--
-- Kural: Bir personelin bir günü için satır varsa plan geçerlidir; yoksa
-- personelin varsayılan vardiyası (ve Pazar hafta tatili) kullanılır.
--   tur = 'VARDIYA' : o gün o vardiyada çalışır. Aynı güne birden fazla vardiya
--                     eklenebilir (sabah + akşam gibi bölünmüş çalışma).
--   tur = 'TATIL'   : o gün hafta tatili. Aynı gün vardiya satırı olamaz.

create table if not exists public.vardiya_plani (
  id uuid primary key default gen_random_uuid(),
  personel_id uuid not null references public.personeller(id) on delete cascade,
  tarih date not null,
  tur text not null default 'VARDIYA' check (tur in ('VARDIYA', 'TATIL')),
  vardiya_id uuid references public.vardiyalar(id) on delete cascade,
  sube_id uuid references public.subeler(id) on delete set null,
  olusturan uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint vardiya_plani_tur_vardiya check (
    (tur = 'VARDIYA' and vardiya_id is not null) or (tur = 'TATIL' and vardiya_id is null)
  )
);

-- Aynı gün aynı vardiya iki kez, ya da iki tatil satırı olamaz
create unique index if not exists vardiya_plani_vardiya_tekil
  on public.vardiya_plani (personel_id, tarih, vardiya_id) where tur = 'VARDIYA';
create unique index if not exists vardiya_plani_tatil_tekil
  on public.vardiya_plani (personel_id, tarih) where tur = 'TATIL';

create index if not exists vardiya_plani_tarih on public.vardiya_plani (tarih);

-- Tatil ile vardiya aynı güne yazılamaz
create or replace function public.vardiya_plani_kontrol()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from public.vardiya_plani p
    where p.personel_id = new.personel_id and p.tarih = new.tarih and p.id <> new.id
      and ((new.tur = 'TATIL' and p.tur = 'VARDIYA') or (new.tur = 'VARDIYA' and p.tur = 'TATIL'))
  ) then
    raise exception 'PLAN_CAKISMA: Aynı gün hem hafta tatili hem vardiya olamaz';
  end if;
  return new;
end;
$function$;

drop trigger if exists vardiya_plani_kontrol on public.vardiya_plani;
create trigger vardiya_plani_kontrol
  before insert or update on public.vardiya_plani
  for each row execute function public.vardiya_plani_kontrol();

-- Erişim: şimdilik yalnızca yöneticiler (şube müdürü rolü sonraki adımda eklenecek)
alter table public.vardiya_plani enable row level security;

drop policy if exists "vardiya_plani_yonetici" on public.vardiya_plani;
create policy "vardiya_plani_yonetici" on public.vardiya_plani
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
