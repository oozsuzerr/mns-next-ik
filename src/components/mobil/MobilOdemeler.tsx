"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { olayBildir } from "../../lib/bildirim";
import { gunEkle } from "../../lib/vardiyaPlani";
import { Ikon, Modal, useBildirim } from "../ui";
import { DURUM_ADI, MASRAF_KATEGORILERI, tl, tutarOku, type OdemeTalebi } from "../../lib/odeme";

type MobilOdeme = Pick<OdemeTalebi, "id" | "tur" | "tutar" | "tarih" | "kategori" | "aciklama" | "durum" | "karar_notu" | "odeme_tarihi" | "created_at"> & {
  fis_var: boolean;
};

const HATALAR: Record<string, string> = {
  TUTAR_GECERSIZ: "Tutar geçersiz.",
  TARIH_GECERSIZ: "Tarih geçersiz. Masraf son 60 gün içinde, avans bugünden itibaren olmalı.",
  KATEGORI_GECERSIZ: "Masraf türünü seçin.",
  COK_FAZLA_BEKLEYEN: "Onay bekleyen 10 talebiniz var. Sonuçlanmalarını bekleyin.",
  BELGE_GECERSIZ: "Fiş yüklenemedi, tekrar deneyin.",
  OTURUM_GECERSIZ: "Oturum süresi doldu. Tekrar giriş yapın.",
  TUR_GECERSIZ: "Fiş yalnızca fotoğraf ya da PDF olabilir.",
  BOYUT_GECERSIZ: "Fiş en fazla 5 MB olabilir.",
  COK_FAZLA_YUKLEME: "Çok sayıda fiş yüklendi. Bir saat sonra tekrar deneyin.",
};

/** Telefon fotoğrafını küçültür (en uzun kenar 1600 px, JPEG); küçültülemezse dosyayı olduğu gibi döner */
async function fisHazirla(dosya: File): Promise<Blob> {
  if (!dosya.type.startsWith("image/")) return dosya;
  try {
    const resim = await createImageBitmap(dosya);
    const oran = Math.min(1, 1600 / Math.max(resim.width, resim.height));
    const tuval = document.createElement("canvas");
    tuval.width = Math.round(resim.width * oran);
    tuval.height = Math.round(resim.height * oran);
    tuval.getContext("2d")?.drawImage(resim, 0, 0, tuval.width, tuval.height);
    const blob = await new Promise<Blob | null>((coz) => tuval.toBlob(coz, "image/jpeg", 0.8));
    return blob ?? dosya;
  } catch {
    return dosya;
  }
}

