"use client";

import { useMemo, useState } from "react";
import type { MesaiTalebi, Personel } from "../../lib/tipler";
import { GUN_ADLARI, ayAdi, haftaGunu, kisaTarih, saatDakika, yerelSaat, yerelTarih } from "../../lib/tarih";
import { Avatar, Bos, Ikon, Rozet } from "../ui";

/** Paneldeki giriş/çıkış kayıtlarından ilgili günü göstermek için gereken alanlar */
interface HareketOzet {
  personel_id: string;
  islem_turu: string;
  created_at: string;
}

function saatAraligi(t: MesaiTalebi): string {
  const gece = t.bitis_saat.slice(0, 5) <= t.baslangic_saat.slice(0, 5);
  return `${t.baslangic_saat.slice(0, 5)}-${t.bitis_saat.slice(0, 5)}${gece ? " (ertesi gün)" : ""}`;
}

function gunEtiketi(tarih: string): string {
  return `${kisaTarih(tarih)} ${GUN_ADLARI[haftaGunu(tarih)]}`;
}

function TalepKarti({
  t,
  hareketler,
  onDurum,
}: {
  t: MesaiTalebi;
  hareketler: HareketOzet[];
  onDurum?: (id: string, durum: "ONAYLANDI" | "REDDEDILDI") => void;
}) {
  const ad = t.personeller?.ad ?? "?";
  const soyad = t.personeller?.soyad ?? "";
  // O günün kayıtlı giriş/çıkışı: müdür beyanı sistem kaydıyla karşılaştırabilsin
  const gunun = hareketler.filter((h) => h.personel_id === t.personel_id && yerelTarih(h.created_at) === t.tarih);
  const ilkGiris = gunun.find((h) => h.islem_turu === "İşe Giriş");
  const sonCikis = [...gunun].reverse().find((h) => h.islem_turu === "İşe Çıkış");

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar ad={ad} soyad={soyad} boyut={40} />
        <div className="min-w-0">
          <p className="m1 font-semibold">
            {ad} {soyad} <span className="m3 text-xs font-normal">{t.personeller?.sicil_no}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Rozet ton="cikis">{saatDakika(t.sure_dk)}</Rozet>
            <span className="m2 sayi text-sm">
              {gunEtiketi(t.tarih)}, {saatAraligi(t)}
            </span>
          </div>
          <p className="m2 mt-1.5 text-sm">{t.neden}</p>
          <p className="m3 mt-0.5 text-xs">
            {gunun.length === 0
              ? "O gün için kayıtlı giriş/çıkış yok (ya da bu ay görünümünde değil)."
              : `Kayıtlı: giriş ${ilkGiris ? yerelSaat(ilkGiris.created_at) : "-"}, çıkış ${sonCikis ? yerelSaat(sonCikis.created_at) : "-"}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:justify-end">
        {onDurum ? (
          <>
            <button type="button" className="btn btn-tehlike-hafif flex-1 sm:flex-none" onClick={() => onDurum(t.id, "REDDEDILDI")}>
              <Ikon ad="kapat" boyut={15} />
              Reddet
            </button>
            <button type="button" className="btn btn-giris flex-1 sm:flex-none" onClick={() => onDurum(t.id, "ONAYLANDI")}>
              <Ikon ad="tik" boyut={15} />
              Onayla
            </button>
          </>
        ) : (
          <Rozet ton="uyari">Onay bekliyor</Rozet>
        )}
      </div>
    </li>
  );
}

export default function MesaiSekmesi({
  talepler,
  personeller,
  hareketler,
  seciliAy,
  subeFiltre,
  onAyDegis,
  onDurum,
  brutHesap,
}: {
  talepler: MesaiTalebi[];
  personeller: Personel[];
  hareketler: HareketOzet[];
  seciliAy: string;
  subeFiltre: string;
  onAyDegis: (ay: string) => void;
  /** Verilmezse (mesai yetkisi yok) talepler salt okunur */
  onDurum?: (id: string, durum: "ONAYLANDI" | "REDDEDILDI") => void;
  /** Tahmini brüt mesai ücreti (genel yönetici, bordro modülü açık; ücret girilmemişse null) */
  brutHesap?: (personelId: string, dk: number) => number | null;
}) {
  const [kararFiltre, setKararFiltre] = useState<"TUMU" | "ONAYLANDI" | "REDDEDILDI">("TUMU");

  const subede = (t: MesaiTalebi) => subeFiltre === "TUMU" || t.personeller?.varsayilan_sube_id === subeFiltre;
  const bekleyen = talepler.filter((t) => t.durum === "BEKLEMEDE" && subede(t));

  // Seçili ayın kişi bazında özeti
  const ozet = useMemo(() => {
    const ayinkiler = talepler.filter(
      (t) =>
        t.tarih.startsWith(seciliAy) &&
        (subeFiltre === "TUMU" || t.personeller?.varsayilan_sube_id === subeFiltre) &&
        // Müdür onayı olmadan hiçbir mesai toplama ve ücrete girmez
        t.durum === "ONAYLANDI"
    );
    const kisiye = new Map<string, MesaiTalebi[]>();
    for (const t of ayinkiler) kisiye.set(t.personel_id, [...(kisiye.get(t.personel_id) ?? []), t]);
    return [...kisiye.entries()]
      .map(([id, liste]) => {
        const p = personeller.find((x) => x.id === id);
        return {
          id,
          ad: p ? `${p.ad} ${p.soyad}` : `${liste[0].personeller?.ad ?? ""} ${liste[0].personeller?.soyad ?? ""}`,
          sicil: p?.sicil_no ?? liste[0].personeller?.sicil_no ?? "",
          toplamDk: liste.reduce((a, t) => a + t.sure_dk, 0),
          gun: new Set(liste.map((t) => t.tarih)).size,
          liste: liste.sort((a, b) => a.tarih.localeCompare(b.tarih)),
        };
      })
      .sort((a, b) => b.toplamDk - a.toplamDk);
  }, [talepler, personeller, seciliAy, subeFiltre]);

  const genelToplam = ozet.reduce((a, k) => a + k.toplamDk, 0);
  const brutler = brutHesap ? ozet.map((k) => brutHesap(k.id, k.toplamDk)) : [];
  const brutToplam = brutler.reduce<number>((a, b) => a + (b ?? 0), 0);
  const tl = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Seçili ayda karar verilmiş (onaylanan ve reddedilen) bütün mesailer, en yeni tarih üstte
  const kararlilar = talepler
    .filter((t) => t.tarih.startsWith(seciliAy) && t.durum !== "BEKLEMEDE" && subede(t))
    .sort((a, b) => b.tarih.localeCompare(a.tarih) || b.baslangic_saat.localeCompare(a.baslangic_saat));
  const onaylananSayi = kararlilar.filter((t) => t.durum === "ONAYLANDI").length;
  const reddedilenSayi = kararlilar.length - onaylananSayi;
  const gorunenKararlar = kararFiltre === "TUMU" ? kararlilar : kararlilar.filter((t) => t.durum === kararFiltre);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="baslik-font m1 mb-3 flex items-center gap-2 text-lg">
          Onay bekleyen fazla mesailer
          {bekleyen.length > 0 && <Rozet ton="uyari">{bekleyen.length}</Rozet>}
        </h3>
        <div className="panel overflow-hidden">
          {bekleyen.length === 0 ? (
            <Bos ikon="tik" baslik="Bekleyen talep yok" metin="Personelin mobilden bildirdiği fazla mesailer burada onayınızı bekler." />
          ) : (
            <ul className="liste">
              {bekleyen.map((t) => (
                <TalepKarti key={t.id} t={t} hareketler={hareketler} onDurum={onDurum} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="baslik-font m1 w-full text-lg sm:w-auto sm:flex-1">Aylık fazla mesai</h3>
          <input
            type="month"
            className="girdi girdi-sik"
            style={{ width: "auto" }}
            value={seciliAy}
            onChange={(e) => e.target.value && onAyDegis(e.target.value)}
            aria-label="Dönem"
          />
          <span className="m3 text-xs">Yalnızca onaylanan mesailer</span>
        </div>
        <div className="ozet-seridi mb-3">
          <div>
            <p className="m2 text-xs font-semibold">{ayAdi(seciliAy)} toplamı (sa:dk)</p>
            <p className="baslik-font sayi m1 mt-0.5 text-xl">{saatDakika(genelToplam)}</p>
          </div>
          <div>
            <p className="m2 text-xs font-semibold">Mesai yapan kişi</p>
            <p className="baslik-font sayi m1 mt-0.5 text-xl">{ozet.length}</p>
          </div>
          {brutHesap && (
            <div>
              <p className="m2 text-xs font-semibold">Tahmini brüt mesai ücreti</p>
              <p className="baslik-font sayi m1 mt-0.5 text-xl">{tl(brutToplam)} TL</p>
            </div>
          )}
        </div>
        <div className="panel overflow-hidden">
          {ozet.length === 0 ? (
            <Bos ikon="puantaj" baslik="Bu ay fazla mesai yok" metin="Onaylanan fazla mesailer kişi ve tarih bazında burada listelenir." />
          ) : (
            <ul className="liste">
              {ozet.map((k) => (
                <li key={k.id}>
                  <details>
                    <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="m1 block truncate font-semibold">{k.ad}</span>
                        <span className="m3 block text-xs">
                          {k.sicil}, {k.gun} gün
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="baslik-font sayi m1 block text-lg">{saatDakika(k.toplamDk)}</span>
                        {brutHesap && (
                          <span className="m3 sayi block text-xs">
                            {brutler[ozet.indexOf(k)] == null ? "ücret girilmemiş" : `≈ ${tl(brutler[ozet.indexOf(k)]!)} TL brüt`}
                          </span>
                        )}
                      </span>
                    </summary>
                    <ul className="m2 space-y-1.5 px-4 pb-3 text-sm sm:px-5">
                      {k.liste.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-baseline gap-x-2">
                          <span className="sayi m1 font-semibold">{gunEtiketi(t.tarih)}</span>
                          <span className="sayi">{saatAraligi(t)}</span>
                          <span className="sayi m1">{saatDakika(t.sure_dk)}</span>
                          {t.durum === "BEKLEMEDE" && <Rozet ton="uyari">Bekliyor</Rozet>}
                          <span className="m3 w-full text-xs">{t.neden}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="baslik-font m1 w-full text-lg sm:w-auto sm:flex-1">Onaylanan ve reddedilen mesailer</h3>
          <div className="segment segment-3" style={{ width: "100%", maxWidth: 420 }} role="tablist" aria-label="Karar">
            <button type="button" role="tab" aria-selected={kararFiltre === "TUMU"} data-aktif={kararFiltre === "TUMU"} onClick={() => setKararFiltre("TUMU")}>
              Tümü ({kararlilar.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kararFiltre === "ONAYLANDI"}
              data-aktif={kararFiltre === "ONAYLANDI"}
              onClick={() => setKararFiltre("ONAYLANDI")}
            >
              Onaylanan ({onaylananSayi})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kararFiltre === "REDDEDILDI"}
              data-aktif={kararFiltre === "REDDEDILDI"}
              onClick={() => setKararFiltre("REDDEDILDI")}
            >
              Reddedilen ({reddedilenSayi})
            </button>
          </div>
        </div>
        <div className="panel overflow-hidden">
          {gorunenKararlar.length === 0 ? (
            <Bos ikon="talepler" baslik="Kayıt yok" metin={`${ayAdi(seciliAy)} için bu filtrede karar verilmiş fazla mesai yok.`} />
          ) : (
            <ul className="liste">
              {gorunenKararlar.map((t) => {
                const red = t.durum === "REDDEDILDI";
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                    <Avatar ad={t.personeller?.ad ?? "?"} soyad={t.personeller?.soyad ?? ""} boyut={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="m1 font-semibold">
                          {t.personeller?.ad} {t.personeller?.soyad}
                        </span>
                        <Rozet ton={red ? "hata" : "giris"}>{red ? "Reddedildi" : "Onaylandı"}</Rozet>
                      </div>
                      <p className="m2 sayi mt-0.5 text-sm">
                        {gunEtiketi(t.tarih)}, {saatAraligi(t)} · <span className="m1 font-semibold">{saatDakika(t.sure_dk)}</span>
                      </p>
                      <p className="m2 mt-1 text-sm">
                        <span className="m3">Neden: </span>
                        {t.neden}
                      </p>
                      {t.karar_notu ? (
                        <p className="mt-1 text-sm" style={{ color: red ? "var(--hata)" : "var(--m2)" }}>
                          <span className="font-semibold">{red ? "Red nedeni: " : "Amir notu: "}</span>
                          {t.karar_notu}
                        </p>
                      ) : (
                        red && <p className="m3 mt-1 text-xs">Red nedeni yazılmamış.</p>
                      )}
                      {t.karar_zamani && (
                        <p className="m3 mt-0.5 text-xs">
                          Karar: {kisaTarih(yerelTarih(t.karar_zamani))} {yerelSaat(t.karar_zamani)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
