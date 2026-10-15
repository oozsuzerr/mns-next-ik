"use client";

import type { Personel } from "../../lib/tipler";
import { uzunTarih } from "../../lib/tarih";
import { Avatar, Iskelet } from "../ui";

export interface BugunOzet {
  toplam: number;
  iceride: Personel[];
  cikti: Personel[];
  izinli: Personel[];
  gelmedi: Personel[];
  gec: Personel[];
  tatil: boolean;
}

export default function BugunSerit({
  ozet,
  yukleniyor,
  onGelmeyenler,
}: {
  ozet: BugunOzet;
  yukleniyor: boolean;
  onGelmeyenler: () => void;
}) {
  const parcalar = [
    { anahtar: "iceride", etiket: "İçeride", sayi: ozet.iceride.length, sinif: "dilim-iceride", renk: "var(--giris)" },
    { anahtar: "cikti", etiket: "Çıkış yaptı", sayi: ozet.cikti.length, sinif: "dilim-cikti", renk: "var(--serit-cikti)" },
    { anahtar: "izinli", etiket: "İzinli", sayi: ozet.izinli.length, sinif: "dilim-izinli", renk: "var(--izin)" },
    { anahtar: "gelmedi", etiket: "Henüz gelmedi", sayi: ozet.gelmedi.length, sinif: "dilim-gelmedi", renk: "var(--uyari)" },
  ];

  const gelen = ozet.iceride.length + ozet.cikti.length;
  const ozetMetni = ozet.tatil
    ? "Bugün tatil, giriş beklenmiyor"
    : `${gelen} / ${ozet.toplam} kişi geldi`;

  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div>
          <h2 className="baslik-font m1 text-2xl">Bugün</h2>
          <p className="m2 text-sm">{uzunTarih()}</p>
        </div>
        {yukleniyor && ozet.toplam === 0 ? <Iskelet genislik={140} /> : <p className="m2 sayi text-sm">{ozetMetni}</p>}
      </div>

      <div className="serit mt-5" role="img" aria-label={`İçeride ${ozet.iceride.length}, çıkış yaptı ${ozet.cikti.length}, izinli ${ozet.izinli.length}, henüz gelmedi ${ozet.gelmedi.length}`}>
        {parcalar
          .filter((p) => p.sayi > 0)
          .map((p) => (
            <div key={p.anahtar} className={`dilim ${p.sinif}`} style={{ flexGrow: p.sayi }} title={`${p.etiket}: ${p.sayi}`} />
          ))}
        {parcalar.every((p) => p.sayi === 0) && <div className="dilim dilim-bos" style={{ flexGrow: 1 }} />}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {parcalar.map((p) => (
          <div key={p.anahtar}>
            <dt className="m2 flex items-center gap-2 text-sm">
              <span className="nokta" style={{ background: p.renk }} />
              {p.etiket}
            </dt>
            <dd className="baslik-font sayi m1 mt-1 text-3xl">{p.sayi}</dd>
          </div>
        ))}
      </dl>

      {ozet.gec.length > 0 && (
        <p className="mt-4 text-sm font-medium" style={{ color: "var(--uyari)" }}>
          {ozet.gec.length} kişi vardiya başlangıcından sonra giriş yaptı.
        </p>
      )}

      {ozet.gelmedi.length > 0 && (
        <div className="kenar-ust mt-5 flex flex-wrap items-center gap-2 pt-4">
          <span className="m2 mr-1 text-sm">Henüz gelmedi:</span>
          {ozet.gelmedi.slice(0, 6).map((p) => (
            <span key={p.id} className="chip">
              <Avatar ad={p.ad} soyad={p.soyad} boyut={22} />
              {p.ad} {p.soyad[0]}.
            </span>
          ))}
          {ozet.gelmedi.length > 6 && <span className="m3 text-sm">+{ozet.gelmedi.length - 6} kişi</span>}
          <button type="button" className="btn btn-hayalet btn-kucuk ml-auto" onClick={onGelmeyenler}>
            Listeyi aç
          </button>
        </div>
      )}
    </section>
  );
}
