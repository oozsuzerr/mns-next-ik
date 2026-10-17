"use client";

import { useState } from "react";
import type { Personel, Sube, YoneticiBilgisi } from "../../../lib/tipler";
import DuyurularSekmesi from "./DuyurularSekmesi";

/** İK işlemleri: her modül kendi verisini kendisi yükler (ana sayfa büyümesin diye) */
const BOLUMLER = [{ id: "duyurular", ad: "Duyurular" }] as const;

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
        <div
          className="segment"
          style={{ gridTemplateColumns: `repeat(${BOLUMLER.length}, minmax(0, 1fr))`, maxWidth: 150 * BOLUMLER.length }}
          role="tablist"
          aria-label="İK bölümü"
        >
          {BOLUMLER.map((b) => (
            <button key={b.id} type="button" role="tab" aria-selected={bolum === b.id} data-aktif={bolum === b.id} onClick={() => setBolum(b.id)}>
              {b.ad}
            </button>
          ))}
        </div>
      )}
      {bolum === "duyurular" && <DuyurularSekmesi personeller={personeller} subeler={subeler} yonetici={yonetici} />}
    </div>
  );
}
