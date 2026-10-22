import { test } from "node:test";
import assert from "node:assert/strict";
import { avansOzeti, saatlikIzinOzeti } from "../src/lib/mobilOzet.ts";

const izin = (tarih: string, bas: string, bit: string, durum = "ONAYLANDI", tur = "Saatlik İzin") => ({
  izin_turu: tur,
  baslangic_tarihi: tarih,
  baslangic_saat: bas,
  bitis_saat: bit,
  durum,
});

test("saatlik izin: ay, geçen ay ve pazartesi başlayan hafta toplamları", () => {
  // 2026-10-22 Perşembe; hafta 2026-10-19 Pazartesi başlar
  const ozet = saatlikIzinOzeti(
    [
      izin("2026-10-20", "09:00:00", "11:00:00"), // bu hafta ve bu ay: 120
      izin("2026-10-05", "14:00:00", "14:30:00"), // bu ay: 30
      izin("2026-09-30", "09:00:00", "10:00:00"), // geçen ay: 60
      izin("2026-08-31", "09:00:00", "10:00:00"), // daha eski: sayılmaz
      izin("2026-10-21", "09:00:00", "12:00:00", "BEKLEMEDE"), // onaysız: sayılmaz
      izin("2026-10-21", null as unknown as string, null as unknown as string, "ONAYLANDI", "Yıllık İzin"),
    ],
    "2026-10-22"
  );
  assert.deepEqual(ozet, { buAy: 150, gecenAy: 60, buHafta: 120 });
});

test("saatlik izin: ay başında hafta önceki aya taşar", () => {
  // 2026-10-01 Perşembe; hafta 2026-09-28 Pazartesi başlar
  const ozet = saatlikIzinOzeti([izin("2026-09-29", "09:00", "10:30")], "2026-10-01");
  assert.deepEqual(ozet, { buAy: 0, gecenAy: 90, buHafta: 90 });
});

test("avans: reddedilen ve masraflar sayılmaz, bekleyenler sayılır", () => {
  const ozet = avansOzeti(
    [
      { tur: "Avans", tutar: 1500, tarih: "2026-10-10", durum: "ODENDI" },
      { tur: "Avans", tutar: 500, tarih: "2026-10-21", durum: "BEKLEMEDE" },
      { tur: "Avans", tutar: 900, tarih: "2026-10-12", durum: "REDDEDILDI" },
      { tur: "Masraf", tutar: 300, tarih: "2026-10-11", durum: "ONAYLANDI" },
      { tur: "Avans", tutar: 1000, tarih: "2026-09-15", durum: "ODENDI" },
    ],
    "2026-10-22"
  );
  assert.deepEqual(ozet, { buAy: 2000, gecenAy: 1000, bekleyen: 1 });
});
