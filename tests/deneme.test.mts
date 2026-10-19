import { test } from "node:test";
import assert from "node:assert/strict";
import { basvuruDogrula, denemeBitisi, firmaKoduUret, kalanGun, telefonTemizle } from "../src/lib/deneme.ts";

const iyi = { firmaAd: "Kuzey İnşaat", ad: "Ayşe", soyad: "Yılmaz", telefon: "0532 123 45 67", eposta: "AYSE@ornek.com ", personelSayisi: "11-50", kvkk: true };

test("telefon: 0'lı, +90'lı ve boşluklu yazımlar aynı sonuca iner", () => {
  assert.equal(telefonTemizle("0532 123 45 67"), "5321234567");
  assert.equal(telefonTemizle("+90 (532) 123-45-67"), "5321234567");
  assert.equal(telefonTemizle("5321234567"), "5321234567");
  assert.equal(telefonTemizle("0212 123 45 67"), null);
  assert.equal(telefonTemizle("532123"), null);
});

test("başvuru: geçerli form temizlenir, e-posta küçük harfe iner", () => {
  const s = basvuruDogrula(iyi);
  assert.ok("basvuru" in s);
  assert.equal(s.basvuru.eposta, "ayse@ornek.com");
  assert.equal(s.basvuru.telefon, "5321234567");
  assert.equal(s.basvuru.ticariIleti, false);
});

test("başvuru: KVKK onayı ve personel aralığı zorunlu", () => {
  assert.deepEqual(basvuruDogrula({ ...iyi, kvkk: false }), { hata: "KVKK_ONAYI_YOK" });
  assert.deepEqual(basvuruDogrula({ ...iyi, personelSayisi: "9999" }), { hata: "PERSONEL_SAYISI_GECERSIZ" });
  assert.deepEqual(basvuruDogrula({ ...iyi, eposta: "yok" }), { hata: "EPOSTA_GECERSIZ" });
});

test("firma kodu: Türkçe harfler sadeleşir, sistem kuralına (a-z0-9-, 3-20) uyar", () => {
  const k = firmaKoduUret("Çağlayan Özel Güvenlik Hizmetleri A.Ş.", "X7K2");
  assert.equal(k, "caglayan-ozel-x7k2");
  assert.match(k, /^[a-z0-9-]{3,20}$/);
  assert.equal(firmaKoduUret("!!!", "ab"), "firma-ab00");
});

test("deneme bitişi: bugün dahil 14 gün, Türkiye saatine göre", () => {
  // 19 Ekim 2026 23:30 Türkiye = 20:30 UTC
  assert.equal(denemeBitisi(new Date("2026-10-19T20:30:00Z")), "2026-11-01");
  // 19 Ekim 2026 22:30 UTC = 20 Ekim 01:30 Türkiye
  assert.equal(denemeBitisi(new Date("2026-10-19T22:30:00Z")), "2026-11-02");
});

test("kalan gün: bitiş günü dahil, geçmişte 0", () => {
  const simdi = new Date("2026-10-19T09:00:00Z");
  assert.equal(kalanGun("2026-11-01", simdi), 14);
  assert.equal(kalanGun("2026-10-19", simdi), 1);
  assert.equal(kalanGun("2026-10-18", simdi), 0);
});
