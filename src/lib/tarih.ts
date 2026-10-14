// Tüm tarih/saat işlemleri Türkiye saatine (UTC+3) göre yapılır.
// Böylece gece 00:00-03:00 arası hareketler yanlış güne düşmez.

export const TZ = "Europe/Istanbul";

const tarihBicimi = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const saatBicimi = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const tarihSaatBicimi = new Intl.DateTimeFormat("tr-TR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const GUN_ADLARI = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/** "2026-10-13" biçiminde, Türkiye saatine göre tarih */
export function yerelTarih(d: Date | string | number = new Date()): string {
  return tarihBicimi.format(new Date(d));
}

/** "14:05" biçiminde, Türkiye saatine göre saat */
export function yerelSaat(d: Date | string | number): string {
  return saatBicimi.format(new Date(d));
}

/** "13.10.2026 14:05" */
export function yerelTarihSaat(d: Date | string | number): string {
  return tarihSaatBicimi.format(new Date(d));
}

/** "YYYY-MM-DD" metninin haftanın günü (0 = Pazar). Saat dilimi bağımsızdır. */
export function haftaGunu(tarih: string): number {
  const [y, m, d] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function ayGunSayisi(yil: number, ay: number): number {
  return new Date(Date.UTC(yil, ay, 0)).getUTCDate();
}

export function gunStr(yil: number, ay: number, gun: number): string {
  return `${yil}-${String(ay).padStart(2, "0")}-${String(gun).padStart(2, "0")}`;
}

/** "2026-10" için [ay başı, sonraki ay başı) aralığı (Türkiye saatiyle) */
export function ayAraligi(ay: string): { bas: Date; son: Date } {
  const [y, m] = ay.split("-").map(Number);
  const sy = m === 12 ? y + 1 : y;
  const sm = m === 12 ? 1 : m + 1;
  return {
    bas: new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+03:00`),
    son: new Date(`${sy}-${String(sm).padStart(2, "0")}-01T00:00:00+03:00`),
  };
}

/** Belirli bir günün belirli saatini (Türkiye saatiyle) gerçek zaman noktasına çevirir */
export function planAni(tarih: string, saat: string): Date {
  return new Date(`${tarih}T${saat.slice(0, 5)}:00+03:00`);
}

/** 125 -> "2 sa 5 dk", 40 -> "40 dk" */
export function sureYaz(dk: number): string {
  if (dk >= 60) return `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
  return `${dk} dk`;
}
