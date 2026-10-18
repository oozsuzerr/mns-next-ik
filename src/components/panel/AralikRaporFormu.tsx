"use client";

// Sekmelerdeki "Rapor indir" menüsünden: bu sekmenin raporunu serbest tarih aralığı için indirir
import { useState } from "react";
import type { Bicim } from "../../lib/disaAktar";
import { yerelTarih } from "../../lib/tarih";
import { Ikon, Modal } from "../ui";

const BICIMLER: { b: Bicim; ad: string }[] = [
  { b: "xlsx", ad: "Excel" },
  { b: "pdf", ad: "PDF" },
  { b: "csv", ad: "CSV" },
];

export default function AralikRaporFormu({
  baslik,
  onIndir,
  onKapat,
}: {
  baslik: string;
  onIndir: (bas: string, bit: string, bicim: Bicim) => Promise<void>;
  onKapat: () => void;
}) {
  const bugun = yerelTarih();
  const [bas, setBas] = useState(`${bugun.slice(0, 7)}-01`);
  const [bit, setBit] = useState(bugun);
  const [calisan, setCalisan] = useState<Bicim | null>(null);
  const gecerli = !!bas && !!bit && bas <= bit;

  return (
    <Modal onKapat={onKapat} baslik={`${baslik} · tarih aralığı`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiket" htmlFor="aBas">
              Başlangıç
            </label>
            <input id="aBas" className="girdi sayi" type="date" value={bas} max={bit || undefined} onChange={(e) => setBas(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="aBit">
              Bitiş
            </label>
            <input id="aBit" className="girdi sayi" type="date" value={bit} min={bas || undefined} onChange={(e) => setBit(e.target.value)} />
          </div>
        </div>
        {!gecerli && <p className="text-sm" style={{ color: "var(--hata)" }}>Başlangıç tarihi bitişten sonra olamaz.</p>}
        <p className="m3 text-xs">Aylar arası aralık seçilebilir. Üstteki şube seçimi uygulanır.</p>
        <div className="flex flex-wrap justify-end gap-2">
          {BICIMLER.map(({ b, ad }) => (
            <button
              key={b}
              type="button"
              className={`btn ${b === "xlsx" ? "btn-ana" : "btn-ikincil"}`}
              disabled={!gecerli || !!calisan}
              onClick={async () => {
                setCalisan(b);
                try {
                  await onIndir(bas, bit, b);
                } finally {
                  setCalisan(null);
                }
              }}
            >
              <Ikon ad="indir" boyut={16} />
              {calisan === b ? "Hazırlanıyor..." : ad}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
