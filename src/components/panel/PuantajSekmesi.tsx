"use client";

import { useMemo, useState } from "react";
import type { PuantajSatiri } from "../../lib/puantaj";
import { saatDakika } from "../../lib/tarih";
import { Avatar, Bos, Ikon, Iskelet, Rozet, type RozetTon } from "../ui";

function Deger({ sayi, ton, birim = "gün" }: { sayi: number; ton: RozetTon; birim?: string }) {
  if (sayi <= 0) return <span className="m3">-</span>;
  return <Rozet ton={ton}>{birim ? `${sayi} ${birim}` : sayi}</Rozet>;
}

export default function PuantajSekmesi({
  liste,
  seciliAy,
  onAyDegis,
  onSec,
  onYenile,
  yukleniyor,
  kilitli = false,
  onKilit,
}: {
  liste: PuantajSatiri[];
  seciliAy: string;
  onAyDegis: (ay: string) => void;
  onSec: (id: string) => void;
  onYenile: () => void;
  yukleniyor: boolean;
  /** Seçili ay kapatılmış mı */
  kilitli?: boolean;
  /** Yalnızca genel yöneticide: ayı kapat / aç */
  onKilit?: () => void;
}) {
  const [ara, setAra] = useState("");
  const [sadeceSorunlu, setSadeceSorunlu] = useState(false);

  const gorunen = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase("tr-TR");
    return liste.filter((p) => {
      const aramaUygun =
        !q || p.adSoyad.toLocaleLowerCase("tr-TR").includes(q) || p.sicil_no.toLocaleLowerCase("tr-TR").includes(q);
      const sorunlu = p.devamsizGunler > 0 || p.eksikGunler > 0 || p.gecikmeDk > 0;
      return aramaUygun && (!sadeceSorunlu || sorunlu);
    });
  }, [liste, ara, sadeceSorunlu]);

  const toplam = useMemo(
    () => ({
      net: gorunen.reduce((t, p) => t + p.toplamCalismaDk, 0),
      devamsiz: gorunen.reduce((t, p) => t + p.devamsizGunler, 0),
      eksik: gorunen.reduce((t, p) => t + p.eksikGunler, 0),
      mesai: gorunen.reduce((t, p) => t + p.planDisiMesaiDk, 0),
    }),
    [gorunen]
  );

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
            aria-label="Personel ara"
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
        <button
          type="button"
          className={`btn btn-kucuk ${sadeceSorunlu ? "btn-ana" : "btn-ikincil"}`}
          onClick={() => setSadeceSorunlu(!sadeceSorunlu)}
          aria-pressed={sadeceSorunlu}
        >
          Sadece sorunlu olanlar
        </button>
        <button type="button" className="btn btn-hayalet btn-kucuk btn-ikon" onClick={onYenile} aria-label="Yenile">
          <Ikon ad="yenile" className={yukleniyor ? "donen" : ""} boyut={16} />
        </button>
        {kilitli && (
          <Rozet ton="izin">
            <Ikon ad="kilit" boyut={13} />
            Ay kapalı
          </Rozet>
        )}
        {onKilit && (
          <button type="button" className={`btn btn-kucuk ${kilitli ? "btn-hayalet" : "btn-ikincil"}`} onClick={onKilit}>
            <Ikon ad={kilitli ? "kilitac" : "kilit"} boyut={14} />
            {kilitli ? "Ayı aç" : "Ayı kapat"}
          </button>
        )}
      </div>
      {kilitli && (
        <p className="m2 text-sm">
          Bu ay kapatıldı: giriş/çıkış, izin ve vardiya planı değiştirilemez. Puantaj kesinleşmiş haliyle görünür.
        </p>
      )}

      <div className="ozet-seridi">
        <div>
          <p className="m2 text-xs font-semibold">Toplam net süre (sa:dk)</p>
          <p className="baslik-font sayi m1 mt-0.5 text-xl">{saatDakika(toplam.net)}</p>
        </div>
        <div>
          <p className="m2 text-xs font-semibold">Devamsız gün</p>
          <p className="baslik-font sayi mt-0.5 text-xl" style={{ color: toplam.devamsiz > 0 ? "var(--hata)" : "var(--m1)" }}>
            {toplam.devamsiz}
          </p>
        </div>
        <div>
          <p className="m2 text-xs font-semibold">Eksik hareketli gün</p>
          <p className="baslik-font sayi mt-0.5 text-xl" style={{ color: toplam.eksik > 0 ? "var(--uyari)" : "var(--m1)" }}>
            {toplam.eksik}
          </p>
        </div>
        <div>
          <p className="m2 text-xs font-semibold">Plan dışı mesai (sa:dk)</p>
          <p className="baslik-font sayi m1 mt-0.5 text-xl">{saatDakika(toplam.mesai)}</p>
        </div>
      </div>

      <div className="panel overflow-hidden">
        {yukleniyor && liste.length === 0 ? (
          <div className="space-y-3 p-5">
            <Iskelet yukseklik={20} />
            <Iskelet yukseklik={20} />
            <Iskelet yukseklik={20} />
          </div>
        ) : gorunen.length === 0 ? (
          <Bos
            ikon="puantaj"
            baslik={liste.length === 0 ? "Henüz personel yok" : "Eşleşen kayıt yok"}
            metin={
              liste.length === 0
                ? "Personel ekledikten ve hareketler oluştuktan sonra aylık puantaj burada görünür."
                : "Arama ya da filtreyi değiştirin."
            }
          />
        ) : (
          <>
            {/* Masaüstü: tablo */}
            <div className="hidden overflow-x-auto md:block">
              <table className="tablo">
                <thead>
                  <tr>
                    <th>Personel</th>
                    <th>Şube</th>
                    <th className="sag">Çalışılan</th>
                    <th className="sag">Rapor / izin</th>
                    <th className="sag">Devamsız</th>
                    <th className="sag">Eksik</th>
                    <th className="sag">Net süre (sa:dk)</th>
                    <th className="sag">Mesai (sa:dk)</th>
                    <th className="sag">Gecikme (sa:dk)</th>
                  </tr>
                </thead>
                <tbody>
                  {gorunen.map((p) => (
                    <tr
                      key={p.id}
                      className="tr-tikla"
                      tabIndex={0}
                      onClick={() => onSec(p.id)}
                      onKeyDown={(e) => e.key === "Enter" && onSec(p.id)}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar ad={p.adSoyad.split(" ")[0]} soyad={p.adSoyad.split(" ").slice(-1)[0]} />
                          <div className="min-w-0">
                            <p className="m1 truncate font-semibold">{p.adSoyad}</p>
                            <p className="m3 text-xs">{p.sicil_no}</p>
                          </div>
                        </div>
                      </td>
                      <td className="m2">{p.subeAdi}</td>
                      <td className="sag sayi m1 font-semibold">{p.calisilanGunler} gün</td>
                      <td className="sag">
                        <Deger sayi={p.raporluGunler + p.izinliGunler} ton="izin" />
                      </td>
                      <td className="sag">
                        <Deger sayi={p.devamsizGunler} ton="hata" />
                      </td>
                      <td className="sag">
                        <Deger sayi={p.eksikGunler} ton="uyari" />
                      </td>
                      <td className="sag sayi m1 font-semibold">{saatDakika(p.toplamCalismaDk)}</td>
                      <td className="sag sayi m2">{p.planDisiMesaiDk > 0 ? `+${saatDakika(p.planDisiMesaiDk)}` : "-"}</td>
                      <td className="sag sayi m2">{p.gecikmeDk > 0 ? saatDakika(p.gecikmeDk) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Telefon: liste */}
            <ul className="liste md:hidden">
              {gorunen.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onSec(p.id)} className="block w-full px-4 py-3.5 text-left">
                    <div className="flex items-center gap-3">
                      <Avatar ad={p.adSoyad.split(" ")[0]} soyad={p.adSoyad.split(" ").slice(-1)[0]} />
                      <div className="min-w-0 flex-1">
                        <p className="m1 truncate font-semibold">{p.adSoyad}</p>
                        <p className="m3 text-xs">
                          {p.sicil_no} - {p.subeAdi}
                        </p>
                      </div>
                      <Ikon ad="sag" className="m3" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Rozet ton="giris">{p.calisilanGunler} gün çalıştı</Rozet>
                      {p.devamsizGunler > 0 && <Rozet ton="hata">{p.devamsizGunler} gün devamsız</Rozet>}
                      {p.eksikGunler > 0 && <Rozet ton="uyari">{p.eksikGunler} gün eksik</Rozet>}
                      {p.raporluGunler + p.izinliGunler > 0 && (
                        <Rozet ton="izin">{p.raporluGunler + p.izinliGunler} gün rapor/izin</Rozet>
                      )}
                      <span className="m2 sayi ml-auto text-xs font-semibold">{saatDakika(p.toplamCalismaDk)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="m3 text-xs leading-relaxed">
        Hesaplama; giriş-çıkış eşleştirmesini (gece vardiyası dahil), 5 dakikalık gecikme ve 15 dakikalık mesai
        toleransını, 4 saati aşan günlerde vardiya molasının düşülmesini ve vardiya planındaki hafta tatili (plan yoksa Pazar) ile resmi tatil ayrımını esas alır.
        Plan dışı mesai vardiya bitişine göre hesaplanır. Yasal haftalık 45 saat sınırı ve zamlı ücret için bordro
        öncesi mali müşavir onayı alın.
      </p>
    </div>
  );
}
