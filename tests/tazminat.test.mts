import { test } from "node:test";
import assert from "node:assert/strict";
import { hizmetSuresi, ihbarGunu, tazminatHesapla } from "../src/lib/tazminat.ts";
import { VARSAYILAN_YASAL as Y } from "../src/lib/bordro.ts";

const g = (x: object = {}) =>
  ({ iseGiris: "2022-10-18", cikis: "2026-10-17", brutUcret: 40000, ekOdemeler: 0, kidemVar: true, ihbarVar: true, izinGun: 0, kumulatifMatrah: 0, kidemTavani: 73729.84, yasal: Y, ...x }) as never;

test("hizmet süresi: tam 4 yıl", () => {
  assert.deepEqual(hizmetSuresi("2022-10-18", "2026-10-17"), { yil: 4, ay: 0, gun: 0, toplamGun: 1461 });
});

test("ihbar süreleri 2/4/6/8 hafta", () => {
  assert.equal(ihbarGunu(hizmetSuresi("2026-06-01", "2026-10-17")), 14);
  assert.equal(ihbarGunu(hizmetSuresi("2025-10-01", "2026-10-17")), 28);
  assert.equal(ihbarGunu(hizmetSuresi("2024-10-01", "2026-10-17")), 42);
  assert.equal(ihbarGunu(hizmetSuresi("2020-01-01", "2026-10-17")), 56);
});

test("kıdem: 4 yıl × 40.000; yalnızca damga vergisi", () => {
  const s = tazminatHesapla(g());
  assert.equal(s.kidem.brut, 160000);
  assert.equal(s.kidem.damga, Math.round(160000 * 0.00759 * 100) / 100);
});

test("kıdem tavanı uygulanır", () => {
  const s = tazminatHesapla(g({ brutUcret: 100000 }));
  assert.equal(s.kidem.esas, 73729.84);
  assert.ok(s.kidem.tavanli);
});

test("1 yıldan az hizmette kıdem yok; istifada ihbar yok", () => {
  assert.equal(tazminatHesapla(g({ iseGiris: "2026-01-01" })).kidem.brut, 0);
  assert.equal(tazminatHesapla(g({ ihbarVar: false })).ihbar.brut, 0);
});

test("ihbar: 56 gün × günlük giydirilmiş, gelir vergisi kesilir", () => {
  const s = tazminatHesapla(g({ ekOdemeler: 2000 }));
  assert.equal(s.ihbar.gun, 56);
  assert.equal(s.ihbar.brut, Math.round((42000 / 30) * 56 * 100) / 100);
  assert.ok(s.ihbar.gelirVergisi > 0);
});
