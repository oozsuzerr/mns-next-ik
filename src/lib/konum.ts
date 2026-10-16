// Şube konumu girişi: yapıştırılan koordinat ya da harita bağlantısından enlem/boylam çıkarır.

export interface Nokta {
  enlem: number;
  boylam: number;
}

function gecerli(enlem: number, boylam: number): Nokta | null {
  if (!Number.isFinite(enlem) || !Number.isFinite(boylam)) return null;
  if (enlem < -90 || enlem > 90 || boylam < -180 || boylam > 180) return null;
  return { enlem: Math.round(enlem * 1e7) / 1e7, boylam: Math.round(boylam * 1e7) / 1e7 };
}

/**
 * Desteklenenler:
 *   "41.0082, 28.9784"  /  "41,0082 28,9784"           (Google Haritalar'da sağ tık > koordinat)
 *   https://www.google.com/maps/place/.../@41.0082,28.9784,17z
 *   https://www.google.com/maps/...!3d41.0082!4d28.9784  (yer işareti, @'den daha kesin)
 *   https://maps.google.com/?q=41.0082,28.9784  ve  ll=  /  query=
 *   https://www.openstreetmap.org/#map=17/41.0082/28.9784  ve  ?mlat=..&mlon=..
 * Kısa bağlantılar (maps.app.goo.gl, goo.gl/maps) tarayıcıdan çözülemez: "KISA_BAGLANTI" döner.
 */
export function koordinatAyikla(metin: string): Nokta | "KISA_BAGLANTI" | null {
  const s = metin.trim();
  if (!s) return null;
  if (/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s)) return "KISA_BAGLANTI";

  const sayi = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const desenler: RegExp[] = [
    new RegExp(String.raw`!3d${sayi}!4d${sayi}`),
    new RegExp(String.raw`[?&](?:q|ll|query|center|destination)=${sayi},\s*${sayi}`),
    new RegExp(String.raw`@${sayi},${sayi}`),
    new RegExp(String.raw`mlat=${sayi}&mlon=${sayi}`),
    new RegExp(String.raw`#map=\d+/${sayi}/${sayi}`),
  ];
  for (const d of desenler) {
    const m = s.match(d);
    if (m) return gecerli(Number(m[1]), Number(m[2]));
  }

  // Düz koordinat: "41.0082, 28.9784" ya da Türkçe ondalıkla "41,0082 28,9784"
  const duz = s.match(/^(-?\d{1,3}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)$/);
  if (duz) return gecerli(Number(duz[1].replace(",", ".")), Number(duz[2].replace(",", ".")));
  return null;
}

/** OpenStreetMap gömülü harita adresi: nokta ortada, sınırın yaklaşık 3 katı genişlikte alan */
export function haritaAdresi(n: Nokta, sinirMetre: number): string {
  const yaricap = Math.max(sinirMetre, 50) * 3;
  const dEnlem = yaricap / 111_320;
  const dBoylam = yaricap / (111_320 * Math.max(Math.cos((n.enlem * Math.PI) / 180), 0.01));
  const kutu = [n.boylam - dBoylam, n.enlem - dEnlem, n.boylam + dBoylam, n.enlem + dEnlem].map((x) => x.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${kutu}&layer=mapnik&marker=${n.enlem},${n.boylam}`;
}

export function googleHaritaAdresi(n: Nokta): string {
  return `https://www.google.com/maps?q=${n.enlem},${n.boylam}`;
}
