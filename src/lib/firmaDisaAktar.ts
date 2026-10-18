// Sistem yöneticisinin firma verisi dışa aktarımı (firmalar bu özelliği görmez).
// Oturum anahtarları, bildirim abonelikleri ve PIN özetleri dışarı verilmez.

export const DISA_AKTAR_TABLOLARI = [
  "subeler",
  "vardiyalar",
  "personeller",
  "personel_ozluk",
  "personel_belgeleri",
  "personel_ucret_gecmisi",
  "hareketler",
  "izinler",
  "vardiya_plani",
  "mesai_talepleri",
  "cihaz_talepleri",
  "ay_kilitleri",
  "sirket_ayarlari",
  "resmi_tatiller",
  "yoneticiler",
  "yonetici_subeleri",
  "islem_gecmisi",
  "duyurular",
  "duyuru_okumalar",
  "zimmetler",
  "odeme_talepleri",
  "kontrol_sablonlari",
  "kontrol_maddeleri",
  "kontrol_listeleri",
  "egitim_turleri",
  "egitim_kayitlari",
  "performans_donemleri",
  "performans_kriterleri",
  "performans_degerlendirmeleri",
  "ise_alim_ilanlari",
  "adaylar",
  "aday_gorusmeleri",
  "gorevler",
  "bordro_ayarlari",
  "ek_kazanclar",
  "kvkk_onaylari",
] as const;

/** Dışarı verilmeyen sütunlar */
export const GIZLI_SUTUNLAR: Record<string, string[]> = {
  personeller: ["pin_hash"],
};

export const SAYFA_BOYU = 1000;
