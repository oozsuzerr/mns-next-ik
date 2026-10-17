// Yıllık ücretli izin belgeleri (yazdır / PDF): kişi başına izin kartı ve tek izin için izin formu.
// Yıllık Ücretli İzin Yönetmeliği'ndeki izin kayıt belgesi alanlarına göre hazırlanır; işçi ve işveren
// imzalı kopya Özlük > Belgeler'e "İzin belgesi" olarak yüklenebilir.
import type { Izin, IzinBakiyesi, Personel } from "./tipler";
import { gunYaz } from "./tipler";
import { yerelTarih } from "./tarih";

export interface HakedisYili {
  yil: number;
  tarih: string;
  gun: number;
  /** Devir tarihinden önceki hakedişler devreden izne dahildir, ayrıca sayılmaz */
  sayildi: boolean;
}

function tarihEkleYil(tarih: string, yil: number): string {
  const [y, a, g] = tarih.split("-").map(Number);
  // 29 Şubat: hakediş 28 Şubat'a kayar (Postgres make_interval ile aynı)
  const son = new Date(Date.UTC(y + yil, a, 0)).getUTCDate();
  return `${y + yil}-${String(a).padStart(2, "0")}-${String(Math.min(g, son)).padStart(2, "0")}`;
}

function yasHesapla(dogum: string, tarih: string): number {
  const [dy, da, dg] = dogum.split("-").map(Number);
  const [ty, ta, tg] = tarih.split("-").map(Number);
  return ty - dy - (ta < da || (ta === da && tg < dg) ? 1 : 0);
}

/** Veritabanındaki _yillik_izin_hesapla ile aynı kurallar: 1-5 yıl 14, 6-14 yıl 20, 15+ yıl 26 gün; 18 yaş ve altı ile 50 yaş ve üstü en az 20 */
export function hakedisYillari(p: Personel, bugun = yerelTarih()): HakedisYili[] {
  if (!p.ise_giris_tarihi) return [];
  const baslangic = p.devir_tarihi ?? p.ise_giris_tarihi;
  const sonuc: HakedisYili[] = [];
  for (let y = 1; y <= 80; y++) {
    const tarih = tarihEkleYil(p.ise_giris_tarihi, y);
    if (tarih > bugun) break;
    let gun = y <= 5 ? 14 : y < 15 ? 20 : 26;
    if (p.dogum_tarihi) {
      const yas = yasHesapla(p.dogum_tarihi, tarih);
      if (yas <= 18 || yas >= 50) gun = Math.max(gun, 20);
    }
    sonuc.push({ yil: y, tarih, gun, sayildi: tarih > baslangic });
  }
  return sonuc;
}

/** Yıllık izinden düşen onaylı izinler (yıllık ve saatlik), devir/işe giriş tarihinden sonra */
export function yillikKullanimlar(p: Personel, izinler: Izin[]): Izin[] {
  const baslangic = p.devir_tarihi ?? p.ise_giris_tarihi ?? "0000-00-00";
  return izinler
    .filter(
      (iz) =>
        iz.personel_id === p.id &&
        (iz.izin_turu === "Yıllık İzin" || iz.izin_turu === "Saatlik İzin") &&
        (!iz.durum || iz.durum === "ONAYLANDI") &&
        iz.baslangic_tarihi >= baslangic
    )
    .sort((a, b) => a.baslangic_tarihi.localeCompare(b.baslangic_tarihi));
}

