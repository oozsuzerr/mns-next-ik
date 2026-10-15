"use client";

import type { Vardiya } from "../../lib/tipler";
import { sureYaz } from "../../lib/tarih";
import { Bos, Ikon, Rozet } from "../ui";

function dk(saat: string): number {
  const [s, d] = saat.slice(0, 5).split(":").map(Number);
  return s * 60 + d;
}

function SaatCubugu({ bas, bit }: { bas: string; bit: string }) {
  const b = dk(bas);
  const e = dk(bit);
  const parcalar: [number, number][] = e > b ? [[b, e]] : [[b, 1440], [0, e]];
  return (
    <div>
      <div className="saat-cubugu" aria-hidden="true">
        {parcalar.map(([x, y], i) => (
          <span key={i} className="saat-dolu" style={{ left: `${(x / 1440) * 100}%`, width: `${((y - x) / 1440) * 100}%` }} />
        ))}
      </div>
      <div className="m3 sayi mt-1.5 flex justify-between text-[11px]" aria-hidden="true">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

export default function VardiyaSekmesi({
  vardiyalar,
  onYeni,
  onDuzenle,
  onSil,
}: {
  vardiyalar: Vardiya[];
  /** Verilmezse (şube müdürü) tanımlar salt okunur gösterilir */
  onYeni?: () => void;
  onDuzenle?: (v: Vardiya) => void;
  onSil?: (v: Vardiya) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="m2 text-sm">Mola ve mesai saatleri puantaj hesabının temelidir.</p>
        {onYeni && (
          <button type="button" className="btn btn-ana btn-kucuk" onClick={onYeni}>
            <Ikon ad="arti" boyut={14} />
            Yeni vardiya
          </button>
        )}
      </div>

      {vardiyalar.length === 0 ? (
        <div className="panel">
          <Bos ikon="vardiya" baslik="Henüz vardiya tanımlanmadı" metin="Personelin çalışma saatlerini belirlemek için bir vardiya ekleyin.">
            {onYeni && (
              <button type="button" className="btn btn-ana" onClick={onYeni}>
                <Ikon ad="arti" boyut={16} />
                Yeni vardiya
              </button>
            )}
          </Bos>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {vardiyalar.map((v) => {
            const b = dk(v.baslangic_saat);
            const e = dk(v.bitis_saat);
            const brut = e > b ? e - b : 1440 - b + e;
            const net = Math.max(0, brut - (v.mola_dakika || 0));
            const gece = e <= b;
            return (
              <article key={v.id} className="panel flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="baslik-font m1 text-lg leading-tight">{v.ad}</h3>
                  {gece && <Rozet ton="izin">Gece</Rozet>}
                </div>
                <p className="baslik-font sayi m1 mt-3 text-3xl">
                  {v.baslangic_saat.slice(0, 5)} - {v.bitis_saat.slice(0, 5)}
                </p>
                <p className="m2 mt-1 text-sm">
                  Net {sureYaz(net)}, mola {v.mola_dakika} dk
                </p>
                <div className="mt-4">
                  <SaatCubugu bas={v.baslangic_saat} bit={v.bitis_saat} />
                </div>
                {onDuzenle && onSil && (
                  <div className="kenar-ust mt-4 flex gap-2 pt-4">
                    <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => onDuzenle(v)}>
                      <Ikon ad="kalem" boyut={14} />
                      Düzenle
                    </button>
                    <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => onSil(v)}>
                      <Ikon ad="cop" boyut={14} />
                      Sil
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
