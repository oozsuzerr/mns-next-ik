"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz, tcMaske, type Personel, type Sube, type Vardiya } from "../../lib/tipler";
import { yerelTarih } from "../../lib/tarih";
import { AKTARIM_EN_FAZLA, dosyayiOku, sablonOlustur, satirlariDenetle, type DenetlenmisSatir } from "../../lib/personelAktar";
import { Ikon, Modal, Rozet, useBildirim } from "../ui";

type Sonuc = { tur: "eklendi" } | { tur: "pinsiz"; mesaj: string } | { tur: "hata"; mesaj: string };

/** Excel şablonuyla toplu personel ekleme: şablonu indir, doldur, yükle, önizle, aktar */
export default function PersonelAktarim({
  subeler,
  vardiyalar,
  personeller,
  onKapat,
  onKayit,
}: {
  subeler: Sube[];
  vardiyalar: Vardiya[];
  /** TC ve sicil tekrarını aktarmadan önce yakalamak için */
  personeller: Personel[];
  onKapat: () => void;
  onKayit: () => void;
}) {
  const { bildir, onayla } = useBildirim();
  const [dosyaAdi, setDosyaAdi] = useState("");
  const [satirlar, setSatirlar] = useState<DenetlenmisSatir[] | null>(null);
  const [sonuclar, setSonuclar] = useState<Record<number, Sonuc>>({});
  const [ilerleme, setIlerleme] = useState<{ bitti: number; toplam: number } | null>(null);
  const [tamamlandi, setTamamlandi] = useState(false);

  const hazir = useMemo(() => (satirlar ?? []).filter((s) => !s.hatalar.length), [satirlar]);
  const hatali = (satirlar?.length ?? 0) - hazir.length;
  const eklenen = Object.values(sonuclar).filter((s) => s.tur !== "hata").length;

  function sablonuIndir() {
    const veri = sablonOlustur(subeler, vardiyalar);
    const url = URL.createObjectURL(new Blob([veri], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Personel_Aktarim_Sablonu.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function dosyaSec(e: ChangeEvent<HTMLInputElement>) {
    const dosya = e.target.files?.[0];
    e.target.value = "";
    if (!dosya) return;
    if (dosya.size > 5 * 1024 * 1024) return bildir("Dosya en fazla 5 MB olabilir.", "hata");
    try {
      const okunan = dosyayiOku(await dosya.arrayBuffer());
      if (!okunan.length) return bildir("Dosyada personel satırı bulunamadı.", "hata");
      if (okunan.length > AKTARIM_EN_FAZLA) return bildir(`Tek seferde en fazla ${AKTARIM_EN_FAZLA} personel aktarılabilir; dosyayı bölün.`, "hata");
      setSatirlar(
        satirlariDenetle(okunan, {
          subeler: subeler.map((s) => ({ id: s.id, ad: s.ad })),
          vardiyalar: vardiyalar.map((v) => ({ id: v.id, ad: v.ad })),
          mevcut: personeller,
          bugun: yerelTarih(),
        })
      );
      setDosyaAdi(dosya.name);
      setSonuclar({});
      setTamamlandi(false);
    } catch (err) {
      bildir(err instanceof Error && err.message.includes("şablon") ? err.message : "Dosya okunamadı. Panelden indirdiğiniz Excel şablonunu kullanın.", "hata");
    }
  }

  async function aktar() {
    if (!hazir.length) return;
    const tamam = await onayla({
      baslik: `${hazir.length} personel eklensin mi?`,
      metin: hatali ? `Hatalı ${hatali} satır atlanır; düzeltip ayrıca yükleyebilirsiniz.` : "Bütün satırlar eklenecek.",
      onayEtiketi: "Aktar",
    });
    if (!tamam) return;

    const yeni: Record<number, Sonuc> = {};
    setIlerleme({ bitti: 0, toplam: hazir.length });
    let sinirDoldu = "";
    for (const [i, s] of hazir.entries()) {
      if (sinirDoldu) {
        yeni[s.satirNo] = { tur: "hata", mesaj: sinirDoldu };
        continue;
      }
      const { data, error } = await supabase
        .from("personeller")
        .insert([{ ...s.kayit, rol: "PERSONEL", aktif: true }])
        .select("id")
        .single();
      if (error || !data) {
        const mesaj = error?.code === "23505" ? "Bu T.C. kimlik no ya da sicil no başka bir personelde kayıtlı." : hataYaz(error ?? "Eklenemedi.");
        if (/PERSONEL_LIMITI/.test(error?.message ?? "")) sinirDoldu = mesaj;
        yeni[s.satirNo] = { tur: "hata", mesaj };
      } else if (s.pin) {
        const { error: pinHata } = await supabase.rpc("personel_pin_belirle", { p_personel_id: data.id, p_pin: s.pin });
        yeni[s.satirNo] = pinHata ? { tur: "pinsiz", mesaj: `Eklendi ama PIN verilemedi: ${hataYaz(pinHata)}` } : { tur: "eklendi" };
      } else {
        yeni[s.satirNo] = { tur: "eklendi" };
      }
      setSonuclar({ ...yeni });
      setIlerleme({ bitti: i + 1, toplam: hazir.length });
    }
    setIlerleme(null);
    setTamamlandi(true);
    const sayi = Object.values(yeni).filter((x) => x.tur !== "hata").length;
    if (sayi) onKayit();
    bildir(`${sayi} personel eklendi${sayi < hazir.length ? `, ${hazir.length - sayi} satır eklenemedi` : ""}.`, sayi ? "basari" : "hata");
  }

  const durumu = (s: DenetlenmisSatir) => {
    const sonuc = sonuclar[s.satirNo];
    if (sonuc?.tur === "eklendi") return <Rozet ton="giris">Eklendi</Rozet>;
    if (sonuc?.tur === "pinsiz") return <Rozet ton="uyari">Eklendi, PIN yok</Rozet>;
    if (sonuc?.tur === "hata" || s.hatalar.length) return <Rozet ton="hata">Hata</Rozet>;
    if (tamamlandi) return <Rozet ton="notr">Atlandı</Rozet>;
    return s.uyarilar.length ? <Rozet ton="uyari">Uyarı</Rozet> : <Rozet ton="izin">Hazır</Rozet>;
  };

  return (
    <Modal onKapat={ilerleme ? () => undefined : onKapat} baslik="Excel'den personel aktar" genis>
      <div className="space-y-4">
        <ol className="m2 grid gap-3 text-sm sm:grid-cols-3">
          <li className="panel px-4 py-3">
            <p className="m1 font-semibold">1. Şablonu indirin</p>
            <p className="m3 mt-1 text-xs">Şube ve vardiya adlarınız şablonda hazır gelir.</p>
            <button type="button" className="btn btn-ikincil btn-kucuk mt-2" onClick={sablonuIndir}>
              <Ikon ad="indir" boyut={14} />
              Şablonu indir
            </button>
          </li>
          <li className="panel px-4 py-3">
            <p className="m1 font-semibold">2. Doldurun</p>
            <p className="m3 mt-1 text-xs">Her personel bir satır. Ad, soyad, sicil no ve T.C. kimlik no zorunlu; açıklamalar şablonun ikinci sayfasında.</p>
          </li>
          <li className="panel px-4 py-3">
            <p className="m1 font-semibold">3. Yükleyin</p>
            <p className="m3 mt-1 text-xs">Eklemeden önce her satırın kontrolünü görürsünüz.</p>
            <label className="btn btn-ana btn-kucuk mt-2 cursor-pointer">
              <Ikon ad="rapor" boyut={14} />
              Dosya seç
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={dosyaSec} disabled={!!ilerleme} />
            </label>
          </li>
        </ol>

        {satirlar && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="m2">{dosyaAdi}:</span>
              <Rozet ton="izin">{hazir.length} satır hazır</Rozet>
              {hatali > 0 && <Rozet ton="hata">{hatali} satır hatalı</Rozet>}
              {tamamlandi && <Rozet ton="giris">{eklenen} personel eklendi</Rozet>}
            </div>
            <div className="panel max-h-[45vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="m2 text-left text-xs">
                    <th className="px-3 py-2">Satır</th>
                    <th className="px-3 py-2">Personel</th>
                    <th className="px-3 py-2">Şube / vardiya</th>
                    <th className="px-3 py-2">İşe giriş</th>
                    <th className="px-3 py-2">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {satirlar.map((s) => {
                    const sonuc = sonuclar[s.satirNo];
                    const notlar = [...s.hatalar, ...(sonuc && sonuc.tur !== "eklendi" ? [sonuc.mesaj] : []), ...(sonuc ? [] : s.uyarilar)];
                    return (
                      <tr key={s.satirNo} className="align-top" style={{ borderTop: "1px solid var(--cizgi)" }}>
                        <td className="m3 sayi px-3 py-2">{s.satirNo}</td>
                        <td className="px-3 py-2">
                          <p className="m1 font-medium">
                            {s.kayit.ad} {s.kayit.soyad}
                          </p>
                          <p className="m3 text-xs">
                            {s.kayit.sicil_no || "-"} · {tcMaske(s.kayit.tc_kimlik) || "-"}
                          </p>
                          {notlar.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-xs" style={{ color: s.hatalar.length || sonuc?.tur === "hata" ? "var(--hata)" : "var(--uyari)" }}>
                              {notlar.map((n) => (
                                <li key={n}>{n}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="m2 px-3 py-2 text-xs">
                          {s.subeAd || "-"}
                          <br />
                          {s.vardiyaAd || "-"}
                        </td>
                        <td className="m2 sayi px-3 py-2 text-xs">{s.kayit.ise_giris_tarihi ? s.kayit.ise_giris_tarihi.split("-").reverse().join(".") : "-"}</td>
                        <td className="px-3 py-2">{durumu(s)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {ilerleme && (
            <span className="m2 sayi mr-auto text-sm">
              Ekleniyor… {ilerleme.bitti}/{ilerleme.toplam}
            </span>
          )}
          <button type="button" className="btn btn-ikincil" onClick={onKapat} disabled={!!ilerleme}>
            {tamamlandi ? "Kapat" : "Vazgeç"}
          </button>
          {!tamamlandi && (
            <button type="button" className="btn btn-ana" onClick={aktar} disabled={!hazir.length || !!ilerleme}>
              {hazir.length ? `${hazir.length} personeli aktar` : "Aktar"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