function k(deger: unknown): string {
  return String(deger ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "2026-10-17" -> "17.10.2026" */
function tr(tarih: string | null | undefined): string {
  if (!tarih) return "-";
  const [y, a, g] = tarih.slice(0, 10).split("-");
  return `${g}.${a}.${y}`;
}

/** İşe dönüş için firmanın takvimi: çalışılmayan günler (ISO 1-7) ve tam gün resmi tatiller */
export interface IsTakvimi {
  calismayanGunler: readonly number[];
  tatiller: ReadonlySet<string>;
}

/** İzin bitişinden sonraki ilk iş günü (vardiya planı dikkate alınmaz) */
function isBasiTarihi(bitis: string, takvim?: IsTakvimi): string {
  const d = new Date(`${bitis}T12:00:00Z`);
  for (let i = 0; i < 14; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const t = d.toISOString().slice(0, 10);
    if (!takvim) return t;
    if (!takvim.calismayanGunler.includes(d.getUTCDay() || 7) && !takvim.tatiller.has(t)) return t;
  }
  return d.toISOString().slice(0, 10);
}

const STIL = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; margin: 0; padding: 24px; font-size: 12px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; }
  .ust { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 12px; }
  .kucuk { color: #4b5563; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #9ca3af; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  td.sag, th.sag { text-align: right; }
  .bilgi td:first-child { width: 34%; background: #f9fafb; font-weight: 600; }
  .toplam td { font-weight: 700; background: #f9fafb; }
  .imzalar { display: flex; gap: 24px; margin-top: 36px; }
  .imzalar div { flex: 1; border-top: 1px solid #111827; padding-top: 6px; text-align: center; min-height: 60px; }
  .beyan { margin-top: 14px; line-height: 1.6; }
  @media print { body { padding: 0; } @page { size: A4; margin: 14mm; } }
`;

function yazdir(baslik: string, govde: string): string | null {
  const pencere = window.open("", "_blank");
  if (!pencere) return "Açılır pencere engellendi. Tarayıcıdan bu site için izin verin.";
  pencere.document.write(
    `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8" /><title>${k(baslik)}</title><style>${STIL}</style></head><body>${govde}</body></html>`
  );
  pencere.document.close();
  pencere.focus();
  setTimeout(() => pencere.print(), 400);
  return null;
}

function personelBilgisi(firmaAd: string, p: Personel): string {
  return `<table class="bilgi">
    <tr><td>İşveren</td><td>${k(firmaAd)}</td></tr>
    <tr><td>İşçinin adı soyadı</td><td>${k(`${p.ad} ${p.soyad}`)}</td></tr>
    <tr><td>T.C. kimlik no / sicil no</td><td>${k(p.tc_kimlik)} / ${k(p.sicil_no)}</td></tr>
    <tr><td>Şube / departman</td><td>${k(p.subeler?.ad ?? "-")} / ${k(p.departman ?? "-")}</td></tr>
    <tr><td>İşe giriş tarihi</td><td>${tr(p.ise_giris_tarihi)}</td></tr>
  </table>`;
}

/** Kişi başına yıllık ücretli izin kayıt belgesi (izin kartı). Başarılıysa null, sorun varsa mesaj döner. */
export function izinKartiYazdir(firmaAd: string, p: Personel, izinler: Izin[], bakiye?: IzinBakiyesi, takvim?: IsTakvimi): string | null {
  if (!p.ise_giris_tarihi) return "İzin kartı için önce işe giriş tarihini girin.";
  const bugun = yerelTarih();
  const hak = hakedisYillari(p, bugun);
  const kullanimlar = yillikKullanimlar(p, izinler);
  const devreden = Number(p.devreden_izin_gun ?? 0);
  const hakToplam = hak.filter((h) => h.sayildi).reduce((t, h) => t + h.gun, 0);
  const kullanilan = kullanimlar.reduce((t, iz) => t + Number(iz.gun_sayisi ?? 0), 0);

  const hakSatirlari = hak
    .map(
      (h) => `<tr>
        <td>${h.yil}. hizmet yılı</td><td>${tr(h.tarih)}</td><td class="sag">${h.gun}</td>
        <td>${h.sayildi ? "" : "Devreden izne dahil"}</td>
      </tr>`
    )
    .join("");

  const kullanimSatirlari = kullanimlar
    .map((iz) => {
      const saatlik = iz.izin_turu === "Saatlik İzin";
      return `<tr>
        <td>${k(iz.izin_turu)}</td>
        <td>${tr(iz.baslangic_tarihi)}${saatlik && iz.baslangic_saat ? ` ${k(iz.baslangic_saat.slice(0, 5))}-${k((iz.bitis_saat ?? "").slice(0, 5))}` : ""}</td>
        <td>${saatlik ? "-" : tr(iz.bitis_tarihi)}</td>
        <td>${saatlik ? "-" : tr(isBasiTarihi(iz.bitis_tarihi, takvim))}</td>
        <td class="sag">${gunYaz(iz.gun_sayisi)}</td>
        <td></td>
      </tr>`;
    })
    .join("");

  const govde = `
    <div class="ust">
      <div><h1>Yıllık Ücretli İzin Kayıt Belgesi</h1><div class="kucuk">İzin kartı</div></div>
      <div class="kucuk">Düzenleme tarihi: ${tr(bugun)}</div>
    </div>
    ${personelBilgisi(firmaAd, p)}

    <h2>İzne hak kazanma</h2>
    <table>
      <tr><th>Hizmet yılı</th><th>Hak kazanma tarihi</th><th class="sag">Gün</th><th>Not</th></tr>
      ${devreden ? `<tr><td colspan="2">Devreden izin (${tr(p.devir_tarihi)} itibarıyla)</td><td class="sag">${gunYaz(devreden)}</td><td></td></tr>` : ""}
      ${hakSatirlari || `<tr><td colspan="4">Henüz izne hak kazanılmadı (1 yıllık çalışma dolmadı).</td></tr>`}
    </table>

    <h2>Kullanılan izinler</h2>
    <table>
      <tr><th>Tür</th><th>Başlangıç</th><th>Bitiş</th><th>İşe dönüş</th><th class="sag">Gün</th><th>İşçi imzası</th></tr>
      ${kullanimSatirlari || `<tr><td colspan="6">Kullanılan yıllık izin yok.</td></tr>`}
    </table>

    <h2>Özet</h2>
    <table>
      <tr><td>Devreden izin</td><td class="sag">${gunYaz(devreden)}</td></tr>
      <tr><td>Hak edilen izin</td><td class="sag">${gunYaz(hakToplam)}</td></tr>
      <tr><td>Kullanılan izin</td><td class="sag">${gunYaz(kullanilan)}</td></tr>
      <tr class="toplam"><td>Kalan izin</td><td class="sag">${gunYaz(devreden + hakToplam - kullanilan)}</td></tr>
      ${bakiye?.sonraki_hak_tarihi ? `<tr><td>Sonraki hak kazanma</td><td class="sag">${tr(bakiye.sonraki_hak_tarihi)} (${bakiye.sonraki_hak_gun} gün)</td></tr>` : ""}
    </table>
    <p class="kucuk">Hafta tatili ve resmi tatiller izinden düşülmez, arife yarım gün sayılır. Firma kuralına göre izin bitişiyle işe dönüş arasındaki Cumartesi izinden düşülebilir. Saatlik izinler şirket ayarındaki günlük süreye bölünerek düşer.</p>

    <div class="imzalar"><div>İşçi<br />Ad soyad / imza</div><div>İşveren veya vekili<br />Ad soyad / imza / kaşe</div></div>
  `;
  return yazdir(`İzin kartı - ${p.ad} ${p.soyad}`, govde);
}

/** Tek izin için imzalanacak izin formu. Başarılıysa null, sorun varsa mesaj döner. */
export function izinFormuYazdir(firmaAd: string, p: Personel, iz: Izin, bakiye?: IzinBakiyesi, takvim?: IsTakvimi): string | null {
  const saatlik = iz.izin_turu === "Saatlik İzin";
  const yillik = iz.izin_turu === "Yıllık İzin" || saatlik;
  const govde = `
    <div class="ust">
      <div><h1>İzin Formu</h1><div class="kucuk">${k(iz.izin_turu)}</div></div>
      <div class="kucuk">Düzenleme tarihi: ${tr(yerelTarih())}</div>
    </div>
    ${personelBilgisi(firmaAd, p)}

    <h2>İzin bilgileri</h2>
    <table class="bilgi">
      <tr><td>İzin türü</td><td>${k(iz.izin_turu)}${iz.sgk_kodu ? ` (SGK: ${k(iz.sgk_kodu)})` : ""}</td></tr>
      <tr><td>İzin başlangıcı</td><td>${tr(iz.baslangic_tarihi)}${saatlik && iz.baslangic_saat ? ` ${k(iz.baslangic_saat.slice(0, 5))}` : ""}</td></tr>
      <tr><td>İzin bitişi</td><td>${saatlik ? `${tr(iz.bitis_tarihi)} ${k((iz.bitis_saat ?? "").slice(0, 5))}` : tr(iz.bitis_tarihi)}</td></tr>
      ${saatlik ? "" : `<tr><td>İşe başlama tarihi</td><td>${tr(isBasiTarihi(iz.bitis_tarihi, takvim))}</td></tr>`}
      <tr><td>İzinden düşülen gün</td><td>${gunYaz(iz.gun_sayisi)}</td></tr>
      ${yillik && bakiye?.tanimli ? `<tr><td>Bu izinden sonra kalan yıllık izin</td><td>${gunYaz(bakiye.kalan)} gün</td></tr>` : ""}
      ${iz.aciklama ? `<tr><td>Açıklama</td><td>${k(iz.aciklama)}</td></tr>` : ""}
      <tr><td>Durum</td><td>${k(iz.durum ?? "ONAYLANDI")}</td></tr>
    </table>

    <p class="beyan">
      Yukarıda tarihleri belirtilen ${k(iz.izin_turu.toLocaleLowerCase("tr-TR"))} hakkımı belirtilen tarihlerde kullandığımı
      ${yillik ? "ve izin süresine ait ücretin tarafıma ödeneceğini " : ""}beyan ederim.
    </p>

    <div class="imzalar">
      <div>İzni kullanan işçi<br />Ad soyad / imza / tarih</div>
      <div>Onaylayan amir<br />Ad soyad / imza</div>
      <div>İşveren veya vekili<br />Ad soyad / imza / kaşe</div>
    </div>
  `;
  return yazdir(`İzin formu - ${p.ad} ${p.soyad} - ${tr(iz.baslangic_tarihi)}`, govde);
}
