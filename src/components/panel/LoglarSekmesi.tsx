"use client";

import { useMemo, useState } from "react";
import type { Hareket } from "../../lib/tipler";
import { uzunTarih, yerelSaat, yerelTarih } from "../../lib/tarih";
import { Avatar, Bos, Ikon, Iskelet, Rozet } from "../ui";

const EN_FAZLA = 300;

export default function LoglarSekmesi({
  hareketler,
  seciliAy,
  onAyDegis,
  onYenile,
  yukleniyor,
}: {
  hareketler: Hareket[]; // en yeni üstte
  seciliAy: string;
  onAyDegis: (ay: string) => void;
  onYenile: () => void;
  yukleniyor: boolean;
}) {
  const [ara, setAra] = useState("");

  const gorunen = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase("tr-TR");
    if (!q) return hareketler;
    return hareketler.filter((h) =>
      `${h.personeller?.ad ?? ""} ${h.personeller?.soyad ?? ""} ${h.personeller?.sicil_no ?? ""}`
        .toLocaleLowerCase("tr-TR")
        .includes(q)
    );
  }, [hareketler, ara]);

  const gruplar = useMemo(() => {
    const harita = new Map<string, Hareket[]>();
    for (const h of gorunen.slice(0, EN_FAZLA)) {
      const gun = yerelTarih(h.created_at);
      const liste = harita.get(gun);
      if (liste) liste.push(h);
      else harita.set(gun, [h]);
    }
    return Array.from(harita.entries());
  }, [gorunen]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="arama-kutu min-w-[200px] flex-1 sm:max-w-xs">
          <Ikon ad="ara" boyut={16} />
          <input
            className="girdi girdi-sik"
            placeholder="İsim veya sicil ara"
            value={ara}
            onChange={(e) => setAra(e.target.value)}
            aria-label="Hareket ara"
          />
        </div>
        <input
          type="month"
          className="girdi girdi-sik"
          style={{ width: "auto" }}
          value={seciliAy}
          onChange={(e) => e.target.value && onAyDegis(e.target.value)}
          aria-label="Dönem"
        />
        <button type="button" className="btn btn-hayalet btn-kucuk btn-ikon" onClick={onYenile} aria-label="Yenile">
          <Ikon ad="yenile" className={yukleniyor ? "donen" : ""} boyut={16} />
        </button>
        <p className="m3 ml-auto text-xs sayi">
          {gorunen.length} kayıt{gorunen.length > EN_FAZLA && `, en yeni ${EN_FAZLA} gösteriliyor (rapor indirmede tümü yer alır)`}
        </p>
      </div>

      {yukleniyor && hareketler.length === 0 ? (
        <div className="panel space-y-3 p-5">
          <Iskelet yukseklik={20} />
          <Iskelet yukseklik={20} />
          <Iskelet yukseklik={20} />
        </div>
      ) : gruplar.length === 0 ? (
        <div className="panel">
          <Bos ikon="hareket" baslik="Bu dönem için hareket yok" metin="Personel mobilden giriş ya da çıkış yaptığında kayıtlar burada görünür." />
        </div>
      ) : (
        gruplar.map(([gun, liste]) => (
          <section key={gun}>
            <h3 className="m2 mb-2 px-1 text-sm font-semibold">{uzunTarih(`${gun}T12:00:00+03:00`)}</h3>
            <ul className="panel liste overflow-hidden">
              {liste.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="baslik-font sayi m1 w-14 flex-none text-base">{yerelSaat(h.created_at)}</span>
                  <Avatar ad={h.personeller?.ad ?? "?"} soyad={h.personeller?.soyad ?? ""} boyut={32} />
                  <div className="min-w-0 flex-1">
                    <p className="m1 truncate font-semibold">
                      {h.personeller?.ad} {h.personeller?.soyad}
                    </p>
                    <p className="m3 truncate text-xs">
                      {h.subeler?.ad || "Şube"}
                      {h.manuel ? `, ${h.yonetici_notu || "İK düzeltmesi"}` : `, ${h.mesafe_metre} m`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Rozet ton={h.islem_turu === "İşe Giriş" ? "giris" : "cikis"}>{h.islem_turu}</Rozet>
                    {h.manuel && <Rozet ton="izin">İK düzeltmesi</Rozet>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
