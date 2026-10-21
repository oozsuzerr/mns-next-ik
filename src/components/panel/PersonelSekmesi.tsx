"use client";

import { useMemo, useState } from "react";
import type { IzinBakiyesi, Personel } from "../../lib/tipler";
import { gunYaz, tcMaske } from "../../lib/tipler";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { disariAktar } from "../../lib/disaAktar";
import { AcilirMenu, Avatar, Bos, Ikon, Rozet, useBildirim, type RozetTon } from "../ui";
import MobilBaglanti from "./MobilBaglanti";

type Liste = "aktif" | "izinli" | "devamsiz" | "tum" | "cikan";
type Siralama = "ad" | "departman" | "unvan" | "sube" | "vardiya" | "giris" | "cikis";

const LISTELER: { id: Liste; ad: string; ikon: "personel" | "takvim" | "uyari" | "bina" | "cikis" }[] = [
  { id: "aktif", ad: "Aktif personeller", ikon: "personel" },
  { id: "izinli", ad: "İzinli personeller", ikon: "takvim" },
  { id: "devamsiz", ad: "Devamsız personeller", ikon: "uyari" },
  { id: "tum", ad: "Tüm personeller", ikon: "bina" },
  { id: "cikan", ad: "Çıkan personeller", ikon: "cikis" },
];

/** "2019-06-15" -> "15.06.2019" (işe giriş/çıkışta yıl önemli) */
const tamTarih = (t: string) => t.split("-").reverse().join(".");

/** İşten ayrılmış ya da pasife alınmış */
function ayrildi(p: Personel, bugun: string) {
  return !p.aktif || (!!p.cikis_tarihi && p.cikis_tarihi < bugun);
}