/** Personelin avans isteği ve masraf bildirimi. Veritabanında bölüm kurulu değilse hiçbir şey göstermez. */
export default function MobilOdemeler({ token }: { token: string }) {
  const { bildir } = useBildirim();
  const [liste, setListe] = useState<MobilOdeme[] | null>(null);
  const [acik, setAcik] = useState(false);

  const getir = useCallback(
    () =>
      Promise.resolve(supabase.rpc("mobil_odemeler", { p_token: token })).then(({ data, error }) => {
        if (!error) setListe((data ?? []) as MobilOdeme[]);
      }),
    [token]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  if (!liste) return null;

  return (
    <>
      <button type="button" onClick={() => setAcik(true)} className="panel flex w-full items-center gap-3 p-4 text-left">
        <span className="bos-ikon flex h-10 w-10 items-center justify-center rounded-full">
          <Ikon ad="rapor" />
        </span>
        <span className="flex-1">
          <span className="m1 block font-semibold">Avans iste / masraf bildir</span>
          <span className="m3 block text-xs">Masraf fişinin fotoğrafını ekleyin, yöneticinizin onayına gider.</span>
        </span>
        <Ikon ad="sag" className="m3" />
      </button>

      {liste.length > 0 && (
        <section>
          <h2 className="baslik-font m1 mb-2 px-1 text-lg">Avans ve masraflarım</h2>
          <ul className="panel liste overflow-hidden">
            {liste.slice(0, 6).map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="m1 block truncate text-sm font-semibold">
                    {o.tur} · <span className="sayi">{tl(o.tutar)}</span>
                  </span>
                  <span className="m3 block text-xs">
                    {kisaTarih(o.tarih)}
                    {o.kategori ? ` · ${o.kategori}` : ""}
                    {o.fis_var ? " · fişli" : ""}
                  </span>
                  {o.karar_notu && (
                    <span className="mt-0.5 block text-xs" style={{ color: o.durum === "REDDEDILDI" ? "var(--hata)" : undefined }}>
                      Amir: {o.karar_notu}
                    </span>
                  )}
                </span>
                <span
                  className={`rozet ${
                    o.durum === "ODENDI" || o.durum === "ONAYLANDI" ? "rozet-giris" : o.durum === "REDDEDILDI" ? "rozet-hata" : "rozet-uyari"
                  }`}
                >
                  {DURUM_ADI[o.durum]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {acik && (
        <TalepFormu
          token={token}
          onKapat={() => setAcik(false)}
          onGonderildi={async () => {
            setAcik(false);
            bildir("Talebiniz yöneticinize gönderildi.", "basari");
            await getir();
          }}
        />
      )}
    </>
  );
}

function TalepFormu({ token, onKapat, onGonderildi }: { token: string; onKapat: () => void; onGonderildi: () => Promise<void> }) {
  const { bildir } = useBildirim();
  const bugun = yerelTarih();
  const [tur, setTur] = useState<"Masraf" | "Avans">("Masraf");
  const [tutar, setTutar] = useState("");
  const [tarih, setTarih] = useState(bugun);
  const [kategori, setKategori] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [dosya, setDosya] = useState<File | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  async function gonder(e: FormEvent) {
    e.preventDefault();
    const sayi = tutarOku(tutar);
    if (sayi == null || sayi <= 0) return bildir("Tutarı girin (ör. 350 ya da 350,50).", "hata");
    if (tur === "Masraf" && !kategori) return bildir("Masraf türünü seçin.", "hata");
    if (tur === "Avans" && aciklama.trim().length < 3) return bildir("Avansın nedenini kısaca yazın.", "hata");
    setGonderiliyor(true);
    try {
      let yol: string | null = null;
      if (tur === "Masraf" && dosya) {
        const govde = new FormData();
        govde.append("token", token);
        const hazir = await fisHazirla(dosya);
        govde.append("dosya", hazir, hazir.type === "image/jpeg" ? "fis.jpg" : dosya.name);
        const cevap = await fetch("/api/mobil/fis", { method: "POST", body: govde });
        const sonuc = (await cevap.json().catch(() => ({}))) as { yol?: string; hata?: string };
        if (!cevap.ok || !sonuc.yol) throw new Error(HATALAR[sonuc.hata ?? ""] ?? "Fiş yüklenemedi. İnternet bağlantınızı kontrol edin.");
        yol = sonuc.yol;
      }
      const { data, error } = await supabase.rpc("odeme_talep_olustur", {
        p_token: token,
        p_tur: tur,
        p_tutar: Math.round(sayi * 100) / 100,
        p_tarih: tarih,
        p_kategori: tur === "Masraf" ? kategori : null,
        p_aciklama: aciklama.trim() || null,
        p_belge_yolu: yol,
      });
      if (error) throw new Error(error.message.includes("OTURUM_GECERSIZ") ? HATALAR.OTURUM_GECERSIZ : "Gönderilemedi. İnternet bağlantınızı kontrol edin.");
      if (!data?.ok) throw new Error(HATALAR[data?.hata] ?? "Gönderilemedi.");
      olayBildir({ olay: "odeme", token });
      await onGonderildi();
    } catch (err) {
      bildir(err instanceof Error ? err.message : String(err), "hata");
    } finally {
      setGonderiliyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik={tur === "Avans" ? "Avans iste" : "Masraf bildir"}>
      <form onSubmit={gonder} className="space-y-4">
        <div className="segment" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }} role="radiogroup" aria-label="Tür">
          {(["Masraf", "Avans"] as const).map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={tur === x}
              data-aktif={tur === x}
              onClick={() => {
                setTur(x);
                setTarih(bugun);
              }}
            >
              {x === "Masraf" ? "Masraf bildir" : "Avans iste"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="etiket" htmlFor="mTutar">
              Tutar (TL)
            </label>
            <input id="mTutar" className="girdi sayi" inputMode="decimal" required placeholder="ör. 350" value={tutar} onChange={(e) => setTutar(e.target.value)} />
          </div>
          <div>
            <label className="etiket" htmlFor="mTarih">
              {tur === "Masraf" ? "Masraf tarihi" : "İstenen tarih"}
            </label>
            <input
              id="mTarih"
              className="girdi sayi"
              type="date"
              required
              min={tur === "Masraf" ? gunEkle(bugun, -60) : bugun}
              max={tur === "Masraf" ? bugun : gunEkle(bugun, 60)}
              value={tarih}
              onChange={(e) => setTarih(e.target.value)}
            />
          </div>
        </div>
        {tur === "Masraf" && (
          <>
            <div>
              <label className="etiket" htmlFor="mKategori">
                Masraf türü
              </label>
              <select id="mKategori" className="girdi" required value={kategori} onChange={(e) => setKategori(e.target.value)}>
                <option value="">Seçin</option>
                {MASRAF_KATEGORILERI.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="etiket" htmlFor="mFis">
                Fiş / fatura fotoğrafı
              </label>
              <input
                id="mFis"
                className="girdi"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
              />
              <p className="m3 mt-1 text-xs">Fişsiz masraf geri ödenmeyebilir.</p>
            </div>
          </>
        )}
        <div>
          <label className="etiket" htmlFor="mAciklama">
            {tur === "Avans" ? "Nedeni" : "Açıklama"}
          </label>
          <textarea
            id="mAciklama"
            className="girdi"
            rows={2}
            maxLength={500}
            placeholder={tur === "Avans" ? "Örn: Kira ödemesi" : "Örn: Müşteri ziyareti taksi"}
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn btn-ikincil flex-1" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana flex-1" disabled={gonderiliyor}>
            {gonderiliyor ? "Gönderiliyor..." : "Onaya gönder"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
