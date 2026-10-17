"use client";

import { useMemo, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz, type ResmiTatil } from "../../lib/tipler";
import { GUN_ADLARI, haftaGunu, kisaTarih, yerelTarih } from "../../lib/tarih";
import { diniBayramlarTanimli, hazirTatilListesi, type HazirTatil } from "../../lib/resmiTatiller";
import { Bos, Ikon, Modal, Rozet, useBildirim } from "../ui";

/** Sistem yöneticisinin ortak liste işlemleri (sunucu yolu) */
async function ortakIslem(govde: Record<string, unknown>): Promise<{ eklenen?: number; atlanan?: number }> {
  const { data } = await supabase.auth.getSession();
  const cevap = await fetch("/api/sistem/tatil", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(govde),
  });
  const sonuc = (await cevap.json().catch(() => ({}))) as { hata?: string; eklenen?: number; atlanan?: number };
  if (!cevap.ok) throw new Error(sonuc.hata === "YETKISIZ" ? "Türkiye geneli listeyi yalnızca sistem yöneticisi değiştirebilir." : sonuc.hata ?? "İşlem yapılamadı.");
  return sonuc;
}

export default function ResmiTatillerSekmesi({
  tatiller,
  firmaDuzenleyebilir,
  sistemYoneticisi,
  onKayit,
}: {
  tatiller: ResmiTatil[];
  /** Genel yönetici firmaya özel tatil ekler/siler */
  firmaDuzenleyebilir: boolean;
  /** Türkiye geneli listeyi yönetir */
  sistemYoneticisi: boolean;
  onKayit: () => Promise<void> | void;
}) {
  const { bildir, onayla } = useBildirim();
  const buYil = Number(yerelTarih().slice(0, 4));
  const [yil, setYil] = useState(buYil);
  const [formAcik, setFormAcik] = useState(false);
  const [ekleniyor, setEkleniyor] = useState(false);

  const yillar = useMemo(() => {
    const s = new Set<number>([buYil, buYil + 1, ...tatiller.map((t) => Number(t.tarih.slice(0, 4)))]);
    return [...s].sort();
  }, [tatiller, buYil]);

  const yilinTatilleri = tatiller.filter((t) => t.tarih.startsWith(`${yil}-`)).sort((a, b) => a.tarih.localeCompare(b.tarih));
  const ortakTarihler = new Set(tatiller.filter((t) => !t.firma_id).map((t) => t.tarih));
  const eksikler: HazirTatil[] = hazirTatilListesi(yil).filter((t) => !ortakTarihler.has(t.tarih));
  const bayramVar = diniBayramlarTanimli(yil);

  async function hazirListeyiEkle() {
    const tamam = await onayla({
      baslik: `${yil} için ${eksikler.length} gün eklensin mi?`,
      metin:
        eksikler.map((t) => `${kisaTarih(t.tarih)} ${t.ad}${t.yarim_gun ? " (yarım gün)" : ""}`).join(", ") +
        ". Türkiye geneli listeye eklenir, bütün firmalarda geçerli olur. Geçmiş tarihler o ayların puantajını yeniden hesaplatır.",
      onayEtiketi: "Ekle",
    });
    if (!tamam) return;
    setEkleniyor(true);
    try {
      const s = await ortakIslem({ islem: "ekle", tatiller: eksikler });
      bildir(`${s.eklenen ?? 0} gün eklendi.`, "basari");
      await onKayit();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setEkleniyor(false);
    }
  }

  async function sil(t: ResmiTatil) {
    const tamam = await onayla({
      baslik: `${kisaTarih(t.tarih)} ${t.ad} silinsin mi?`,
      metin: t.firma_id
        ? "Yalnızca firmanızın tatili silinir."
        : "Türkiye geneli listeden silinir; bütün firmaları etkiler.",
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    try {
      if (t.firma_id) {
        const { error } = await supabase.from("resmi_tatiller").delete().eq("id", t.id);
        if (error) throw error;
      } else {
        await ortakIslem({ islem: "sil", id: t.id });
      }
      bildir("Tatil silindi.", "basari");
      await onKayit();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    }
  }

  const eklenebilir = firmaDuzenleyebilir || sistemYoneticisi;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segment" style={{ gridTemplateColumns: `repeat(${yillar.length}, minmax(0, 1fr))`, maxWidth: 80 * yillar.length }} role="tablist" aria-label="Yıl">
          {yillar.map((y) => (
            <button key={y} type="button" role="tab" aria-selected={yil === y} data-aktif={yil === y} onClick={() => setYil(y)}>
              {y}
            </button>
          ))}
        </div>
        {eklenebilir && (
          <button type="button" className="btn btn-ana" onClick={() => setFormAcik(true)}>
            <Ikon ad="arti" boyut={16} />
            Tatil ekle
          </button>
        )}
      </div>

      {eksikler.length > 0 && (
        <div className="panel flex flex-wrap items-center gap-3 px-5 py-4" style={{ borderColor: "var(--uyari)" }}>
          <Ikon ad="uyari" boyut={18} className="flex-none" />
          <p className="m1 min-w-[220px] flex-1 text-sm">
            {yil} Türkiye geneli listesinde <strong>{eksikler.length} gün eksik</strong>
            {bayramVar ? "" : " (yalnızca sabit tatiller; bu yılın bayram tarihleri henüz uygulamada tanımlı değil, elle ekleyin)"}.
            Eksik günlerde puantaj ve izin günü hesabı yanlış çıkar.
          </p>
          {sistemYoneticisi ? (
            <button type="button" className="btn btn-ikincil btn-kucuk" onClick={hazirListeyiEkle} disabled={ekleniyor}>
              {ekleniyor ? "Ekleniyor..." : "Eksik günleri ekle"}
            </button>
          ) : (
            <span className="m3 text-xs">Sistem yöneticisine bildirin.</span>
          )}
        </div>
      )}

      <div className="panel overflow-hidden">
        {yilinTatilleri.length === 0 ? (
          <Bos ikon="takvim" baslik={`${yil} için tatil yok`} metin="Resmi tatiller puantajda tatil, izin hesabında çalışılmayan gün sayılır." />
        ) : (
          <ul className="liste">
            {yilinTatilleri.map((t) => {
              const silinebilir = t.firma_id ? firmaDuzenleyebilir : sistemYoneticisi;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="w-24 flex-none">
                    <p className="sayi m1 font-semibold">{kisaTarih(t.tarih)}</p>
                    <p className="m3 text-xs">{GUN_ADLARI[haftaGunu(t.tarih)]}</p>
                  </div>
                  <p className="m1 min-w-[180px] flex-1 text-sm font-medium">{t.ad}</p>
                  {t.yarim_gun && <Rozet ton="uyari">Yarım gün (13:00 sonrası)</Rozet>}
                  <Rozet ton={t.firma_id ? "izin" : "notr"}>{t.firma_id ? "Firmaya özel" : "Türkiye geneli"}</Rozet>
                  {silinebilir && (
                    <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => sil(t)} aria-label={`${t.ad} sil`}>
                      <Ikon ad="cop" boyut={15} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="m3 text-xs">
        Yarım gün (arife) öğleden önce iş günü sayılır; izinde yarım gün düşülür. Firmaya özel tatil (ör. şirket tatili) yalnızca
        firmanızda geçerlidir.
      </p>

      {formAcik && (
        <TatilFormu
          sistemYoneticisi={sistemYoneticisi}
          firmaDuzenleyebilir={firmaDuzenleyebilir}
          onKapat={() => setFormAcik(false)}
          onKayit={async () => {
            setFormAcik(false);
            await onKayit();
          }}
        />
      )}
    </div>
  );
}

function TatilFormu({
  sistemYoneticisi,
  firmaDuzenleyebilir,
  onKapat,
  onKayit,
}: {
  sistemYoneticisi: boolean;
  firmaDuzenleyebilir: boolean;
  onKapat: () => void;
  onKayit: () => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [tarih, setTarih] = useState(yerelTarih());
  const [ad, setAd] = useState("");
  const [yarim, setYarim] = useState(false);
  const [kapsam, setKapsam] = useState<"firma" | "ortak">(firmaDuzenleyebilir ? "firma" : "ortak");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (ad.trim().length < 2) return bildir("Tatil adı en az 2 karakter olmalı.", "hata");
    setYukleniyor(true);
    try {
      if (kapsam === "ortak") {
        const s = await ortakIslem({ islem: "ekle", tatiller: [{ tarih, ad: ad.trim(), yarim_gun: yarim }] });
        if (!s.eklenen) throw new Error("Bu tarihte Türkiye geneli bir tatil zaten var.");
      } else {
        const { error } = await supabase.from("resmi_tatiller").insert({ tarih, ad: ad.trim(), yarim_gun: yarim });
        if (error) throw error.code === "23505" ? new Error("Bu tarihte firmanızın bir tatili zaten var.") : error;
      }
      bildir("Tatil eklendi.", "basari");
      await onKayit();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Tatil ekle">
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="tatilTarih">
            Tarih
          </label>
          <input id="tatilTarih" className="girdi sayi" type="date" required value={tarih} onChange={(e) => setTarih(e.target.value)} />
        </div>
        <div>
          <label className="etiket" htmlFor="tatilAd">
            Ad
          </label>
          <input
            id="tatilAd"
            className="girdi"
            required
            maxLength={120}
            placeholder="ör. Şirket tatili"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
          />
        </div>
        <label className="m1 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={yarim} onChange={(e) => setYarim(e.target.checked)} />
          Yarım gün (13:00&apos;ten sonra tatil, ör. arife)
        </label>
        {sistemYoneticisi && firmaDuzenleyebilir && (
          <div>
            <p className="etiket">Kapsam</p>
            <div className="segment" style={{ maxWidth: 360 }} role="radiogroup" aria-label="Kapsam">
              <button type="button" role="radio" aria-checked={kapsam === "firma"} data-aktif={kapsam === "firma"} onClick={() => setKapsam("firma")}>
                Yalnızca firmam
              </button>
              <button type="button" role="radio" aria-checked={kapsam === "ortak"} data-aktif={kapsam === "ortak"} onClick={() => setKapsam("ortak")}>
                Türkiye geneli
              </button>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ikincil" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Kaydediliyor..." : "Ekle"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
