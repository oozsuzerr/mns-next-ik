"use client";

import { useState, type CSSProperties } from "react";
import type { BugunHareket, Personel } from "../../lib/tipler";
import { yerelSaat } from "../../lib/tarih";
import { Avatar, Iskelet, Rozet } from "../ui";

export interface BugunOzet {
  toplam: number;
  iceride: Personel[];
  cikti: Personel[];
  izinli: Personel[];
  gelmedi: Personel[];
  gec: Personel[];
  tatil: boolean;
}

type Durum = "iceride" | "cikti" | "izinli" | "gelmedi";

const GOSTERILEN = 18;

export default function BugunSerit({
  ozet,
  yukleniyor,
  hareketler,
  onGelmeyenler,
}: {
  ozet: BugunOzet;
  yukleniyor: boolean;
  /** Bugünkü hareketler (eskiden yeniye) */
  hareketler: BugunHareket[];
  onGelmeyenler: () => void;
}) {
  const [secili, setSecili] = useState<Durum | null>(null);

  const parcalar: { anahtar: Durum; etiket: string; aciklama: string; liste: Personel[]; sinif: string; renk: string }[] = [
    { anahtar: "iceride", etiket: "İçeride", aciklama: "Şu an iş yerinde", liste: ozet.iceride, sinif: "dilim-iceride", renk: "var(--giris)" },
    { anahtar: "cikti", etiket: "Çıkış yaptı", aciklama: "Bugünkü mesaisini bitirdi", liste: ozet.cikti, sinif: "dilim-cikti", renk: "var(--serit-cikti)" },
    { anahtar: "izinli", etiket: "İzinli", aciklama: "Onaylı izin veya raporda", liste: ozet.izinli, sinif: "dilim-izinli", renk: "var(--izin)" },
    { anahtar: "gelmedi", etiket: "Henüz gelmedi", aciklama: "Vardiyası var, giriş yok", liste: ozet.gelmedi, sinif: "dilim-gelmedi", renk: "var(--uyari)" },
  ];

  // Seçim yoksa en çok ilgi isteyen grup açılır: önce gelmeyenler, sonra içeridekiler
  const aktif =
    secili ?? (ozet.gelmedi.length > 0 ? "gelmedi" : (parcalar.find((p) => p.liste.length > 0)?.anahtar ?? "iceride"));
  const aktifParca = parcalar.find((p) => p.anahtar === aktif)!;

  // Kişinin bugünkü ilk girişi ve son çıkışı
  const saatler = new Map<string, { giris?: string; cikis?: string }>();
  for (const h of hareketler) {
    const s = saatler.get(h.personel_id) ?? {};
    if (h.islem_turu === "İşe Giriş") s.giris ??= h.created_at;
    else s.cikis = h.created_at;
    saatler.set(h.personel_id, s);
  }
  const gecler = new Set(ozet.gec.map((p) => p.id));

  const gelen = ozet.iceride.length + ozet.cikti.length;
  const beklenen = gelen + ozet.gelmedi.length;
  const oran = beklenen > 0 ? Math.round((gelen / beklenen) * 100) : 0;

  function detay(p: Personel): string {
    const s = saatler.get(p.id);
    if (aktif === "iceride") return s?.giris ? `${yerelSaat(s.giris)} girişli` : "İçeride";
    if (aktif === "cikti") return s?.giris && s.cikis ? `${yerelSaat(s.giris)} - ${yerelSaat(s.cikis)}` : "Çıktı";
    if (aktif === "izinli") return "İzinli";
    return p.subeler?.ad ?? "Giriş yok";
  }

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="baslik-font m1 text-2xl">Bugün kim nerede?</h2>
          {yukleniyor && ozet.toplam === 0 ? (
            <Iskelet genislik={180} />
          ) : ozet.tatil ? (
            <p className="m2 text-sm">Bugün tatil, giriş beklenmiyor.</p>
          ) : (
            <p className="m2 text-sm">
              Beklenen <strong className="m1">{beklenen}</strong> kişiden <strong className="m1">{gelen}</strong> kişi işe geldi
            </p>
          )}
        </div>
        {!ozet.tatil && beklenen > 0 && (
          <p className="baslik-font sayi text-3xl" style={{ color: oran >= 90 ? "var(--giris)" : oran >= 60 ? "var(--m1)" : "var(--uyari)" }}>
            %{oran}
          </p>
        )}
      </div>

      <div
        className="serit mt-4"
        role="img"
        aria-label={`İçeride ${ozet.iceride.length}, çıkış yaptı ${ozet.cikti.length}, izinli ${ozet.izinli.length}, henüz gelmedi ${ozet.gelmedi.length}`}
      >
        {parcalar
          .filter((p) => p.liste.length > 0)
          .map((p) => (
            <div key={p.anahtar} className={`dilim ${p.sinif}`} style={{ flexGrow: p.liste.length }} title={`${p.etiket}: ${p.liste.length}`} />
          ))}
        {parcalar.every((p) => p.liste.length === 0) && <div className="dilim dilim-bos" style={{ flexGrow: 1 }} />}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" role="tablist" aria-label="Bugünkü durum">
        {parcalar.map((p) => (
          <button
            key={p.anahtar}
            type="button"
            role="tab"
            aria-selected={aktif === p.anahtar}
            className="durum-kart"
            data-aktif={aktif === p.anahtar}
            style={{ "--renk": p.renk } as CSSProperties}
            onClick={() => setSecili(p.anahtar)}
          >
            <span className="m2 flex items-center gap-2 text-sm font-semibold">
              <span className="nokta" style={{ background: p.renk }} />
              {p.etiket}
            </span>
            <span className="baslik-font sayi m1 text-3xl leading-none">{p.liste.length}</span>
            <span className="m3 text-xs">{p.aciklama}</span>
          </button>
        ))}
      </div>

      <div className="kenar-ust mt-5 pt-4" role="tabpanel">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="m1 text-sm font-semibold">
            {aktifParca.etiket} ({aktifParca.liste.length})
          </p>
          {aktif === "gelmedi" && ozet.gelmedi.length > 0 && (
            <button type="button" className="btn btn-hayalet btn-kucuk" onClick={onGelmeyenler}>
              Tam listeyi aç
            </button>
          )}
        </div>
        {aktifParca.liste.length === 0 ? (
          <p className="m3 text-sm">Bu grupta kimse yok.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {aktifParca.liste.slice(0, GOSTERILEN).map((p) => (
              <li key={p.id} className="kisi-chip">
                <Avatar ad={p.ad} soyad={p.soyad} boyut={28} />
                <span className="min-w-0">
                  <span className="m1 block truncate text-sm font-semibold">
                    {p.ad} {p.soyad}
                  </span>
                  <span className="m3 sayi block text-xs">{detay(p)}</span>
                </span>
                {gecler.has(p.id) && <Rozet ton="uyari">Geç</Rozet>}
              </li>
            ))}
            {aktifParca.liste.length > GOSTERILEN && (
              <li className="m3 self-center text-sm">+{aktifParca.liste.length - GOSTERILEN} kişi</li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
