// Ücretsiz deneme kaydının sunucu ve tarayıcıdan bağımsız yardımcıları (testlerle denenir).
import { yerelTarih } from "./tarih";

export const DENEME_GUN = 14;
export const DENEME_PERSONEL = 10;
export const KOD_GECERLILIK_DK = 15;
export const KOD_HAK = 5;

export type DenemeBasvurusu = {
  firmaAd: string;
  personelSayisi: string;
  ad: string;
  soyad: string;
  telefon: string;
  eposta: string;
  ticariIleti: boolean;
};

export const PERSONEL_ARALIKLARI = ["1-10", "11-50", "51-200", "200+"] as const;

const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const kirp = (v: unknown, n: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n) : "";

/** Telefonu yalnızca rakamlara indirir; Türkiye cep numarası 5xx xxx xx xx biçiminde 10 hane olur */
export function telefonTemizle(v: unknown): string | null {
  let s = typeof v === "string" ? v.replace(/\D/g, "") : "";
  if (s.startsWith("90") && s.length === 12) s = s.slice(2);
  if (s.startsWith("0") && s.length === 11) s = s.slice(1);
  return /^5\d{9}$/.test(s) ? s : null;
}

/** Formdan gelen başvuruyu doğrular; hata kodu ya da temizlenmiş başvuru döner */
export function basvuruDogrula(g: Record<string, unknown>): { hata: string } | { basvuru: DenemeBasvurusu } {
  const firmaAd = kirp(g.firmaAd, 100);
  const ad = kirp(g.ad, 60);
  const soyad = kirp(g.soyad, 60);
  const eposta = kirp(g.eposta, 150).toLowerCase();
  const telefon = telefonTemizle(g.telefon);
  const personelSayisi = kirp(g.personelSayisi, 10);

  if (firmaAd.length < 2) return { hata: "FIRMA_ADI_GECERSIZ" };
  if (ad.length < 2 || soyad.length < 2) return { hata: "AD_GECERSIZ" };
  if (!telefon) return { hata: "TELEFON_GECERSIZ" };
  if (!EPOSTA.test(eposta)) return { hata: "EPOSTA_GECERSIZ" };
  if (!(PERSONEL_ARALIKLARI as readonly string[]).includes(personelSayisi)) return { hata: "PERSONEL_SAYISI_GECERSIZ" };
  if (g.kvkk !== true) return { hata: "KVKK_ONAYI_YOK" };

  return { basvuru: { firmaAd, personelSayisi, ad, soyad, telefon, eposta, ticariIleti: g.ticariIleti === true } };
}

const HARF: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Firma kodu: firma adından en fazla 14 harf + "-" + 4 rastgele karakter (ör. "kuzey-insaat-x7k2") */
export function firmaKoduUret(firmaAd: string, rastgele: string): string {
  const kok =
    firmaAd
      .toLocaleLowerCase("tr")
      .replace(/[çğıöşüâîû]/g, (h) => HARF[h] ?? h)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 14)
      .replace(/-+$/g, "") || "firma";
  return `${kok}-${rastgele.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4).padEnd(4, "0")}`;
}

/** Deneme firmasının son günü: bugün dahil DENEME_GUN gün (Türkiye saatine göre) */
export function denemeBitisi(simdi: Date = new Date()): string {
  const [y, m, d] = yerelTarih(simdi).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + DENEME_GUN - 1));
  return t.toISOString().slice(0, 10);
}

/** Bitiş gününe kalan gün (bitiş günü dahil; geçmişse 0) */
export function kalanGun(bitis: string, simdi: Date = new Date()): number {
  const [y, m, d] = yerelTarih(simdi).split("-").map(Number);
  const [by, bm, bd] = bitis.split("-").map(Number);
  const fark = (Date.UTC(by, bm - 1, bd) - Date.UTC(y, m - 1, d)) / 86400000 + 1;
  return Math.max(0, Math.round(fark));
}

/** API hata kodlarının kullanıcıya gösterilecek karşılığı */
export function denemeHataMetni(kod: string | undefined): string {
  switch (kod) {
    case "FIRMA_ADI_GECERSIZ":
      return "Şirket adını yazın.";
    case "AD_GECERSIZ":
      return "Adınızı ve soyadınızı yazın.";
    case "TELEFON_GECERSIZ":
      return "Cep telefonunuzu 5xx xxx xx xx biçiminde yazın.";
    case "EPOSTA_GECERSIZ":
      return "E-posta adresi geçersiz görünüyor.";
    case "PERSONEL_SAYISI_GECERSIZ":
      return "Personel sayısını seçin.";
    case "KVKK_ONAYI_YOK":
      return "Devam etmek için aydınlatma metnini okuduğunuzu onaylayın.";
    case "COK_FAZLA_DENEME":
      return "Çok fazla deneme yapıldı. Lütfen bir saat sonra tekrar deneyin.";
    case "EPOSTA_AYARSIZ":
      return "Doğrulama e-postası şu an gönderilemiyor. Lütfen daha sonra deneyin ya da bize yazın.";
    case "EPOSTA_GONDERILEMEDI":
      return "Doğrulama e-postası gönderilemedi. Adresinizi kontrol edip tekrar deneyin.";
    case "KOD_HATALI":
      return "Kod hatalı.";
    case "KOD_SURESI_DOLDU":
      return "Kodun süresi doldu ya da çok fazla hatalı deneme yapıldı. Lütfen yeniden kod isteyin.";
    case "BASVURU_YOK":
      return "Başvuru bulunamadı ya da zaten kullanıldı. Lütfen formu yeniden doldurun.";
    case "SIFRE_GECERSIZ":
      return "Şifre 8-72 karakter olmalı.";
    case "EPOSTA_KULLANILIYOR":
      return "Bu e-posta adresiyle zaten bir hesap var. Giriş ekranından giriş yapabilir ya da şifrenizi sıfırlayabilirsiniz.";
    default:
      return "Bir sorun oluştu. Lütfen tekrar deneyin.";
  }
}
