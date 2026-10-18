import { test } from "node:test";
import assert from "node:assert/strict";
import { brutten, tahminiBordro, temelUcret, VARSAYILAN_BORDRO_AYARLARI as A, VARSAYILAN_YASAL as Y, bordroAyarlariniTamamla } from "../src/lib/bordro.ts";

const s0 = { fazla_mesai: 0, fazla_calisma: 0, hafta_tatili: 0, resmi_tatil: 0, plan_disi: 0 };
const girdi = (x: object = {}) =>
  ({ ucret: 33030, ucretTuru: "Aylık brüt", primGun: 30, calismaSaati: 0, eksikSaat: 0, tatilGun: 0, mesaiSaatleri: s0, ekVergili: 0, ekVergisiz: 0, avans: 0, masraf: 0, ay: 10, ...x }) as never;

test("2026 asgari ücret: brüt 33.030 → net 28.075,50 (her ay)", () => {
  for (const ay of [1, 6, 12]) {
    const r = brutten(33030, 30, ay, Y);
    assert.equal(r.net, 28075.5);
    assert.equal(r.gelirVergisi, 0);
    assert.equal(r.damgaVergisi, 0);
  }
});

test("asgari ücret işveren maliyeti 40.874,63 (teşviksiz)", () => {
  assert.equal(brutten(33030, 30, 10, Y).isverenMaliyeti, 40874.63);
});

test("SGK tavanı asgari ücretin 9 katı", () => {
  assert.equal(brutten(400000, 30, 1, Y).sgkMatrahi, 297270);
});

test("prim günü oranlaması: 14 gün → 15.414 brüt, 13.101,90 net", () => {
  const b = tahminiBordro(girdi({ primGun: 14 }), A);
  assert.equal(b.brut, 15414);
  assert.equal(b.net, 13101.9);
});

test("netten brüte: 28.075,50 net → 33.030 brüt", () => {
  const b = tahminiBordro(girdi({ ucret: 28075.5, ucretTuru: "Aylık net" }), A);
  assert.ok(Math.abs(b.brut - 33030) < 0.02);
});

test("haftalık ücret aylığa çevrilir", () => {
  assert.ok(Math.abs(temelUcret(7707, "Haftalık brüt", 1, Y).aylikBrut - 33030) < 0.01);
});

test("eksik saat kesintisi yalnızca kural açıkken ve saatlik ücretli dışında", () => {
  assert.equal(tahminiBordro(girdi({ eksikSaat: 5 }), A).eksikKesinti, 0);
  const K = { ...A, kurallar: { ...A.kurallar, eksikSaatKesintisi: true } };
  assert.ok(Math.abs(tahminiBordro(girdi({ eksikSaat: 5 }), K).eksikKesinti - (5 * 33030) / 225) < 0.01);
  assert.equal(tahminiBordro(girdi({ ucret: 200, ucretTuru: "Saatlik brüt", calismaSaati: 100, eksikSaat: 5 }), K).eksikKesinti, 0);
});

test("ek kazanç: vergili brüte, vergisiz ödenecek tutara", () => {
  const b = tahminiBordro(girdi({ ekVergili: 2000, ekVergisiz: 500 }), A);
  assert.equal(b.brut, 35030);
  assert.ok(Math.abs(b.odenecek - (b.net + 500)) < 0.01);
});

test("avans ödenecekten düşer", () => {
  const b = tahminiBordro(girdi({ avans: 5000 }), A);
  assert.ok(Math.abs(b.odenecek - (b.net - 5000)) < 0.01);
});

test("varsayılan mesai kalemlerinde onaysız kaynak yok", () => {
  assert.ok(A.mesaiKalemleri.every((k) => k.kaynak !== "plan_disi" && k.kaynak !== "fazla_calisma"));
});

test("kayıtlı kurallar varsayılanlarla tamamlanır", () => {
  const a = bordroAyarlariniTamamla({ yasal: { kurallar: { eksikSaatKesintisi: true } } as never, mesai_kalemleri: null });
  assert.equal(a.kurallar.eksikSaatKesintisi, true);
  assert.equal(a.kurallar.saatliktenTatilUcreti, true);
  assert.equal(a.kurallar.personelMaasOzeti, false);
});
