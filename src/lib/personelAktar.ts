// Excel'den toplu personel aktarma: şablon üretme, dosyayı okuma ve satırları denetleme.
// Veritabanına yazma işi panel bileşenindedir; buradaki her şey saf ve test edilebilir.
import * as XLSX from "xlsx";
import { tcGecerliMi } from "./tipler";

export const AKTARIM_SAYFASI = "Personeller";
export const AKTARIM_EN_FAZLA = 500;

type Alan = "ad" | "soyad" | "sicil_no" | "tc_kimlik" | "departman" | "unvan" | "sube" | "vardiya" | "ise_giris_tarihi" | "dogum_tarihi" | "pin";

/** Şablondaki sütunlar (sırasıyla). Başlıkta "*" zorunlu demektir. */
export const SUTUNLAR: { alan: Alan; baslik: string; zorunlu: boolean; aciklama: string; ornek: string; genislik: number }[] = [
  { alan: "ad", baslik: "Ad", zorunlu: true, aciklama: "Personelin adı.", ornek: "Ayşe", genislik: 16 },
  { alan: "soyad", baslik: "Soyad", zorunlu: true, aciklama: "Personelin soyadı.", ornek: "Kara", genislik: 16 },
  { alan: "sicil_no", baslik: "Sicil no", zorunlu: true, aciklama: "Firma içinde her personel için farklı olmalı.", ornek: "102", genislik: 12 },
  { alan: "tc_kimlik", baslik: "T.C. kimlik no", zorunlu: true, aciklama: "11 haneli; personel mobil girişte bunu kullanır.", ornek: "10000000146", genislik: 16 },
  { alan: "departman", baslik: "Departman", zorunlu: false, aciklama: "Boş bırakılırsa \"Genel\" yazılır.", ornek: "Sevkiyat", genislik: 16 },
  { alan: "unvan", baslik: "Ünvan", zorunlu: false, aciklama: "Görevi.", ornek: "Sevkiyat sorumlusu", genislik: 20 },
  { alan: "sube", baslik: "Şube", zorunlu: false, aciklama: "Paneldeki şube adıyla aynı yazılmalı (\"Şubeler ve vardiyalar\" sayfasına bakın). Tek şubeniz varsa boş bırakabilirsiniz.", ornek: "Merkez Depo", genislik: 18 },
  { alan: "vardiya", baslik: "Vardiya", zorunlu: false, aciklama: "Paneldeki vardiya adıyla aynı yazılmalı. Tek vardiyanız varsa boş bırakabilirsiniz.", ornek: "Sabah vardiyası", genislik: 18 },
  { alan: "ise_giris_tarihi", baslik: "İşe giriş tarihi", zorunlu: false, aciklama: "GG.AA.YYYY. Yıllık izin hakkı bu tarihe göre hesaplanır.", ornek: "15.03.2021", genislik: 16 },
  { alan: "dogum_tarihi", baslik: "Doğum tarihi", zorunlu: false, aciklama: "GG.AA.YYYY. 18 yaş altı ve 50 yaş üstü izin hakkı için kullanılır.", ornek: "04.07.1990", genislik: 14 },
  { alan: "pin", baslik: "Mobil PIN", zorunlu: false, aciklama: "4-8 rakam. Boş bırakırsanız personele sonra PIN verirsiniz. 0 ile başlıyorsa hücreyi metin biçiminde yazın.", ornek: "4821", genislik: 12 },
];

const basligiYaz = (s: (typeof SUTUNLAR)[number]) => (s.zorunlu ? `${s.baslik} *` : s.baslik);

/** Başlık ve ad eşleştirmesi için: küçük harf, Türkçe harfler sadeleşmiş, harf/rakam dışı atılmış */
export function sadelestir(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (h) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[h] ?? h)
    .replace(/[^a-z0-9]/g, "");
}

export interface AdliKayit {
  id: string;
  ad: string;
}

export interface MevcutPersonel {
  ad: string;
  soyad: string;
  sicil_no: string;
  tc_kimlik: string;
}

