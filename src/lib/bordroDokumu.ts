// Kişi bazlı puantaj ve maaş dökümü: yazdır / PDF (her personel ayrı sayfa) ve kişi Excel'i
import { tlYaz, type TahminiBordro } from "./bordro";
import type { Satir } from "./disaAktar";
import { k } from "./izinBelgeleri";
import type { PuantajSatiri } from "./puantaj";
import { ondalik, saatYaz, type GunOzeti } from "./puantajCetveli";
import { ayAdi } from "./tarih";

export interface DokumKisi {
  p: PuantajSatiri;
  oz: GunOzeti;
  b: TahminiBordro;
  ucretTuru: string;
  ekKazanclar: { tur: string; tutar: number; vergili: boolean }[];
}

/** Hesap satırları: [ad, tutar, işaret] (işaret: "+" ekleme, "-" kesinti, "=" ara toplam) */
export function hesapKalemleri(d: DokumKisi): [string, number, "+" | "-" | "="][] {
  const b = d.b;
  const l: [string, number, "+" | "-" | "="][] = [[`Ücret (${d.ucretTuru}, ${d.oz.primGun} gün)`, b.ucretBrut, "+"]];
  if (b.tatilUcreti) l.push(["Tatil günleri ücreti", b.tatilUcreti, "+"]);
  if (b.eksikKesinti) l.push([`Eksik çalışma kesintisi (${saatYaz(ondalik(d.oz.kesintiliEksikDk))} saat)`, b.eksikKesinti, "-"]);
  for (const m of b.mesai.satirlar) l.push([`${m.ad} (${saatYaz(m.saat)} sa × ${String(m.carpan)})`, m.tutar, "+"]);
  for (const e of d.ekKazanclar.filter((x) => x.vergili)) l.push([`${e.tur} (ek kazanç)`, e.tutar, "+"]);
  l.push(["Toplam brüt", b.brut, "="]);
  l.push(["SGK işçi payı", b.sgkIsci, "-"]);
  l.push(["İşsizlik işçi payı", b.issizlikIsci, "-"]);
  l.push(["Gelir vergisi", b.gelirVergisi, "-"]);
  l.push(["Damga vergisi", b.damgaVergisi, "-"]);
  l.push(["Net ücret", b.net, "="]);
  for (const e of d.ekKazanclar.filter((x) => !x.vergili)) l.push([`${e.tur} (vergisiz ek ödeme)`, e.tutar, "+"]);
  if (b.avans) l.push(["Avans", b.avans, "-"]);
  if (b.masraf) l.push(["Masraf ödemesi", b.masraf, "+"]);
  l.push(["Ödenecek", b.odenecek, "="]);
  l.push(["İşveren maliyeti", b.isverenMaliyeti, "="]);
  return l;
}

function kisiSayfasi(d: DokumKisi, ay: string, firma: string): string {
  const { p, oz } = d;
  const gunler = p.gunlukDetaylar
    .map((g) => {
      const fark = g.calismaDk > 0 && g.planDk > 0 && g.gunTuru === "is" ? saatYaz(ondalik(g.calismaDk - g.planDk)) : "";
      return `<tr><td>${k(g.tarih.slice(8, 10))} ${k(g.gunAdi)}</td><td>${k(g.giris)}</td><td>${k(g.cikis)}</td><td class="sag">${g.planDk ? saatYaz(ondalik(g.planDk)) : ""}</td><td class="sag">${g.calismaDk ? saatYaz(ondalik(g.calismaDk)) : ""}</td><td class="sag">${k(fark)}</td><td>${k(g.durum)}</td></tr>`;
    })
    .join("");
  const ozet: [string, string | number][] = [
    ["Ay günü", oz.ayGun],
    ["SGK günü", oz.sgkGun],
    ["Ücretli gün (TG)", oz.primGun],
    ["Normal gün (NG)", oz.normalGun],
    ["Hafta tatili gün", oz.htGun],
    ["Resmî tatil gün", oz.rtGun],
    ["Devamsız", oz.devamsiz],
    ["Ücretli izin", oz.ucretliIzin],
    ["Ücretsiz izin", oz.ucretsizIzin],
    ["Rapor", oz.rapor],
    ["NM (saat)", saatYaz(ondalik(oz.normalDk))],
    ["FM onaylı (saat)", saatYaz(ondalik(oz.onayliFazlaDk))],
    ["EÇ (saat)", saatYaz(-ondalik(oz.eksikDk))],
    ["HT onaylı (saat)", saatYaz(ondalik(oz.onayliHtDk))],
    ["RT onaylı (saat)", saatYaz(ondalik(oz.onayliRtDk))],
    ["Onaysız fazla çalışma (saat, ücrete girmez)", saatYaz(ondalik(oz.onaysizDk))],
  ];
  const hesap = hesapKalemleri(d)
    .map(([ad, t, i]) => `<tr class="${i === "=" ? "kalin" : ""}"><td>${k(ad)}</td><td class="sag">${i === "-" ? "−" : ""}${tlYaz(t)}</td></tr>`)
    .join("");
  return `<section class="sayfa">
  <div class="ust"><div class="logo">${k(firma || "MNS Next IK")}</div><div>Puantaj ve maaş dökümü · ${k(ayAdi(ay))}</div></div>
  <p><strong>${k(p.adSoyad)}</strong> · Sicil ${k(p.sicil_no)} · ${k(p.subeAdi)} · ${k(p.departman)}</p>
  <div class="iki">
    <table><thead><tr><th>Gün</th><th>Giriş</th><th>Çıkış</th><th>Plan</th><th>Çalışma</th><th>Fark</th><th>Durum</th></tr></thead><tbody>${gunler}</tbody></table>
    <div>
      <table><tbody>${ozet.map(([a, v]) => `<tr><td>${k(a)}</td><td class="sag">${k(v)}</td></tr>`).join("")}</tbody></table>
      <table style="margin-top:10px"><tbody>${hesap}</tbody></table>
      <p class="not">Tahminidir; resmî bordro yerine geçmez. Saatler ondalıktır (7.5 = 7 sa 30 dk).</p>
      <div class="imza"><div>İşveren</div><div>Personel</div></div>
    </div>
  </div>
</section>`;
}