export default function PersonelSekmesi({
  personeller,
  bakiyeler,
  izinliIdler,
  devamsizIdler,
  iceridekiIdler,
  onIzinBilgileri,
  onGorevBilgisi,
  onTazminat,
  onOzluk,
  onYeni,
  onPin,
  onCihaz,
  onAktif,
  firma,
}: {
  personeller: Personel[];
  /** Firmaya özel personel giriş bağlantısı için (kod yoksa düğme görünmez) */
  firma?: { ad: string; kod: string } | null;
  /** personel id -> yıllık izin bakiyesi */
  bakiyeler: Record<string, IzinBakiyesi>;
  /** Bugün izinli / gelmeyen / içeride olanlar (Bugün özetiyle aynı hesap) */
  izinliIdler: Set<string>;
  devamsizIdler: Set<string>;
  iceridekiIdler: Set<string>;
  onIzinBilgileri: (p: Personel) => void;
  /** Departman ve ünvan düzenleme ("personel" yetkisi) */
  onGorevBilgisi?: (p: Personel) => void;
  /** Kıdem ve ihbar tazminatı hesabı (genel yönetici) */
  onTazminat?: (p: Personel) => void;
  /** Yalnızca genel yönetici: özlük bilgileri ve belgeler */
  onOzluk?: (p: Personel) => void;
  /** Verilmezse (şube müdürü) ilgili düğmeler gizlenir */
  onYeni?: () => void;
  onPin?: (p: Personel) => void;
  onCihaz?: (p: Personel) => void;
  onAktif?: (p: Personel) => void;
}) {
  const { bildir } = useBildirim();
  const bugun = yerelTarih();
  const [liste, setListe] = useState<Liste>("aktif");
  const [ara, setAra] = useState("");
  const [filtre, setFiltre] = useState({ ad: "", departman: "", unvan: "", sube: "", vardiya: "" });
  const [sirala, setSirala] = useState<{ alan: Siralama; artan: boolean }>({ alan: "ad", artan: true });
  const [sayfaBoyu, setSayfaBoyu] = useState(25);
  const [sayfa, setSayfa] = useState(1);

  const listeler = useMemo(() => {
    const aktif = personeller.filter((p) => !ayrildi(p, bugun));
    return {
      aktif,
      izinli: aktif.filter((p) => izinliIdler.has(p.id)),
      devamsiz: aktif.filter((p) => devamsizIdler.has(p.id)),
      tum: personeller,
      cikan: personeller.filter((p) => ayrildi(p, bugun)),
    } satisfies Record<Liste, Personel[]>;
  }, [personeller, izinliIdler, devamsizIdler, bugun]);

  function durum(p: Personel): { ad: string; ton: RozetTon } {
    if (ayrildi(p, bugun)) return p.cikis_tarihi ? { ad: "Çıkış yaptı", ton: "hata" } : { ad: "Pasif", ton: "notr" };
    if (izinliIdler.has(p.id)) return { ad: "İzinli", ton: "izin" };
    if (devamsizIdler.has(p.id)) return { ad: "Devamsız", ton: "uyari" };
    if (iceridekiIdler.has(p.id)) return { ad: "İçeride", ton: "giris" };
    return { ad: "Çalışıyor", ton: "notr" };
  }

  const deger = (p: Personel, alan: Siralama): string => {
    switch (alan) {
      case "ad":
        return `${p.ad} ${p.soyad}`;
      case "departman":
        return p.departman || "";
      case "unvan":
        return p.unvan || "";
      case "sube":
        return p.subeler?.ad || "";
      case "vardiya":
        return p.vardiyalar?.ad || "";
      case "giris":
        return p.ise_giris_tarihi || "";
      case "cikis":
        return p.cikis_tarihi || "";
    }
  };

  const gorunen = useMemo(() => {
    const k = (s: string) => s.toLocaleLowerCase("tr-TR");
    const q = k(ara.trim());
    const f = { ad: k(filtre.ad.trim()), departman: k(filtre.departman.trim()), unvan: k(filtre.unvan.trim()), sube: k(filtre.sube.trim()), vardiya: k(filtre.vardiya.trim()) };
    return listeler[liste]
      .filter(
        (p) =>
          (!q || k(`${p.ad} ${p.soyad} ${p.sicil_no} ${p.departman ?? ""} ${p.unvan ?? ""} ${p.subeler?.ad ?? ""}`).includes(q) || p.tc_kimlik.includes(ara.trim())) &&
          (!f.ad || k(`${p.ad} ${p.soyad} ${p.sicil_no}`).includes(f.ad)) &&
          (!f.departman || k(p.departman || "").includes(f.departman)) &&
          (!f.unvan || k(p.unvan || "").includes(f.unvan)) &&
          (!f.sube || k(p.subeler?.ad || "").includes(f.sube)) &&
          (!f.vardiya || k(p.vardiyalar?.ad || "").includes(f.vardiya))
      )
      .sort((a, b) => deger(a, sirala.alan).localeCompare(deger(b, sirala.alan), "tr") * (sirala.artan ? 1 : -1));
  }, [listeler, liste, ara, filtre, sirala]);

  const sayfaSayisi = Math.max(1, Math.ceil(gorunen.length / sayfaBoyu));
  const gecerliSayfa = Math.min(sayfa, sayfaSayisi);
  const sayfadakiler = gorunen.slice((gecerliSayfa - 1) * sayfaBoyu, gecerliSayfa * sayfaBoyu);

  function excel() {
    const h = disariAktar(
      "xlsx",
      `${LISTELER.find((l) => l.id === liste)?.ad} (${kisaTarih(bugun)})`,
      `Personel_Listesi_${liste}_${bugun}`,
      gorunen.map((p, i) => ({
        Sıra: i + 1,
        "Sicil No": p.sicil_no,
        "Ad Soyad": `${p.ad} ${p.soyad}`,
        "T.C. Kimlik": p.tc_kimlik,
        Departman: p.departman || "",
        Ünvan: p.unvan || "",
        Şube: p.subeler?.ad || "",
        Vardiya: p.vardiyalar?.ad || "",
        "İşe Giriş": p.ise_giris_tarihi || "",
        "İşten Çıkış": p.cikis_tarihi || "",
        Mobil: p.cihaz_id ? "Aktif" : "Pasif",
        Durum: durum(p).ad,
      }))
    );
    if (h) bildir(h, "hata");
  }

  const baslik = (ad: string, alan: Siralama) => (
    <th>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold"
        onClick={() => setSirala({ alan, artan: sirala.alan === alan ? !sirala.artan : true })}
        aria-label={`${ad} sütununa göre sırala`}
      >
        {ad}
        <span className="m3 text-[10px]">{sirala.alan === alan ? (sirala.artan ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
  const filtreKutusu = (alan: keyof typeof filtre, ad: string) => (
    <th>
      <input
        className="girdi girdi-sik"
        style={{ minWidth: 90 }}
        placeholder={ad}
        value={filtre[alan]}
        onChange={(e) => {
          setFiltre({ ...filtre, [alan]: e.target.value });
          setSayfa(1);
        }}
        aria-label={`${ad} filtresi`}
      />
    </th>
  );

  const menu = (p: Personel) => (
    <AcilirMenu etiket={`${p.ad} ${p.soyad} işlemleri`} sinif="btn btn-hayalet btn-kucuk btn-ikon" tetikleyici={<Ikon ad="daha" boyut={16} />}>
      {(kapat) => (
        <>
          {[
            { ad: "İzin bilgileri", ikon: "takvim" as const, f: () => onIzinBilgileri(p) },
            onGorevBilgisi && { ad: "Departman ve ünvan", ikon: "personel" as const, f: () => onGorevBilgisi(p) },
            onOzluk && { ad: "Özlük ve belgeler", ikon: "rapor" as const, f: () => onOzluk(p) },
            onTazminat && { ad: "Kıdem ve ihbar tazminatı", ikon: "rapor" as const, f: () => onTazminat(p) },
            onPin && { ad: "PIN ver / sıfırla", ikon: "anahtar" as const, f: () => onPin(p) },
            p.cihaz_id && onCihaz && { ad: "Telefon kilidini aç", ikon: "kilitac" as const, f: () => onCihaz(p) },
            onAktif && { ad: p.aktif ? "Pasife al" : "Aktif et", ikon: "guc" as const, f: () => onAktif(p) },
          ]
            .filter((x): x is { ad: string; ikon: "takvim" | "personel" | "rapor" | "anahtar" | "kilitac" | "guc"; f: () => void } => !!x)
            .map((x) => (
              <button
                key={x.ad}
                type="button"
                role="menuitem"
                className="menu-oge"
                onClick={() => {
                  kapat();
                  x.f();
                }}
              >
                <Ikon ad={x.ikon} boyut={16} />
                {x.ad}
              </button>
            ))}
        </>
      )}
    </AcilirMenu>
  );

  return (
    <div className="space-y-4">
      {/* Durum sekmeleri */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex gap-2" role="tablist" aria-label="Personel listesi">
          {LISTELER.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={liste === l.id}
              className={`btn relative whitespace-nowrap ${liste === l.id ? "btn-ana" : "btn-ikincil"}`}
              onClick={() => {
                setListe(l.id);
                setSayfa(1);
              }}
            >
              <Ikon ad={l.ikon} boyut={16} />
              {l.ad}
              <span
                className="sayi ml-1 rounded-full px-1.5 text-xs font-semibold"
                style={{ background: liste === l.id ? "rgba(255,255,255,0.25)" : "var(--cizgi, #e5e7eb)" }}
              >
                {listeler[l.id].length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel overflow-hidden">
        {/* Araç çubuğu */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5" style={{ borderBottom: "1px solid var(--cizgi, #e5e7eb)" }}>
          <p className="baslik-font m1 mr-auto text-base">{LISTELER.find((l) => l.id === liste)?.ad}</p>
          <label className="m2 hidden items-center gap-2 text-sm sm:flex">
            Her sayfada
            <select
              className="girdi girdi-sik"
              style={{ width: "auto" }}
              value={sayfaBoyu}
              onChange={(e) => {
                setSayfaBoyu(Number(e.target.value));
                setSayfa(1);
              }}
            >
              {[25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="arama-kutu min-w-[180px] flex-1 sm:max-w-xs">
            <Ikon ad="ara" boyut={16} />
            <input
              className="girdi girdi-sik"
              placeholder="Listede ara"
              value={ara}
              onChange={(e) => {
                setAra(e.target.value);
                setSayfa(1);
              }}
              aria-label="Personel ara"
            />
          </div>
          <button type="button" className="btn btn-ikincil btn-kucuk" onClick={excel} disabled={!gorunen.length}>
            <Ikon ad="indir" boyut={14} />
            Excel
          </button>
          {firma?.kod && <MobilBaglanti firmaKod={firma.kod} firmaAd={firma.ad} />}
          {onYeni && (
            <button type="button" className="btn btn-ana btn-kucuk" onClick={onYeni}>
              <Ikon ad="arti" boyut={14} />
              Yeni personel
            </button>
          )}
        </div>

        {gorunen.length === 0 && listeler[liste].length === 0 ? (
          <Bos
            ikon="personel"
            baslik={personeller.length === 0 ? "Henüz personel yok" : "Bu listede personel yok"}
            metin={
              personeller.length === 0
                ? "İlk personeli ekleyerek başlayın."
                : liste === "izinli"
                ? "Bugün izinli personel yok."
                : liste === "devamsiz"
                ? "Bugün işe gelmeyen personel yok."
                : liste === "cikan"
                ? "İşten çıkan ya da pasif personel yok."
                : ""
            }
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
            {/* Masaüstü: tablo */}
            <div className="hidden overflow-x-auto md:block">
              <table className="tablo">
                <thead>
                  <tr>
                    {baslik("Adı soyadı", "ad")}
                    {baslik("Departman", "departman")}
                    {baslik("Ünvan", "unvan")}
                    {baslik("Şube", "sube")}
                    {baslik("Vardiya", "vardiya")}
                    {baslik("Giriş tar.", "giris")}
                    {baslik("Çıkış tar.", "cikis")}
                    <th>Mobil</th>
                    <th>Durumu</th>
                    <th className="sag">İşlemler</th>
                  </tr>
                  <tr>
                    {filtreKutusu("ad", "Adı soyadı")}
                    {filtreKutusu("departman", "Departman")}
                    {filtreKutusu("unvan", "Ünvan")}
                    {filtreKutusu("sube", "Şube")}
                    {filtreKutusu("vardiya", "Vardiya")}
                    <th />
                    <th />
                    <th />
                    <th />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sayfadakiler.map((p) => {
                    const d = durum(p);
                    const bakiye = bakiyeler[p.id];
                    return (
                      <tr key={p.id} style={{ opacity: ayrildi(p, bugun) ? 0.75 : 1 }}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar ad={p.ad} soyad={p.soyad} />
                            <div className="min-w-0">
                              <p className="m1 truncate font-semibold">
                                {p.ad} {p.soyad}
                              </p>
                              <p className="m3 sayi text-xs">
                                {p.sicil_no} · {tcMaske(p.tc_kimlik)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="m2">{p.departman || "Genel"}</td>
                        <td className="m2">{p.unvan || "-"}</td>
                        <td className="m2">{p.subeler?.ad || "Atanmamış"}</td>
                        <td className="m2">{p.vardiyalar?.ad || "-"}</td>
                        <td className="m2 sayi">{p.ise_giris_tarihi ? tamTarih(p.ise_giris_tarihi) : "-"}</td>
                        <td className="m2 sayi">{p.cikis_tarihi ? tamTarih(p.cikis_tarihi) : "-"}</td>
                        <td>
                          <span title={p.pin_tanimli ? "PIN tanımlı" : "PIN yok"}>
                            <Rozet ton={p.cihaz_id ? "giris" : "notr"}>{p.cihaz_id ? "Aktif" : p.pin_tanimli ? "Cihaz yok" : "PIN yok"}</Rozet>
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap items-center gap-1">
                            <Rozet ton={d.ton}>{d.ad}</Rozet>
                            {bakiye?.tanimli && !ayrildi(p, bugun) && (
                              <span className="m3 text-xs" title="Kalan yıllık izin">
                                {gunYaz(bakiye.kalan)} gün izin
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex justify-end">{menu(p)}</div>
                        </td>
                      </tr>
                    );
                  })}
                  {sayfadakiler.length === 0 && (
                    <tr>
                      <td colSpan={10} className="m3 py-6 text-center text-sm">
                        Filtreyle eşleşen personel yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Telefon: kartlar */}
            <ul className="liste md:hidden">
              {sayfadakiler.map((p) => {
                const d = durum(p);
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3" style={{ opacity: ayrildi(p, bugun) ? 0.75 : 1 }}>
                    <Avatar ad={p.ad} soyad={p.soyad} boyut={40} />
                    <div className="min-w-0 flex-1">
                      <p className="m1 truncate font-semibold">
                        {p.ad} {p.soyad}
                      </p>
                      <p className="m3 truncate text-xs">
                        {p.unvan ? `${p.unvan} · ` : ""}
                        {p.departman || "Genel"} · {p.subeler?.ad || "Şube yok"}
                        {p.cikis_tarihi ? ` · çıkış ${tamTarih(p.cikis_tarihi)}` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Rozet ton={d.ton}>{d.ad}</Rozet>
                        <Rozet ton={p.cihaz_id ? "giris" : "notr"}>Mobil {p.cihaz_id ? "aktif" : "pasif"}</Rozet>
                      </div>
                    </div>
                    {menu(p)}
                  </li>
                );
              })}
              {sayfadakiler.length === 0 && <li className="m3 px-4 py-6 text-center text-sm">Aramayla eşleşen personel yok.</li>}
            </ul>

            {/* Sayfalama */}
            <div className="m2 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-5" style={{ borderTop: "1px solid var(--cizgi, #e5e7eb)" }}>
              <span>
                Toplam {gorunen.length} kayıt · sayfa {gecerliSayfa}/{sayfaSayisi}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" className="btn btn-hayalet btn-kucuk" disabled={gecerliSayfa <= 1} onClick={() => setSayfa(gecerliSayfa - 1)} aria-label="Önceki sayfa">
                  ‹
                </button>
                {Array.from({ length: sayfaSayisi }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === sayfaSayisi || Math.abs(n - gecerliSayfa) <= 1)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`btn btn-kucuk sayi ${n === gecerliSayfa ? "btn-ana" : "btn-hayalet"}`}
                      style={{ minWidth: 32 }}
                      onClick={() => setSayfa(n)}
                    >
                      {n}
                    </button>
                  ))}
                <button
                  type="button"
                  className="btn btn-hayalet btn-kucuk"
                  disabled={gecerliSayfa >= sayfaSayisi}
                  onClick={() => setSayfa(gecerliSayfa + 1)}
                  aria-label="Sonraki sayfa"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
