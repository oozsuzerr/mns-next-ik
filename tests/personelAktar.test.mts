import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { AKTARIM_SAYFASI, SUTUNLAR, dosyayiOku, sablonOlustur, satirlariDenetle, tarihCoz } from "../src/lib/personelAktar.ts";

const subeler = [{ id: "s1", ad: "Merkez Depo" }, { id: "s2", ad: "Şişli Mağaza" }];
const vardiyalar = [{ id: "v1", ad: "Sabah vardiyası" }];
const mevcut = [{ ad: "Mert", soyad: "Yıldız", sicil_no: "101", tc_kimlik: "10000000146" }];
const baglam = { subeler, vardiyalar, mevcut, bugun: "2026-10-22" };

/** Şablonu indirip doldurmuş gibi: başlık + verilen satırlar */
function dosya(satirlar: (string | number | null)[][]): ArrayBuffer {
  const kitap = XLSX.read(sablonOlustur(subeler, vardiyalar), { type: "array" });
  XLSX.utils.sheet_add_aoa(kitap.Sheets[AKTARIM_SAYFASI], satirlar, { origin: "A2" });
  return XLSX.write(kitap, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

test("şablon: başlıklar, açıklama ve firmanın şube/vardiya listesi", () => {
  const kitap = XLSX.read(sablonOlustur(subeler, vardiyalar), { type: "array" });
  assert.deepEqual(kitap.SheetNames, [AKTARIM_SAYFASI, "Açıklamalar", "Şubeler ve vardiyalar"]);
  const baslik = XLSX.utils.sheet_to_json<string[]>(kitap.Sheets[AKTARIM_SAYFASI], { header: 1 })[0];
  assert.equal(baslik.length, SUTUNLAR.length);
  assert.equal(baslik[0], "Ad *");
  const liste = XLSX.utils.sheet_to_json<string[]>(kitap.Sheets["Şubeler ve vardiyalar"], { header: 1 });
  assert.deepEqual(liste[2], ["Şişli Mağaza", ""]);
});

test("tarih: metin, ISO ve Excel seri numarası; geçersiz gün reddedilir", () => {
  assert.equal(tarihCoz("15.03.2021"), "2021-03-15");
  assert.equal(tarihCoz("5/7/1990"), "1990-07-05");
  assert.equal(tarihCoz("2021-03-15"), "2021-03-15");
  assert.equal(tarihCoz(44270), "2021-03-15");
  assert.equal(tarihCoz("31.02.2021"), null);
  assert.equal(tarihCoz("Mart 2021"), null);
});

test("geçerli satır: şube adı büyük/küçük harf ve Türkçe karakter farkıyla eşleşir, tek vardiya kendiliğinden atanır", () => {
  const okunan = dosyayiOku(dosya([["Ayşe", "Kara", 102, 10000000222, "", "", "şişli mağaza", "", "15.03.2021", "", "4821"]]));
  const [s] = satirlariDenetle(okunan, baglam);
  assert.deepEqual(s.hatalar, []);
  assert.equal(s.satirNo, 2);
  assert.equal(s.kayit.sicil_no, "102");
  assert.equal(s.kayit.tc_kimlik, "10000000222");
  assert.equal(s.kayit.departman, "Genel");
  assert.equal(s.kayit.varsayilan_sube_id, "s2");
  assert.equal(s.kayit.varsayilan_vardiya_id, "v1");
  assert.equal(s.kayit.ise_giris_tarihi, "2021-03-15");
  assert.equal(s.pin, "4821");
});

test("boş satırlar atlanır, satır numaraları Excel'deki gibi kalır", () => {
  const okunan = dosyayiOku(dosya([["Ayşe", "Kara", "102", "10000000222"], [], ["Can", "Demir", "103", "10000000308"]]));
  assert.deepEqual(okunan.map((o) => o.satirNo), [2, 4]);
});

test("hatalar: kayıtlı TC/sicil, dosyada tekrar, bilinmeyen şube, kısa PIN", () => {
  const okunan = dosyayiOku(
    dosya([
      ["Ali", "Veli", "101", "10000000222"],
      ["Can", "Demir", "103", "10000000146"],
      ["Ece", "Su", "104", "10000000308", "", "", "Ankara"],
      ["Efe", "Ak", "105", "10000000308", "", "", "", "", "", "", 123],
    ])
  );
  const s = satirlariDenetle(okunan, baglam);
  assert.match(s[0].hatalar.join(), /sicil no Mert Yıldız/);
  assert.match(s[1].hatalar.join(), /T\.C\. kimlik no Mert Yıldız/);
  assert.match(s[2].hatalar.join(), /"Ankara" adında şube yok/);
  assert.match(s[3].hatalar.join(), /dosyada 4\. satırda/);
  assert.match(s[3].hatalar.join(), /baştaki sıfırı/);
});

test("uyarılar aktarımı engellemez: geçersiz TC sağlaması, boş PIN ve şube", () => {
  const [s] = satirlariDenetle(dosyayiOku(dosya([["Ali", "Veli", "110", "12345678901"]])), baglam);
  assert.deepEqual(s.hatalar, []);
  assert.ok(s.uyarilar.some((u) => u.includes("geçerlilik")));
  assert.ok(s.uyarilar.some((u) => u.includes("PIN boş")));
  assert.ok(s.uyarilar.some((u) => u.includes("Şube boş")));
  assert.equal(s.pin, null);
});

test("başlıkları tanınmayan dosya açık bir hatayla reddedilir", () => {
  const kitap = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(kitap, XLSX.utils.aoa_to_sheet([["İsim", "Telefon"], ["Ali", "555"]]), "Sayfa1");
  const veri = XLSX.write(kitap, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  assert.throws(() => dosyayiOku(veri), /indirdiğiniz şablonu/);
});
