// Testlerde src/lib içindeki uzantısız importları (from "./tarih") .ts dosyasına çözer.
// Node 24 TypeScript'i kendisi çalıştırır; ek paket gerekmez. Kullanım: npm test
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(belirtec, baglam, sonraki) {
  try {
    return await sonraki(belirtec, baglam);
  } catch (hata) {
    if ((belirtec.startsWith("./") || belirtec.startsWith("../")) && !/\\.[a-z]+$/i.test(belirtec)) {
      return sonraki(belirtec + ".ts", baglam);
    }
    throw hata;
  }
}`),
  import.meta.url
);
