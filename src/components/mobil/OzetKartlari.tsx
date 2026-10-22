"use client";

import type { ReactNode } from "react";
import { saatDakika } from "../../lib/tarih";
import { gunYaz, type IzinBakiyesi } from "../../lib/tipler";
import { tl } from "../../lib/odeme";
import type { GunPlani, PlanVardiya } from "../../lib/vardiyaPlani";
import type { AvansOzeti, SaatlikIzinOzeti } from "../../lib/mobilOzet";
import { Ikon } from "../ui";

function saat(s: string): string {
  return s.slice(0, 5);
}

function KartBasligi({ baslik, onAc }: { baslik: string; onAc?: () => void }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="baslik-font m1 text-base">{baslik}</h2>
      {onAc && <Ikon ad="sag" boyut={16} className="m3" />}
    </div>
  );
}

/** Üç sütunlu küçük sayı satırı: "Geçen ay | Bu ay | Bu hafta" */
function Sutunlar({ ogeler }: { ogeler: { etiket: string; deger: string; vurgu?: boolean }[] }) {
  return (
    <div className="grid divide-x" style={{ gridTemplateColumns: `repeat(${ogeler.length}, minmax(0, 1fr))` }}>
      {ogeler.map((o) => (
        <div key={o.etiket} className="px-1 text-center" style={{ borderColor: "var(--cizgi)" }}>
          <p className="m3 text-xs">{o.etiket}</p>
          <p className={`baslik-font sayi mt-0.5 ${o.vurgu ? "m1 text-lg" : "m2 text-base"}`}>{o.deger}</p>
        </div>
      ))}
    </div>
  );
}

/** Dokunulabilir kart: tüm yüzey tek düğme gibi çalışır (başlık ve sayılar düğmenin içinde kalmaz) */
function Kart({ onAc, etiket, children }: { onAc?: () => void; etiket: string; children: ReactNode }) {
  return (
    <section className="panel relative p-4">
      {children}
      {onAc && <button type="button" className="absolute inset-0 rounded-[14px]" onClick={onAc} aria-label={etiket} />}
    </section>
  );
}

/** Bugünkü vardiya: başlangıç, bitiş ve mola; altında yarın */
export function VardiyaKarti({ bugun, yarin, onAc }: { bugun: GunPlani | null; yarin: GunPlani | null; onAc?: () => void }) {
  const v: PlanVardiya | undefined = bugun?.vardiyalar[0];
  const yarinV = yarin?.vardiyalar[0];
  return (
    <Kart onAc={onAc} etiket="Vardiya takvimini aç">
      <KartBasligi baslik={v ? `Bugün: ${v.ad}` : "Bugünkü vardiya"} onAc={onAc} />
      {!bugun ? (
        <p className="m2 text-sm">Size tanımlı bir vardiya yok.</p>
      ) : bugun.tatil ? (
        <p className="m1 font-semibold">Bugün hafta tatiliniz</p>
      ) : !v ? (
        <p className="m2 text-sm">Bugün vardiyanız yok.</p>
      ) : (
        <>
          <Sutunlar
            ogeler={[
              { etiket: "Başlangıç", deger: saat(v.baslangic_saat), vurgu: true },
              { etiket: "Mola", deger: v.mola_dakika ? `${v.mola_dakika} dk` : "-" },
              { etiket: "Bitiş", deger: saat(v.bitis_saat), vurgu: true },
            ]}
          />
          {bugun.vardiyalar.length > 1 && (
            <p className="m3 mt-2 text-xs">
              Ayrıca: {bugun.vardiyalar.slice(1).map((x) => `${x.ad} ${saat(x.baslangic_saat)}-${saat(x.bitis_saat)}`).join(", ")}
            </p>
          )}
        </>
      )}
      {yarin && (
        <p className="m3 kenar-ust mt-3 pt-2 text-xs">
          Yarın:{" "}
          <span className="m2 font-semibold">
            {yarin.tatil ? "hafta tatili" : yarinV ? `${yarinV.ad}, ${saat(yarinV.baslangic_saat)}-${saat(yarinV.bitis_saat)}` : "vardiya yok"}
          </span>
        </p>
      )}
    </Kart>
  );
}

/** Yıllık izin: kalan ve kullanılan gün */
export function YillikIzinKarti({ izin, onAc }: { izin: IzinBakiyesi; onAc?: () => void }) {
  const kullanilan = Number(izin.kullanilan ?? 0);
  const kalan = Number(izin.kalan ?? 0);
  const toplam = kullanilan + kalan;
  const oran = toplam > 0 ? Math.min(100, Math.round((kullanilan / toplam) * 100)) : 0;
  return (
    <Kart onAc={onAc} etiket="İzin talebi oluştur">
      <KartBasligi baslik="Yıllık izin" onAc={onAc} />
      <p className="m1">
        <span className="baslik-font sayi text-2xl">{gunYaz(kalan)}</span> <span className="m2 text-sm">gün izniniz kaldı</span>
      </p>
      <div className="ilerleme mt-2" role="progressbar" aria-valuenow={oran} aria-valuemin={0} aria-valuemax={100} aria-label="Kullanılan izin oranı">
        <span style={{ width: `${oran}%` }} />
      </div>
      <p className="m3 mt-1.5 text-xs">
        {gunYaz(kullanilan)} / {gunYaz(toplam)} gün kullanıldı
        {izin.bekleyen ? `, ${gunYaz(izin.bekleyen)} gün onay bekliyor` : ""}
      </p>
    </Kart>
  );
}

/** Onaylanmış saatlik izinler */
export function SaatlikIzinKarti({ ozet, onAc }: { ozet: SaatlikIzinOzeti; onAc?: () => void }) {
  return (
    <Kart onAc={onAc} etiket="Taleplerimi aç">
      <KartBasligi baslik="Saatlik izin kullanımı" onAc={onAc} />
      <Sutunlar
        ogeler={[
          { etiket: "Geçen ay", deger: saatDakika(ozet.gecenAy) },
          { etiket: "Bu ay", deger: saatDakika(ozet.buAy), vurgu: true },
          { etiket: "Bu hafta", deger: saatDakika(ozet.buHafta) },
        ]}
      />
      <p className="m3 mt-2 text-xs">Saat:dakika, onaylanan son talepleriniz</p>
    </Kart>
  );
}

/** Avans toplamları (reddedilenler hariç) */
export function AvansKarti({ ozet, onAc }: { ozet: AvansOzeti; onAc?: () => void }) {
  return (
    <Kart onAc={onAc} etiket="Avans ve masraflarımı aç">
      <KartBasligi baslik="Avans" onAc={onAc} />
      <Sutunlar
        ogeler={[
          { etiket: "Geçen ay", deger: tl(ozet.gecenAy) },
          { etiket: "Bu ay", deger: tl(ozet.buAy), vurgu: true },
        ]}
      />
      {ozet.bekleyen > 0 && <p className="m3 mt-2 text-xs">{ozet.bekleyen} avans talebiniz onay bekliyor</p>}
    </Kart>
  );
}