/** Firmanın şube ve vardiya adlarını da içeren şablon (xlsx dosyasının baytları) */
export function sablonOlustur(subeler: AdliKayit[], vardiyalar: AdliKayit[]): ArrayBuffer {
  const kitap = XLSX.utils.book_new();

  const personel = XLSX.utils.aoa_to_sheet([SUTUNLAR.map(basligiYaz)]);
  personel["!cols"] = SUTUNLAR.map((s) => ({ wch: s.genislik }));
  XLSX.utils.book_append_sheet(kitap, personel, AKTARIM_SAYFASI);

  const aciklama = XLSX.utils.aoa_to_sheet([
    ["Nasıl doldurulur?"],
    [`1. "${AKTARIM_SAYFASI}" sayfasına her personel için bir satır yazın; başlık satırını değiştirmeyin.`],
    ["2. * işaretli sütunlar zorunludur. T.C. kimlik no ve sicil no firmada tekrar edemez."],
    ["3. Şube ve vardiya adlarını \"Şubeler ve vardiyalar\" sayfasındaki gibi yazın."],
    ["4. Dosyayı kaydedip panelde Personel listesi → Excel'den aktar ile yükleyin. Kaydetmeden önce her satırın kontrolünü görürsünüz."],
    [],
    ["Sütun", "Zorunlu", "Açıklama", "Örnek"],
    ...SUTUNLAR.map((s) => [s.baslik, s.zorunlu ? "Evet" : "Hayır", s.aciklama, s.ornek]),
  ]);
  aciklama["!cols"] = [{ wch: 18 }, { wch: 9 }, { wch: 90 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(kitap, aciklama, "Açıklamalar");

  const satirSayisi = Math.max(subeler.length, vardiyalar.length, 1);
  const liste = XLSX.utils.aoa_to_sheet([
    ["Şubeler", "Vardiyalar"],
    ...Array.from({ length: satirSayisi }, (_, i) => [subeler[i]?.ad ?? "", vardiyalar[i]?.ad ?? ""]),
  ]);
  liste["!cols"] = [{ wch: 28 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(kitap, liste, "Şubeler ve vardiyalar");

  return XLSX.write(kitap, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

type Hucre = string | number | boolean | null | undefined;

/** Dosyanın personel sayfasını başlıklarına göre okur. Başlıklar tanınmazsa hata fırlatır. */
export function dosyayiOku(veri: ArrayBuffer): { satirNo: number; degerler: Partial<Record<Alan, Hucre>> }[] {
  const kitap = XLSX.read(veri, { type: "array" });
  const ad = kitap.SheetNames.find((s) => sadelestir(s) === sadelestir(AKTARIM_SAYFASI)) ?? kitap.SheetNames[0];
  const sayfa = ad ? kitap.Sheets[ad] : undefined;
  if (!sayfa) throw new Error("Dosyada okunacak sayfa bulunamadı.");

  const satirlar = XLSX.utils.sheet_to_json<Hucre[]>(sayfa, { header: 1, raw: true, blankrows: true, defval: null });
  const baslik = (satirlar[0] ?? []).map((h) => sadelestir(String(h ?? "")));
  const sutun = new Map<Alan, number>();
  for (const s of SUTUNLAR) {
    const i = baslik.indexOf(sadelestir(s.baslik));
    if (i >= 0) sutun.set(s.alan, i);
  }
  const eksik = SUTUNLAR.filter((s) => s.zorunlu && !sutun.has(s.alan)).map((s) => s.baslik);
  if (eksik.length) {
    throw new Error(`Şablondaki başlıklar bulunamadı: ${eksik.join(", ")}. Lütfen panelden indirdiğiniz şablonu kullanın.`);
  }

  const sonuc: { satirNo: number; degerler: Partial<Record<Alan, Hucre>> }[] = [];
  satirlar.slice(1).forEach((satir, i) => {
    const degerler: Partial<Record<Alan, Hucre>> = {};
    for (const [alan, j] of sutun) degerler[alan] = satir[j];
    const bos = Object.values(degerler).every((d) => d == null || String(d).trim() === "");
    if (!bos) sonuc.push({ satirNo: i + 2, degerler });
  });
  return sonuc;
}

const metin = (d: Hucre) => (d == null ? "" : typeof d === "number" ? String(Math.round(d)) : String(d).trim().replace(/\s+/g, " "));

/** Excel tarih seri numarası, "GG.AA.YYYY", "G/A/YYYY" ya da "YYYY-AA-GG" -> "YYYY-AA-GG"; okunamazsa null */
export function tarihCoz(d: Hucre): string | null {
  let y: number, m: number, g: number;
  if (typeof d === "number") {
    // Excel seri numarası: 1899-12-30'dan bu yana gün sayısı (1900 sonrası tarihler için)
    const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(d) * 86400000);
    [y, m, g] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  } else {
    const s = metin(d);
    let e = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (e) [g, m, y] = [Number(e[1]), Number(e[2]), Number(e[3])];
    else if ((e = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, g] = [Number(e[1]), Number(e[2]), Number(e[3])];
    else return null;
  }
  const tarih = new Date(Date.UTC(y, m - 1, g));
  if (tarih.getUTCFullYear() !== y || tarih.getUTCMonth() !== m - 1 || tarih.getUTCDate() !== g) return null;
  if (y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
}

export interface AktarimKaydi {
  ad: string;
  soyad: string;
  sicil_no: string;
  tc_kimlik: string;
  departman: string;
  unvan: string | null;
  varsayilan_sube_id: string | null;
  varsayilan_vardiya_id: string | null;
  ise_giris_tarihi: string | null;
  dogum_tarihi: string | null;
}

export interface DenetlenmisSatir {
  satirNo: number;
  kayit: AktarimKaydi;
  pin: string | null;
  /** Şube ve vardiya adları (önizleme için) */
  subeAd: string;
  vardiyaAd: string;
  hatalar: string[];
  uyarilar: string[];
}

/** Okunan satırları denetler; hatası olan satır aktarılmaz, uyarısı olan aktarılır. */
export function satirlariDenetle(
  okunan: { satirNo: number; degerler: Partial<Record<Alan, Hucre>> }[],
  baglam: { subeler: AdliKayit[]; vardiyalar: AdliKayit[]; mevcut: MevcutPersonel[]; bugun: string }
): DenetlenmisSatir[] {
  const subeler = new Map(baglam.subeler.map((s) => [sadelestir(s.ad), s]));
  const vardiyalar = new Map(baglam.vardiyalar.map((v) => [sadelestir(v.ad), v]));
  const tcSahibi = new Map(baglam.mevcut.map((p) => [p.tc_kimlik, `${p.ad} ${p.soyad}`]));
  const sicilSahibi = new Map(baglam.mevcut.map((p) => [sadelestir(p.sicil_no), `${p.ad} ${p.soyad}`]));
  const dosyadakiTc = new Map<string, number>();
  const dosyadakiSicil = new Map<string, number>();

  return okunan.map(({ satirNo, degerler: d }) => {
    const hatalar: string[] = [];
    const uyarilar: string[] = [];

    const ad = metin(d.ad);
    const soyad = metin(d.soyad);
    const sicil = metin(d.sicil_no);
    const tc = metin(d.tc_kimlik).replace(/\s/g, "");
    if (!ad) hatalar.push("Ad boş.");
    if (!soyad) hatalar.push("Soyad boş.");
    if (ad.length > 100 || soyad.length > 100) hatalar.push("Ad ya da soyad çok uzun.");

    if (!sicil) hatalar.push("Sicil no boş.");
    else if (sicilSahibi.has(sadelestir(sicil))) hatalar.push(`Bu sicil no ${sicilSahibi.get(sadelestir(sicil))} adına kayıtlı.`);
    else if (dosyadakiSicil.has(sadelestir(sicil))) hatalar.push(`Bu sicil no dosyada ${dosyadakiSicil.get(sadelestir(sicil))}. satırda da var.`);
    else dosyadakiSicil.set(sadelestir(sicil), satirNo);

    if (!/^[0-9]{11}$/.test(tc)) hatalar.push("T.C. kimlik no 11 haneli rakam olmalı.");
    else if (tcSahibi.has(tc)) hatalar.push(`Bu T.C. kimlik no ${tcSahibi.get(tc)} adına kayıtlı.`);
    else if (dosyadakiTc.has(tc)) hatalar.push(`Bu T.C. kimlik no dosyada ${dosyadakiTc.get(tc)}. satırda da var.`);
    else {
      dosyadakiTc.set(tc, satirNo);
      if (!tcGecerliMi(tc)) uyarilar.push("T.C. kimlik no geçerlilik kontrolünden geçmedi; numarayı kontrol edin.");
    }

    // Şube / vardiya: boşsa ve tek seçenek varsa o kullanılır
    const subeYazi = metin(d.sube);
    let sube: AdliKayit | null = null;
    if (subeYazi) {
      sube = subeler.get(sadelestir(subeYazi)) ?? null;
      if (!sube) hatalar.push(`"${subeYazi}" adında şube yok.`);
    } else if (baglam.subeler.length === 1) sube = baglam.subeler[0];
    else uyarilar.push("Şube boş; personel şubesiz eklenir.");

    const vardiyaYazi = metin(d.vardiya);
    let vardiya: AdliKayit | null = null;
    if (vardiyaYazi) {
      vardiya = vardiyalar.get(sadelestir(vardiyaYazi)) ?? null;
      if (!vardiya) hatalar.push(`"${vardiyaYazi}" adında vardiya yok.`);
    } else if (baglam.vardiyalar.length === 1) vardiya = baglam.vardiyalar[0];
    else uyarilar.push("Vardiya boş; personel vardiyasız eklenir.");

    const tarihAlani = (deger: Hucre, ad: string) => {
      if (deger == null || metin(deger) === "") return null;
      const t = tarihCoz(deger);
      if (!t) hatalar.push(`${ad} okunamadı; GG.AA.YYYY biçiminde yazın.`);
      return t;
    };
    const iseGiris = tarihAlani(d.ise_giris_tarihi, "İşe giriş tarihi");
    const dogum = tarihAlani(d.dogum_tarihi, "Doğum tarihi");
    if (dogum && dogum >= baglam.bugun) hatalar.push("Doğum tarihi bugünden önce olmalı.");
    if (iseGiris && dogum && iseGiris <= dogum) hatalar.push("İşe giriş tarihi doğum tarihinden sonra olmalı.");
    if (!metin(d.ise_giris_tarihi)) uyarilar.push("İşe giriş tarihi boş; yıllık izin hakkı hesaplanmaz.");

    const pinYazi = metin(d.pin);
    let pin: string | null = null;
    if (!pinYazi) uyarilar.push("PIN boş; mobil giriş için personele sonra PIN verin.");
    else if (/^[0-9]{4,8}$/.test(pinYazi)) pin = pinYazi;
    else if (typeof d.pin === "number" && pinYazi.length < 4)
      hatalar.push("PIN 4-8 rakam olmalı. 0 ile başlıyorsa Excel baştaki sıfırı siler; hücreyi metin olarak yazın.");
    else hatalar.push("PIN 4-8 rakam olmalı.");

    const departman = metin(d.departman) || "Genel";
    const unvan = metin(d.unvan) || null;
    if (departman.length > 100 || (unvan?.length ?? 0) > 100) hatalar.push("Departman ya da ünvan çok uzun.");

    return {
      satirNo,
      kayit: {
        ad,
        soyad,
        sicil_no: sicil,
        tc_kimlik: tc,
        departman,
        unvan,
        varsayilan_sube_id: sube?.id ?? null,
        varsayilan_vardiya_id: vardiya?.id ?? null,
        ise_giris_tarihi: iseGiris,
        dogum_tarihi: dogum,
      },
      pin,
      subeAd: sube?.ad ?? "",
      vardiyaAd: vardiya?.ad ?? "",
      hatalar,
      uyarilar,
    };
  });
}
