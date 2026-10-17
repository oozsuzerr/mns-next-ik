-- İşten çıkış tarihi (17.10.2026)
--
-- Personel pasife alınırken çıkış tarihi kaydedilir. Puantajda bu tarihten sonraki günler
-- "Devamsız" yerine "İşten Ayrıldı" görünür; çıkış ayında hareketi olmasa da puantaja girer.
-- Önce deneme projesinde, sonra canlıda çalıştırılır. Uygulama kodundan ÖNCE çalıştırılmalı
-- (panel personel listesinde bu sütunu okur).
-- Geri alma: alter table public.personeller drop column if exists cikis_tarihi;

begin;

alter table public.personeller add column if not exists cikis_tarihi date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'personeller_cikis_tarihi_kontrol') then
    alter table public.personeller add constraint personeller_cikis_tarihi_kontrol
      check (cikis_tarihi is null or ise_giris_tarihi is null or cikis_tarihi >= ise_giris_tarihi);
  end if;
end $$;

commit;
