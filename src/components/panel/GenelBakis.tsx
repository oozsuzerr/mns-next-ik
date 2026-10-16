"use client";

import { useEffect, useState } from "react";
import type { BugunHareket, Personel } from "../../lib/tipler";
import { saatDakika, selamlama, uzunTarih, yerelSaat } from "../../lib/tarih";
import { Avatar, Bos, Ikon, Rozet } from "../ui";

/** Ekrandaki saat ve "x dk önce" yazıları için her 20 sn'de bir yenilenen an */
function useSimdi(): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    const z = setInterval(() => setSimdi(Date.now()), 20000);
    return () => clearInterval(z);
  }, []);
  return simdi;
}

function onceYaz(an: string | number, simdi: number): string {
  const dk = Math.floor((simdi - new Date(an).getTime()) / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk önce`;
  return `${Math.floor(dk / 60)} sa önce`;
}

// ---------------------------------------------------------------------
// Karşılama: selam, tarih, canlı saat ve son güncelleme
// ---------------------------------------------------------------------
export function Karsilama({
  veriZamani,
  yukleniyor,
  onYenile,
}: {
  veriZamani: number;
  yukleniyor: boolean;
  onYenile: () => void;
}) {
  const simdi = useSimdi();
  return (
    <section className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="baslik-font m1 text-xl">{selamlama(new Date(simdi))}</p>
        <p className="m2 text-sm">
          {uzunTarih(simdi)}, saat <span className="sayi m1 font-semibold">{yerelSaat(simdi)}</span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="m2 flex items-center gap-2 text-xs">
          <span className="canli-nokta" aria-hidden="true" />
          Canlı, {yukleniyor ? "güncelleniyor..." : `${onceYaz(veriZamani, simdi)} güncellendi`}
        </span>
        <button type="button" className="btn btn-hayalet btn-kucuk" onClick={onYenile} disabled={yukleniyor} aria-label="Verileri yenile">
          <Ikon ad="yenile" boyut={15} />
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// Yapılacaklar: yöneticinin bugün ilgilenmesi gerekenler, önem sırasıyla
// ---------------------------------------------------------------------
export interface YapilacakMadde {
  sayi: number;
  metin: string;
  etiket: string;
  ton?: "hata" | "uyari";
  eylem: () => void;
}

export function Yapilacaklar({ maddeler }: { maddeler: YapilacakMadde[] }) {
  const gorunen = maddeler.filter((m) => m.sayi > 0);
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <h3 className="baslik-font m1 text-lg">Yapılacaklar</h3>
        {gorunen.length > 0 && <Rozet ton="cikis">{gorunen.length} konu</Rozet>}
      </div>
      {gorunen.length === 0 ? (
        <Bos ikon="tik" baslik="Her şey yolunda" metin="Onay bekleyen talep, eksik kayıt ya da PIN'siz personel yok." />
      ) : (
        <ul className="liste">
          {gorunen.map((m) => (
            <li key={m.metin}>
              <button type="button" className="yapilacak" data-ton={m.ton} onClick={m.eylem}>
                <span className="yapilacak-sayi baslik-font sayi">{m.sayi}</span>
                <span className="m1 min-w-0 flex-1 text-sm font-medium">{m.metin}</span>
                <span className="m2 flex flex-none items-center gap-1 text-xs font-semibold">
                  {m.etiket}
                  <Ikon ad="sag" boyut={14} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Son hareketler: bugünkü giriş/çıkışların canlı akışı
// ---------------------------------------------------------------------
const AKIS_SAYISI = 8;

export function SonHareketler({
  hareketler,
  personeller,
  onTumu,
}: {
  /** Bugünkü hareketler (eskiden yeniye) */
  hareketler: BugunHareket[];
  personeller: Personel[];
  onTumu: () => void;
}) {
  const simdi = useSimdi();
  const kisiler = new Map(personeller.map((p) => [p.id, p]));
  const son = hareketler.slice(-AKIS_SAYISI).reverse();

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <h3 className="baslik-font m1 text-lg">Son hareketler</h3>
        <button type="button" className="btn btn-hayalet btn-kucuk" onClick={onTumu}>
          Tümü
        </button>
      </div>
      {son.length === 0 ? (
        <Bos ikon="hareket" baslik="Bugün henüz hareket yok" metin="Personel giriş ya da çıkış yaptıkça burada anında görünür." />
      ) : (
        <ul className="liste">
          {son.map((h) => {
            const p = kisiler.get(h.personel_id);
            const giris = h.islem_turu === "İşe Giriş";
            return (
              <li key={h.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar ad={p?.ad ?? "?"} soyad={p?.soyad ?? ""} boyut={32} />
                <span className="min-w-0 flex-1">
                  <span className="m1 block truncate text-sm font-semibold">{p ? `${p.ad} ${p.soyad}` : "Personel"}</span>
                  <span className="m3 block text-xs">{onceYaz(h.created_at, simdi)}</span>
                </span>
                <Rozet ton={giris ? "giris" : "cikis"}>{giris ? "Giriş" : "Çıkış"}</Rozet>
                <span className="sayi m1 w-12 text-right text-sm font-semibold">{yerelSaat(h.created_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Ay özeti: seçili dönemin puantaj ve fazla mesai toplamları
// ---------------------------------------------------------------------
export function AyOzeti({
  donem,
  netDk,
  mesaiDk,
  devamsiz,
  eksik,
  onPuantaj,
  onMesai,
}: {
  donem: string;
  netDk: number;
  mesaiDk: number;
  devamsiz: number;
  eksik: number;
  onPuantaj: () => void;
  onMesai: () => void;
}) {
  const kutular: { etiket: string; deger: string; alt: string; renk?: string; eylem: () => void }[] = [
    { etiket: "Toplam net çalışma", deger: saatDakika(netDk), alt: "saat:dakika", eylem: onPuantaj },
    { etiket: "Onaylı fazla mesai", deger: saatDakika(mesaiDk), alt: "saat:dakika", eylem: onMesai },
    { etiket: "Devamsız gün", deger: String(devamsiz), alt: "tüm personel", renk: devamsiz > 0 ? "var(--hata)" : undefined, eylem: onPuantaj },
    { etiket: "Eksik kayıtlı gün", deger: String(eksik), alt: "giriş veya çıkış eksik", renk: eksik > 0 ? "var(--uyari)" : undefined, eylem: onPuantaj },
  ];
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="baslik-font m1 text-lg">{donem} özeti</h3>
        <button type="button" className="btn btn-hayalet btn-kucuk" onClick={onPuantaj}>
          Puantaja git
          <Ikon ad="sag" boyut={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kutular.map((k) => (
          <button key={k.etiket} type="button" className="ozet-kutu" onClick={k.eylem}>
            <span className="m2 text-xs font-semibold">{k.etiket}</span>
            <span className="baslik-font sayi text-2xl" style={{ color: k.renk ?? "var(--m1)" }}>
              {k.deger}
            </span>
            <span className="m3 text-xs">{k.alt}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
