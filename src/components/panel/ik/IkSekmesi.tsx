"use client";

import { useState } from "react";
import type { Personel, Sube, YoneticiBilgisi } from "../../../lib/tipler";
import DuyurularSekmesi from "./DuyurularSekmesi";
import ZimmetSekmesi from "./ZimmetSekmesi";
import OdemeSekmesi from "./OdemeSekmesi";
import KontrolListeleriSekmesi from "./KontrolListeleriSekmesi";
import EgitimSekmesi from "./EgitimSekmesi";
import PerformansSekmesi from "./PerformansSekmesi";

/** İK işlemleri: her modül kendi verisini kendisi yükler (ana sayfa büyümesin diye) */
const BOLUMLER = [
  { id: "duyurular", ad: "Duyurular" },
  { id: "zimmet", ad: "Zimmet" },
  { id: "odeme", ad: "Avans ve masraf" },
  { id: "kontrol", ad: "Giriş / çıkış" },
  { id: "egitim", ad: "Eğitim" },
  { id: "performans", ad: "Performans" },
] as const;

type Bolum = (typeof BOLUMLER)[number]["id"];

export default function IkSekmesi({
  personeller,
  subeler,
  yonetici,
}: {
  personeller: Personel[];
  subeler: Sube[];
  yonetici: YoneticiBilgisi;
}) {
  const [bolum, setBolum] = useState<Bolum>("duyurular");

  return (
    <div className="space-y-4">
      {BOLUMLER.length > 1 && (
        // Telefonda sığmazsa yana kayar
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div
            className="segment"
            style={{
              gridTemplateColumns: `repeat(${BOLUMLER.length}, minmax(120px, 1fr))`,
              maxWidth: 160 * BOLUMLER.length,
              minWidth: 120 * BOLUMLER.length,
            }}
            role="tablist"
            aria-label="İK bölümü"
          >
            {BOLUMLER.map((b) => (
              <button key={b.id} type="button" role="tab" aria-selected={bolum === b.id} data-aktif={bolum === b.id} onClick={() => setBolum(b.id)}>
                {b.ad}
              </button>
            ))}
          </div>
        </div>
      )}
      {bolum === "duyurular" && <DuyurularSekmesi personeller={personeller} subeler={subeler} yonetici={yonetici} />}
      {bolum === "zimmet" && <ZimmetSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "odeme" && <OdemeSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "kontrol" && <KontrolListeleriSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "egitim" && <EgitimSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "performans" && <PerformansSekmesi personeller={personeller} yonetici={yonetici} />}
    </div>
  );
}