/** Yazdırma penceresi; açılır pencere engellenirse mesaj döner */
export function bordroDokumuYazdir(kisiler: DokumKisi[], ay: string, firma: string): string | null {
  if (!kisiler.length) return "Yazdırılacak personel yok (ücreti girilmiş personel gerekir).";
  const w = window.open("", "_blank");
  if (!w) return "Açılır pencere engellendi. Tarayıcıdan bu site için izin verin.";
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Puantaj ve maaş dökümü ${k(ay)}</title>
<style>
  body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#1e293b;margin:0;padding:16px;font-size:10px}
  .sayfa{page-break-after:always;margin-bottom:24px} .sayfa:last-child{page-break-after:auto}
  .ust{display:flex;justify-content:space-between;border-bottom:2px solid #2563eb;padding-bottom:6px;margin-bottom:8px;font-size:12px}
  .logo{font-weight:800;color:#2563eb}
  .iki{display:grid;grid-template-columns:1.5fr 1fr;gap:12px;align-items:start}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid #e2e8f0;padding:3px 5px;text-align:left} th{background:#f1f5f9}
  .sag{text-align:right} .kalin td{font-weight:700;background:#f8fafc} .not{color:#64748b;margin-top:8px}
  .imza{display:flex;justify-content:space-between;margin-top:36px} .imza div{border-top:1px solid #94a3b8;width:40%;text-align:center;padding-top:4px}
  @media print{body{padding:0}}
</style></head><body>${kisiler.map((d) => kisiSayfasi(d, ay, firma)).join("")}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return null;
}

/** Kişi Excel'i: puantaj günleri, gün/saat özeti ve hesap satırları tek tabloda */
export function kisiDokumuSatirlari(d: DokumKisi): Satir[] {
  const s: Satir[] = d.p.gunlukDetaylar.map((g) => ({
    Bölüm: "Puantaj",
    Kalem: `${g.tarih} ${g.gunAdi}`,
    Değer: g.calismaDk ? ondalik(g.calismaDk) : "",
    Açıklama: [g.giris !== "-" ? `${g.giris}-${g.cikis}` : "", g.planDk ? `plan ${saatYaz(ondalik(g.planDk))}` : "", g.durum].filter(Boolean).join(" · "),
  }));
  const oz = d.oz;
  const ozet: [string, number][] = [
    ["Ay günü", oz.ayGun],
    ["SGK günü", oz.sgkGun],
    ["Ücretli gün (TG)", oz.primGun],
    ["Normal gün (NG)", oz.normalGun],
    ["Hafta tatili gün", oz.htGun],
    ["Resmî tatil gün", oz.rtGun],
    ["Devamsız gün", oz.devamsiz],
    ["Ücretli izin gün", oz.ucretliIzin],
    ["Ücretsiz izin gün", oz.ucretsizIzin],
    ["Rapor gün", oz.rapor],
    ["NM (saat)", ondalik(oz.normalDk)],
    ["FM onaylı (saat)", ondalik(oz.onayliFazlaDk)],
    ["EÇ (saat)", -ondalik(oz.eksikDk)],
    ["HT onaylı (saat)", ondalik(oz.onayliHtDk)],
    ["RT onaylı (saat)", ondalik(oz.onayliRtDk)],
    ["Onaysız fazla çalışma (saat, ücrete girmez)", ondalik(oz.onaysizDk)],
  ];
  for (const [a, v] of ozet) s.push({ Bölüm: "Özet", Kalem: a, Değer: v, Açıklama: "" });
  for (const [a, t, i] of hesapKalemleri(d)) s.push({ Bölüm: "Ücret", Kalem: a, Değer: i === "-" ? -t : t, Açıklama: i === "=" ? "Toplam" : "" });
  return s;
}
