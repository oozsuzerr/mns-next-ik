import { test } from "node:test";
import assert from "node:assert/strict";
import { aralikPuantajHesapla, aylikPuantajHesapla } from "../src/lib/puantaj.ts";
import { cetvelSatiri, gunOzeti, onayliMesai } from "../src/lib/puantajCetveli.ts";

const v = { id: "v1", ad: "Gündüz", baslangic_saat: "08:00:00", bitis_saat: "16:30:00", mola_dakika: 60 };
const p = {
  id: "p1", sicil_no: "1", ad: "A", soyad: "B", departman: "X", varsayilan_sube_id: "s", aktif: true,
  created_at: "2026-01-01T09:00:00Z", ise_giris_tarihi: "2026-01-01", cikis_tarihi: null, vardiyalar: v,
};
const H: { id: string; personel_id: string; islem_turu: string; created_at: string }[] = [];
let n = 0;
const gun = (t: string, g: string, c: string) => {
  H.push({ id: `h${n++}`, personel_id: "p1", islem_turu: "İşe Giriş", created_at: new Date(`${t}T${g}:00+03:00`).toISOString() });
  H.push({ id: `h${n++}`, personel_id: "p1", islem_turu: "İşe Çıkış", created_at: new Date(`${t}T${c}:00+03:00`).toISOString() });
};
gun("2026-09-01", "08:00", "18:30"); // +2 saat
gun("2026-09-02", "08:30", "16:30"); // 30 dk geç
gun("2026-09-04", "08:00", "15:30"); // 60 dk erken (15:00-17:00 saatlik izin değil)
gun("2026-09-06", "09:00", "15:00"); // Pazar
const izinler = [{ personel_id: "p1", izin_turu: "Yıllık İzin", baslangic_tarihi: "2026-09-07", bitis_tarihi: "2026-09-07", aciklama: null, durum: "ONAYLANDI" }];
const ortak = { personeller: [p], hareketler: H, izinler, resmiTatiller: [{ tarih: "2026-09-10", ad: "Test" }], vardiyalar: [v], planlar: [], ayarlar: null, bugun: "2026-10-18", simdi: new Date("2026-10-18T12:00:00+03:00") };
const s = aylikPuantajHesapla({ ...ortak, yil: 2026, ay: 9 } as never)[0];

test("geç giriş ve erken çıkış günleri", () => {
  assert.equal(s.gecGirisGun, 1);
  assert.equal(s.erkenCikisGun, 1);
  assert.equal(s.erkenCikisDk, 60);
});

test("onaylı izin günü izinli sayılır", () => {
  assert.equal(s.gunlukDetaylar.find((g) => g.tarih === "2026-09-07")?.tip, "izin");
});

test("aralık puantajı tam ayla aynı (aylar arası birleştirme)", () => {
  const a = aralikPuantajHesapla({ ...ortak, bas: "2026-09-01", bit: "2026-09-30" } as never)[0];
  assert.equal(a.toplamCalismaDk, s.toplamCalismaDk);
  assert.equal(a.gunlukDetaylar.length, 30);
});

test("mesai yalnızca onaylı taleplerden, günün türüne göre", () => {
  const talepler = [
    { personel_id: "p1", tarih: "2026-09-01", sure_dk: 60, durum: "ONAYLANDI" },
    { personel_id: "p1", tarih: "2026-09-01", sure_dk: 60, durum: "BEKLEMEDE" },
    { personel_id: "p1", tarih: "2026-09-06", sure_dk: 300, durum: "ONAYLANDI" },
    { personel_id: "p1", tarih: "2026-09-10", sure_dk: 120, durum: "REDDEDILDI" },
  ];
  const o = onayliMesai(s, talepler);
  assert.deepEqual(o, { fazlaDk: 60, htDk: 300, rtDk: 0 });
  const c = cetvelSatiri(s, talepler);
  assert.equal(c.toplam.fazla, 1);
  assert.equal(c.toplam.ht, 5);
  assert.ok(c.toplam.onaysiz > 0);
  assert.equal(cetvelSatiri(s).toplam.fazla, 0);
});

test("gün özeti: tolerans eksik kesintisini sınırlar", () => {
  const oz = gunOzeti(s, 40);
  assert.ok(oz.eksikDk >= 90);
  assert.equal(oz.kesintiliEksikDk, 60);
  assert.equal(oz.rtGun, 1);
});
