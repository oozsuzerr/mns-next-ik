-- DENEME PROJESİ KURULUMU 3/4: RLS kuralları
-- Canlı şema dökümünden (16.10.2026) aktarıldı. CANLI VERİTABANINDA ÇALIŞTIRMAYIN.

begin;

-- ay_kilitleri
create policy ay_kilitleri_ekleme on public.ay_kilitleri as permissive for insert to authenticated
  with check (is_admin());
create policy ay_kilitleri_okuma on public.ay_kilitleri as permissive for select to authenticated
  using (panel_kullanicisi());
create policy ay_kilitleri_silme on public.ay_kilitleri as permissive for delete to authenticated
  using (is_admin());

-- cihaz_talepleri
create policy cihaz_talepleri_okuma on public.cihaz_talepleri as permissive for select to authenticated
  using (personel_yetkisi(personel_id) and yetkisi_var('cihaz'::text));

-- hareketler
create policy admin_tum_erisim on public.hareketler as permissive for all to authenticated
  using (is_admin())
  with check (is_admin());
create policy sube_muduru_manuel_ekleme on public.hareketler as permissive for insert to authenticated
  with check ((manuel = true) and yetkisi_var('manuel'::text) and personel_yetkisi(personel_id) and sube_yetkisi(sube_id));
create policy sube_muduru_okuma on public.hareketler as permissive for select to authenticated
  using (personel_yetkisi(personel_id) or sube_yetkisi(sube_id));

-- islem_gecmisi
create policy islem_gecmisi_okuma on public.islem_gecmisi as permissive for select to authenticated
  using (is_admin());

-- izinler
create policy admin_tum_erisim on public.izinler as permissive for all to authenticated
  using (is_admin())
  with check (is_admin());
create policy sube_muduru_izin_degistirme on public.izinler as permissive for update to authenticated
  using (personel_yetkisi(personel_id) and yetkisi_var('izin'::text))
  with check (personel_yetkisi(personel_id) and yetkisi_var('izin'::text));
create policy sube_muduru_izin_ekleme on public.izinler as permissive for insert to authenticated
  with check (personel_yetkisi(personel_id) and yetkisi_var('izin'::text));
create policy sube_muduru_izin_okuma on public.izinler as permissive for select to authenticated
  using (personel_yetkisi(personel_id));
create policy sube_muduru_izin_silme on public.izinler as permissive for delete to authenticated
  using (personel_yetkisi(personel_id) and yetkisi_var('izin'::text));

-- mesai_talepleri
create policy mesai_degistirme on public.mesai_talepleri as permissive for update to authenticated
  using (personel_yetkisi(personel_id) and yetkisi_var('mesai'::text))
  with check (personel_yetkisi(personel_id) and yetkisi_var('mesai'::text));
create policy mesai_ekleme on public.mesai_talepleri as permissive for insert to authenticated
  with check (personel_yetkisi(personel_id) and yetkisi_var('mesai'::text));
create policy mesai_okuma on public.mesai_talepleri as permissive for select to authenticated
  using (personel_yetkisi(personel_id));
create policy mesai_silme on public.mesai_talepleri as permissive for delete to authenticated
  using (personel_yetkisi(personel_id) and yetkisi_var('mesai'::text));

-- personeller
create policy admin_tum_erisim on public.personeller as permissive for all to authenticated
  using (is_admin())
  with check (is_admin());
create policy sube_muduru_okuma on public.personeller as permissive for select to authenticated
  using (personel_yetkisi(id));
create policy sube_muduru_personel_degistirme on public.personeller as permissive for update to authenticated
  using (yetkisi_var('personel'::text) and personel_yetkisi(id))
  with check (yetkisi_var('personel'::text) and sube_yetkisi(varsayilan_sube_id));
create policy sube_muduru_personel_ekleme on public.personeller as permissive for insert to authenticated
  with check (yetkisi_var('personel'::text) and sube_yetkisi(varsayilan_sube_id));

-- resmi_tatiller
create policy admin_tum_erisim on public.resmi_tatiller as permissive for all to authenticated
  using (is_admin())
  with check (is_admin());
create policy panel_okuma on public.resmi_tatiller as permissive for select to authenticated
  using (panel_kullanicisi());

-- sirket_ayarlari
create policy ayarlar_degistirme on public.sirket_ayarlari as permissive for update to authenticated
  using (is_admin())
  with check (is_admin());
create policy ayarlar_okuma on public.sirket_ayarlari as permissive for select to authenticated
  using (panel_kullanicisi());

-- subeler
create policy admin_tum_erisim on public.subeler as permissive for all to authenticated
  using (is_admin())
  with check (is_admin());
create policy sube_muduru_okuma on public.subeler as permissive for select to authenticated
  using (sube_yetkisi(id));

-- vardiya_plani
create policy vardiya_plani_degistirme on public.vardiya_plani as permissive for update to authenticated
  using (personel_yetkisi(personel_id) and yetkisi_var('plan'::text))
  with check (personel_yetkisi(personel_id) and yetkisi_var('plan'::text));
create policy vardiya_plani_ekleme on public.vardiya_plani as permissive for insert to authenticated
  with check (personel_yetkisi(personel_id) and yetkisi_var('plan'::text));
create policy vardiya_plani_okuma on public.vardiya_plani as permissive for select to authenticated
  using (personel_yetkisi(personel_id));
create policy vardiya_plani_silme on public.vardiya_plani as permissive for delete to authenticated
  using (personel_yetkisi(personel_id) and yetkisi_var('plan'::text));

-- vardiyalar
create policy admin_tum_erisim on public.vardiyalar as permissive for all to authenticated
  using (is_admin())
  with check (is_admin());
create policy panel_okuma on public.vardiyalar as permissive for select to authenticated
  using (panel_kullanicisi());

-- yoneticiler, yonetici_subeleri, mobil_oturumlar, push_abonelikleri:
-- canlıda kural yok (RLS açık, doğrudan erişim kapalı; yalnızca fonksiyonlar okur/yazar)

commit;
