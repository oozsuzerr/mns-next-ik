// Ücretsiz deneme kaydının yalnızca sunucuda çalışan yardımcıları.
import { createHash, timingSafeEqual } from "node:crypto";

/** Doğrulama kodu veritabanında açık tutulmaz: başvuru kimliğiyle birlikte özetlenir */
export const kodHash = (id: string, kod: string) => createHash("sha256").update(`${id}:${kod}`).digest("hex");

/** Kodu sabit sürede karşılaştırır */
export function kodEsit(id: string, kod: string, hash: string): boolean {
  const a = Buffer.from(kodHash(id, kod), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function istemciIp(istek: Request): string {
  return (istek.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64) || "bilinmiyor";
}
