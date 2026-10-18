-- Personel ünvanı: departman gibi personel kaydında tutulur (listede, formlarda ve raporlarda görünür).
-- Daha önce Özlük kartına girilmiş ünvanlar bu alana kopyalanır; personel_ozluk.unvan artık kullanılmaz.
-- Tekrar çalıştırılabilir.

alter table public.personeller add column if not exists unvan text;

alter table public.personeller drop constraint if exists personeller_unvan_uzunluk;
alter table public.personeller add constraint personeller_unvan_uzunluk check (unvan is null or char_length(unvan) <= 100);

-- Özlük'teki ünvanları taşı (personel kaydında ünvan boşsa)
do $$
begin
  if to_regclass('public.personel_ozluk') is not null then
    update public.personeller p
       set unvan = left(btrim(o.unvan), 100)
      from public.personel_ozluk o
     where o.personel_id = p.id
       and p.unvan is null
       and nullif(btrim(o.unvan), '') is not null;
  end if;
end;
$$;

-- Kontrol:
-- select ad, soyad, departman, unvan from public.personeller order by ad limit 20;

-- Geri alma:
-- alter table public.personeller drop constraint if exists personeller_unvan_uzunluk;
-- alter table public.personeller drop column if exists unvan;
