"use client";

import { useMemo, useState } from "react";
import type { IzinBakiyesi, Personel } from "../../lib/tipler";
import { gunYaz, tcMaske } from "../../lib/tipler";
import { kisaTarih } from "../../lib/tarih";
import { Avatar, Bos, Ikon, Rozet } from "../ui";

function Islemler({
  p,
  onIzin,
  onPin,
  onCihaz,
  onAktif,
}: {
  p: Personel;
  onIzin: (p: Personel) => void;
  onPin?: (p: Personel) => void;
  onCihaz?: (p: Personel) => void;
  onAktif?: (p: Personel) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => onIzin(p)}>
        <Ikon ad="takvim" boyut={14} />
        İzin
      </button>
      {onPin && (
        <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => onPin(p)}>
          <Ikon ad="anahtar" boyut={14} />
          PIN
        </button>
      )}
      {p.cihaz_id && onCihaz && (
        <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => onCihaz(p)}>
          <Ikon ad="kilitac" boyut={14} />
          Kilidi aç
        </button>
      )}
      {onAktif && (
        <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => onAktif(p)}>
          <Ikon ad="guc" boyut={14} />
          {p.aktif ? "Pasife al" : "Aktif et"}
        </button>
      )}
    </div>
  );
}

function Durumlar({ p, bakiye }: { p: Personel; bakiye?: IzinBakiyesi }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {p.pin_tanimli ? <Rozet ton="giris">PIN tanımlı</Rozet> : <Rozet ton="hata">PIN yok</Rozet>}
      {bakiye?.tanimli ? (
        <Rozet ton={(bakiye.kalan ?? 0) < 0 ? "hata" : "izin"}>İzin {gunYaz(bakiye.kalan)} gün</Rozet>
      ) : (
        <Rozet ton="notr">İşe giriş yok</Rozet>
      )}
      {p.cihaz_id ? <Rozet ton="notr">Cihaz eşleşti</Rozet> : <Rozet ton="uyari">Cihaz boşta</Rozet>}
      {!p.aktif && <Rozet ton="notr">{p.cikis_tarihi ? `Ayrıldı: ${kisaTarih(p.cikis_tarihi)}` : "Pasif"}</Rozet>}
    </div>
  );
}

export default function PersonelSekmesi({
  personeller,
  bakiyeler,
  onIzinBilgileri,
  onYeni,
  onPin,
  onCihaz,
  onAktif,
}: {
  personeller: Personel[];
  /** personel id -> yıllık izin bakiyesi */
  bakiyeler: Record<string, IzinBakiyesi>;
  onIzinBilgileri: (p: Personel) => void;
  /** Verilmezse (şube müdürü) ilgili düğmeler gizlenir */
  onYeni?: () => void;
  onPin?: (p: Personel) => void;
  onCihaz?: (p: Personel) => void;
  onAktif?: (p: Personel) => void;
}) {
  const [ara, setAra] = useState("");

  const gorunen = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase("tr-TR");
    if (!q) return personeller;
    return personeller.filter(
      (p) =>
        `${p.ad} ${p.soyad} ${p.sicil_no}`.toLocaleLowerCase("tr-TR").includes(q) || p.tc_kimlik.includes(ara.trim())
    );
  }, [personeller, ara]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="arama-kutu min-w-[200px] flex-1 sm:max-w-sm">
          <Ikon ad="ara" boyut={16} />
          <input
            className="girdi girdi-sik"
            placeholder="İsim, sicil veya T.C. ara"
            value={ara}
            onChange={(e) => setAra(e.target.value)}
            aria-label="Personel ara"
          />
        </div>
        {onYeni && (
          <button type="button" className="btn btn-ana btn-kucuk ml-auto" onClick={onYeni}>
            <Ikon ad="arti" boyut={14} />
            Yeni personel
          </button>
        )}
      </div>

      <div className="panel overflow-hidden">
        {gorunen.length === 0 ? (
          <Bos
            ikon="personel"
            baslik={personeller.length === 0 ? "Henüz personel yok" : "Eşleşen kayıt yok"}
            metin={personeller.length === 0 ? "İlk personeli ekleyerek başlayın." : "Aramayı değiştirin."}
          >
            {personeller.length === 0 && onYeni && (
              <button type="button" className="btn btn-ana" onClick={onYeni}>
                <Ikon ad="arti" boyut={16} />
                Yeni personel
              </button>
            )}
          </Bos>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="tablo">
                <thead>
                  <tr>
                    <th>Personel</th>
                    <th>T.C. kimlik</th>
                    <th>Şube</th>
                    <th>Durum</th>
                    <th className="sag">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map((p) => (
                    <tr key={p.id} style={{ opacity: p.aktif ? 1 : 0.6 }}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar ad={p.ad} soyad={p.soyad} />
                          <div className="min-w-0">
                            <p className="m1 truncate font-semibold">
                              {p.ad} {p.soyad}
                            </p>
                            <p className="m3 text-xs">
                              {p.sicil_no}, {p.departman || "Genel"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="m2 sayi">{tcMaske(p.tc_kimlik)}</td>
                      <td className="m2">{p.subeler?.ad || "Atanmamış"}</td>
                      <td>
                        <Durumlar p={p} bakiye={bakiyeler[p.id]} />
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <Islemler p={p} onIzin={onIzinBilgileri} onPin={onPin} onCihaz={onCihaz} onAktif={onAktif} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="liste md:hidden">
              {gorunen.map((p) => (
                <li key={p.id} className="space-y-3 px-4 py-4" style={{ opacity: p.aktif ? 1 : 0.6 }}>
                  <div className="flex items-center gap-3">
                    <Avatar ad={p.ad} soyad={p.soyad} boyut={40} />
                    <div className="min-w-0">
                      <p className="m1 truncate font-semibold">
                        {p.ad} {p.soyad}
                      </p>
                      <p className="m3 text-xs">
                        {p.sicil_no}, {p.subeler?.ad || "Şube atanmamış"}, {tcMaske(p.tc_kimlik)}
                      </p>
                    </div>
                  </div>
                  <Durumlar p={p} bakiye={bakiyeler[p.id]} />
                  <Islemler p={p} onIzin={onIzinBilgileri} onPin={onPin} onCihaz={onCihaz} onAktif={onAktif} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
