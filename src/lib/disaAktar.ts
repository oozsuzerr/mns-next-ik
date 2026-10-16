import * as XLSX from "xlsx";
import { saatDakika } from "./tarih";

export type Satir = Record<string, string | number | null | undefined>;
export type Bicim = "xlsx" | "csv" | "json" | "pdf";

// CSV formül enjeksiyonuna karşı: = + - @ ile başlayan METİNLERİN başına ' konur
function csvHucre(deger: string | number | null | undefined): string {
  if (typeof deger === "number") return `"${deger}"`;
  let s = (deger ?? "").toString();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

// PDF/yazdır penceresine yazılan her değer HTML'e karşı kaçışlanır (XSS koruması)
function htmlKacis(deger: unknown): string {
  return String(deger ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function blobIndir(icerik: BlobPart, dosyaAdi: string, tip: string) {
  const blob = new Blob([icerik], { type: tip });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", dosyaAdi);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Başarılıysa null, sorun varsa kullanıcıya gösterilecek mesajı döndürür.
 * sureSutunlari: değeri dakika (sayı) olan sütunlar. Excel'de toplanabilir süre ([h]:mm),
 * CSV/JSON/PDF'te "2:18" metni olarak yazılır.
 */
export function disariAktar(
  format: Bicim,
  baslik: string,
  dosyaAdi: string,
  veriler: Satir[],
  sureSutunlari: string[] = []
): string | null {
  if (veriler.length === 0) return "Bu sekmede dışa aktarılacak veri bulunamadı.";

  const basliklar = Object.keys(veriler[0]);

  if (format === "xlsx") {
    const sayfa = XLSX.utils.json_to_sheet(veriler);
    for (const sutun of sureSutunlari) {
      const c = basliklar.indexOf(sutun);
      if (c < 0) continue;
      for (let r = 1; r <= veriler.length; r++) {
        const hucre = sayfa[XLSX.utils.encode_cell({ r, c })];
        if (!hucre || typeof hucre.v !== "number") continue;
        // Excel negatif süreyi gösteremez; o durumda metin yazılır
        if (hucre.v < 0) Object.assign(hucre, { t: "s", v: saatDakika(hucre.v) });
        else Object.assign(hucre, { v: hucre.v / 1440, z: "[h]:mm" });
      }
    }
    const kitap = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(kitap, sayfa, baslik.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    XLSX.writeFile(kitap, `${dosyaAdi}.xlsx`);
    return null;
  }

  if (sureSutunlari.length > 0) {
    veriler = veriler.map((s) => {
      const yeni = { ...s };
      for (const sutun of sureSutunlari) {
        const deger = yeni[sutun];
        if (typeof deger === "number") yeni[sutun] = saatDakika(deger);
      }
      return yeni;
    });
  }

  if (format === "csv") {
    const satirlar = veriler.map((s) => basliklar.map((k) => csvHucre(s[k])).join(";"));
    const icerik = "\uFEFF" + [basliklar.map((b) => csvHucre(b)).join(";"), ...satirlar].join("\r\n");
    blobIndir(icerik, `${dosyaAdi}.csv`, "text/csv;charset=utf-8;");
    return null;
  }

  if (format === "json") {
    blobIndir(JSON.stringify(veriler, null, 2), `${dosyaAdi}.json`, "application/json;charset=utf-8;");
    return null;
  }

  // pdf (yazdır)
  const pencere = window.open("", "_blank");
  if (!pencere) return "Açılır pencere engellendi. Tarayıcıdan bu site için izin verin.";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${htmlKacis(baslik)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #1e293b; margin: 0; }
  .ust { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 12px; }
  .logo { font-size: 18px; font-weight: 900; color: #2563eb; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #cbd5e1; }
  td { padding: 6px 8px; border: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  @media print { @page { size: landscape; margin: 8mm; } }
</style>
</head>
<body>
  <div class="ust">
    <div class="logo">MNS NEXT IK • ${htmlKacis(baslik)}</div>
    <div style="font-size:11px;">Tarih: ${htmlKacis(new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }))}</div>
  </div>
  <table>
    <thead><tr>${basliklar.map((b) => `<th>${htmlKacis(b)}</th>`).join("")}</tr></thead>
    <tbody>
      ${veriler
        .map((s) => `<tr>${basliklar.map((b) => `<td>${htmlKacis(s[b] ?? "-")}</td>`).join("")}</tr>`)
        .join("")}
    </tbody>
  </table>
</body>
</html>`;

  pencere.document.write(html);
  pencere.document.close();
  pencere.focus();
  setTimeout(() => pencere.print(), 400);
  return null;
}
