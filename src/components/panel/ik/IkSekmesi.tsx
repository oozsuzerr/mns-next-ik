"use client";

import { useState } from "react";
import type { MesaiTalebi, Personel, Sube, YoneticiBilgisi } from "../../../lib/tipler";
import DuyurularSekmesi from "./DuyurularSekmesi";
import ZimmetSekmesi from "./ZimmetSekmesi";
import OdemeSekmesi from "./OdemeSekmesi";
import KontrolListeleriSekmesi from "./KontrolListeleriSekmesi";
import EgitimSekmesi from "./EgitimSekmesi";
import PerformansSekmesi from "./PerformansSekmesi";
import IseAlimSekmesi from "./IseAlimSekmesi";
import GorevlerSekmesi from "./GorevlerSekmesi";
import BordroSekmesi from "./BordroSekmesi";
import type { PuantajSatiri } from "../../../lib/puantaj";
import { modulAcik, type Modul } from "../../../lib/moduller";

/** İK işlemleri: her modül kendi verisini kendisi yükler (ana sayfa büyümesin diye) */
const BOLUMLER: readonly { id: string; ad: string; modul: Modul; sadeceGenel?: boolean }[] = [
  { id: "gorevler", ad: "Görevler", modul: "gorev" },
  { id: "duyurular", ad: "Duyurular", modul: "duyuru" },
  { id: "zimmet", ad: "Zimmet", modul: "zimmet" },
  { id: "odeme", ad: "Avans ve masraf", modul: "odeme" },
  { id: "kontrol", ad: "Giriş / çıkış", modul: "kontrol" },
  { id: "egitim", ad: "Eğitim", modul: "egitim" },
  { id: "performans", ad: "Performans", modul: "performans" },
  { id: "isealim", ad: "İşe alım", modul: "isealim" },
  // Ücretler Özlük'ten okunur: yalnızca genel yönetici
  { id: "bordro", ad: "Tahmini bordro", modul: "bordro", sadeceGenel: true },
] as const;

/** Yöneticinin görebildiği İK bölümleri (firma paketi ve rol) */
export function ikBolumleri(yonetici: YoneticiBilgisi) {
  return BOLUMLER.filter((b) => modulAcik(yonetici.moduller, b.modul) && (!b.sadeceGenel || yonetici.rol === "GENEL"));
}


export default function IkSekmesi({
  personeller,
  subeler,
  yonetici,
  puantaj,
  mesaiTalepleri,
  seciliAy,
  onAyDegis,
  bolum: disBolum,
}: {
  personeller: Personel[];
  subeler: Sube[];
  yonetici: YoneticiBilgisi;
  /** Tahmini bordro için seçili ayın puantajı ve fazla mesai talepleri */
  puantaj: PuantajSatiri[];
  mesaiTalepleri: MesaiTalebi[];
  seciliAy: string;
  onAyDegis: (ay: string) => void;
  /** Verilirse bölüm yan menüden seçilir ve üstteki bölüm çubuğu gizlenir */
  bolum?: string | null;
}) {
  // Yalnızca firmanın paketinde açık modüller
  const acik = ikBolumleri(yonetici);
  const [secilen, setBolum] = useState<string | null>(null);
  const bolum = acik.find((b) => b.id === (disBolum !== undefined ? disBolum : secilen))?.id ?? acik[0]?.id ?? null;

  return (
    <div className="space-y-4">
      {disBolum === undefined && acik.length > 1 && (
        // Telefonda sığmazsa yana kayar
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div
            className="segment"
            style={{
              gridTemplateColumns: `repeat(${acik.length}, minmax(120px, 1fr))`,
              maxWidth: 160 * acik.length,
              minWidth: 120 * acik.length,
            }}
            role="tablist"
            aria-label="İK bölümü"
          >
            {acik.map((b) => (
              <button key={b.id} type="button" role="tab" aria-selected={bolum === b.id} data-aktif={bolum === b.id} onClick={() => setBolum(b.id)}>
                {b.ad}
              </button>
            ))}
          </div>
        </div>
      )}
      {bolum === "gorevler" && <GorevlerSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "duyurular" && <DuyurularSekmesi personeller={personeller} subeler={subeler} yonetici={yonetici} />}
      {bolum === "zimmet" && <ZimmetSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "odeme" && <OdemeSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "kontrol" && <KontrolListeleriSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "egitim" && <EgitimSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "performans" && <PerformansSekmesi personeller={personeller} yonetici={yonetici} />}
      {bolum === "bordro" && (
        <BordroSekmesi puantaj={puantaj} mesaiTalepleri={mesaiTalepleri} seciliAy={seciliAy} onAyDegis={onAyDegis} yonetici={yonetici} />
      )}
      {bolum === "isealim" && <IseAlimSekmesi personeller={personeller} subeler={subeler} yonetici={yonetici} />}
    </div>
  );
}
