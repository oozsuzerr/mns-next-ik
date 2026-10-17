// Türkiye resmi tatilleri (2429 sayılı Kanun). Sabit tatiller her yıl aynı; dini bayramlar her yıl
// Diyanet takvimine göre değişir ve aşağıya yıl yıl eklenir. Arife ve 28 Ekim 13:00'ten sonra tatildir.

export interface HazirTatil {
  tarih: string;
  ad: string;
  yarim_gun: boolean;
}

function sabitTatiller(yil: number): HazirTatil[] {
  return [
    { tarih: `${yil}-01-01`, ad: "Yılbaşı", yarim_gun: false },
    { tarih: `${yil}-04-23`, ad: "Ulusal Egemenlik ve Çocuk Bayramı", yarim_gun: false },
    { tarih: `${yil}-05-01`, ad: "Emek ve Dayanışma Günü", yarim_gun: false },
    { tarih: `${yil}-05-19`, ad: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", yarim_gun: false },
    { tarih: `${yil}-07-15`, ad: "Demokrasi ve Milli Birlik Günü", yarim_gun: false },
    { tarih: `${yil}-08-30`, ad: "Zafer Bayramı", yarim_gun: false },
    { tarih: `${yil}-10-28`, ad: "Cumhuriyet Bayramı Arifesi", yarim_gun: true },
    { tarih: `${yil}-10-29`, ad: "Cumhuriyet Bayramı", yarim_gun: false },
  ];
}

/**
 * Dini bayramlar. Kaynak: Diyanet dini günler takvimi (haber kaynaklarıyla 17.10.2026'da doğrulandı).
 * Yeni yıl eklerken Diyanet takvimini ve Resmî Gazete'yi kontrol edin.
 */
const DINI_BAYRAMLAR: Record<number, HazirTatil[]> = {
  2026: [
    { tarih: "2026-03-19", ad: "Ramazan Bayramı Arifesi", yarim_gun: true },
    { tarih: "2026-03-20", ad: "Ramazan Bayramı 1. Gün", yarim_gun: false },
    { tarih: "2026-03-21", ad: "Ramazan Bayramı 2. Gün", yarim_gun: false },
    { tarih: "2026-03-22", ad: "Ramazan Bayramı 3. Gün", yarim_gun: false },
    { tarih: "2026-05-26", ad: "Kurban Bayramı Arifesi", yarim_gun: true },
    { tarih: "2026-05-27", ad: "Kurban Bayramı 1. Gün", yarim_gun: false },
    { tarih: "2026-05-28", ad: "Kurban Bayramı 2. Gün", yarim_gun: false },
    { tarih: "2026-05-29", ad: "Kurban Bayramı 3. Gün", yarim_gun: false },
    { tarih: "2026-05-30", ad: "Kurban Bayramı 4. Gün", yarim_gun: false },
  ],
  2027: [
    { tarih: "2027-03-08", ad: "Ramazan Bayramı Arifesi", yarim_gun: true },
    { tarih: "2027-03-09", ad: "Ramazan Bayramı 1. Gün", yarim_gun: false },
    { tarih: "2027-03-10", ad: "Ramazan Bayramı 2. Gün", yarim_gun: false },
    { tarih: "2027-03-11", ad: "Ramazan Bayramı 3. Gün", yarim_gun: false },
    { tarih: "2027-05-15", ad: "Kurban Bayramı Arifesi", yarim_gun: true },
    { tarih: "2027-05-16", ad: "Kurban Bayramı 1. Gün", yarim_gun: false },
    { tarih: "2027-05-17", ad: "Kurban Bayramı 2. Gün", yarim_gun: false },
    { tarih: "2027-05-18", ad: "Kurban Bayramı 3. Gün", yarim_gun: false },
    // 19 Mayıs aynı zamanda Gençlik ve Spor Bayramı; tek kayıt yeterli (aynı gün iki tatil ek gün doğurmaz)
    { tarih: "2027-05-19", ad: "Kurban Bayramı 4. Gün / Gençlik ve Spor Bayramı", yarim_gun: false },
  ],
};

export function diniBayramlarTanimli(yil: number): boolean {
  return yil in DINI_BAYRAMLAR;
}

/** Yılın hazır listesi; aynı güne denk gelen sabit tatil yerine bayram kaydı kalır */
export function hazirTatilListesi(yil: number): HazirTatil[] {
  const harita = new Map<string, HazirTatil>();
  for (const t of sabitTatiller(yil)) harita.set(t.tarih, t);
  for (const t of DINI_BAYRAMLAR[yil] ?? []) harita.set(t.tarih, t);
  return [...harita.values()].sort((a, b) => a.tarih.localeCompare(b.tarih));
}
