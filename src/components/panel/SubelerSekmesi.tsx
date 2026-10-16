"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz, type Personel, type Sube } from "../../lib/tipler";
import { googleHaritaAdresi, haritaAdresi, koordinatAyikla, type Nokta } from "../../lib/konum";
import { Bos, Ikon, Modal, Rozet, useBildirim } from "../ui";

const VARSAYILAN_SINIR = 100;
const SINIR_MIN = 30;
const SINIR_MAX = 1000;

export default function SubelerSekmesi({
  subeler,
  personeller,
  duzenlenebilir,
  onKayit,
}: {
  subeler: Sube[];
  personeller: Personel[];
  /** Yalnızca genel yönetici ekler, düzenler, siler */
  duzenlenebilir: boolean;
  onKayit: () => Promise<void> | void;
}) {
  const { bildir, onayla } = useBildirim();
  const [form, setForm] = useState<{ duzenlenen: Sube | null } | null>(null);

  const personelSayisi = (id: string) => personeller.filter((p) => p.aktif && p.varsayilan_sube_id === id).length;

  async function sil(s: Sube) {
    const bagli = personeller.filter((p) => p.varsayilan_sube_id === s.id).length;
    if (bagli > 0) {
      return bildir(`"${s.ad}" şubesinde ${bagli} personel kayıtlı. Önce personeli başka şubeye taşıyın.`, "hata");
    }
    const tamam = await onayla({
      baslik: `"${s.ad}" şubesi silinsin mi?`,
      metin: "Bu şubede geçmiş giriş/çıkış kaydı varsa silinemez; geçmiş kayıtlar korunur.",
      onayEtiketi: "Sil",
      tehlikeli: true,
    });
    if (!tamam) return;
    const { error } = await supabase.from("subeler").delete().eq("id", s.id);
    if (error) {
      // 23503: başka tablodan (hareketler, personeller) bu şubeye bağlı kayıt var
      return bildir(
        error.code === "23503"
          ? `"${s.ad}" şubesinde geçmiş giriş/çıkış kaydı olduğu için silinemez. Adını değiştirebilir ya da konumunu güncelleyebilirsiniz.`
          : `Silinemedi: ${hataYaz(error)}`,
        "hata"
      );
    }
    bildir("Şube silindi.", "basari");
    await onKayit();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m2 max-w-2xl text-sm">
          Personel giriş/çıkışta en yakın şubeye göre denetlenir: telefonun konumu şubenin sınırı içindeyse kayıt alınır.
        </p>
        {duzenlenebilir && (
          <button type="button" className="btn btn-ana" onClick={() => setForm({ duzenlenen: null })}>
            <Ikon ad="arti" boyut={16} />
            Yeni şube
          </button>
        )}
      </div>

      <div className="panel overflow-hidden">
        {subeler.length === 0 ? (
          <Bos
            ikon="konum"
            baslik="Henüz şube yok"
            metin="Personel eklemeden ve giriş/çıkış başlamadan önce en az bir şube ve konumunu tanımlayın."
          >
            {duzenlenebilir && (
              <button type="button" className="btn btn-ana" onClick={() => setForm({ duzenlenen: null })}>
                İlk şubeyi ekle
              </button>
            )}
          </Bos>
        ) : (
          <ul className="liste">
            {subeler.map((s) => {
              const sayi = personelSayisi(s.id);
              const nokta = { enlem: Number(s.enlem), boylam: Number(s.boylam) };
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                  <span className="bos-ikon flex h-10 w-10 flex-none items-center justify-center rounded-full">
                    <Ikon ad="konum" boyut={18} />
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <p className="m1 font-semibold">{s.ad}</p>
                    <p className="m3 sayi mt-0.5 text-xs">
                      {nokta.enlem.toFixed(5)}, {nokta.boylam.toFixed(5)} ·{" "}
                      <a href={googleHaritaAdresi(nokta)} target="_blank" rel="noopener noreferrer" className="underline">
                        Haritada aç
                      </a>
                    </p>
                  </div>
                  <Rozet ton="notr">Sınır {s.limit_metre ?? VARSAYILAN_SINIR} m</Rozet>
                  <Rozet ton={sayi > 0 ? "giris" : "notr"}>{sayi} personel</Rozet>
                  {duzenlenebilir && (
                    <div className="flex gap-1">
                      <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setForm({ duzenlenen: s })}>
                        Düzenle
                      </button>
                      <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => sil(s)} aria-label={`${s.ad} şubesini sil`}>
                        <Ikon ad="cop" boyut={15} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form && (
        <SubeFormu
          duzenlenen={form.duzenlenen}
          onKapat={() => setForm(null)}
          onKayit={async () => {
            setForm(null);
            await onKayit();
          }}
        />
      )}
    </div>
  );
}

function SubeFormu({
  duzenlenen,
  onKapat,
  onKayit,
}: {
  duzenlenen: Sube | null;
  onKapat: () => void;
  onKayit: () => Promise<void>;
}) {
  const { bildir } = useBildirim();
  const [ad, setAd] = useState(duzenlenen?.ad ?? "");
  const [sinir, setSinir] = useState(duzenlenen?.limit_metre ?? VARSAYILAN_SINIR);
  const [nokta, setNokta] = useState<Nokta | null>(
    duzenlenen ? { enlem: Number(duzenlenen.enlem), boylam: Number(duzenlenen.boylam) } : null
  );
  const [yapistirilan, setYapistirilan] = useState("");
  const [konumDurumu, setKonumDurumu] = useState<string | null>(null);
  const [aliniyor, setAliniyor] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);

  function bulundugumKonum() {
    if (!navigator.geolocation) return setKonumDurumu("Bu tarayıcı konum vermiyor; koordinatı yapıştırın.");
    setAliniyor(true);
    setKonumDurumu("Konum alınıyor...");
    navigator.geolocation.getCurrentPosition(
      (k) => {
        setAliniyor(false);
        setNokta({ enlem: Math.round(k.coords.latitude * 1e7) / 1e7, boylam: Math.round(k.coords.longitude * 1e7) / 1e7 });
        const sapma = Math.round(k.coords.accuracy);
        setKonumDurumu(
          sapma > 50
            ? `Konum alındı ama yaklaşık ${sapma} m sapma var. Şubenin içindeyseniz birkaç saniye sonra tekrar deneyin ya da koordinatı yapıştırın.`
            : `Konum alındı (yaklaşık ${sapma} m sapma).`
        );
      },
      (h) => {
        setAliniyor(false);
        setKonumDurumu(
          h.code === h.PERMISSION_DENIED
            ? "Konum izni verilmedi. Tarayıcının adres çubuğundan izin verin ya da koordinatı yapıştırın."
            : "Konum alınamadı. Koordinatı yapıştırabilirsiniz."
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  function yapistir(metin: string) {
    setYapistirilan(metin);
    if (!metin.trim()) return setKonumDurumu(null);
    const sonuc = koordinatAyikla(metin);
    if (sonuc === "KISA_BAGLANTI") {
      setKonumDurumu("Kısa bağlantı (maps.app.goo.gl) okunamıyor. Haritada şubenin üstüne sağ tıklayıp çıkan koordinatı kopyalayın.");
    } else if (!sonuc) {
      setKonumDurumu("Koordinat anlaşılamadı. Örnek: 41.0082, 28.9784");
    } else {
      setNokta(sonuc);
      setKonumDurumu("Koordinat alındı.");
    }
  }

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (ad.trim().length < 2) return bildir("Şube adı en az 2 karakter olmalı.", "hata");
    if (!nokta) return bildir("Şubenin konumunu belirleyin.", "hata");
    if (!(sinir >= SINIR_MIN && sinir <= SINIR_MAX)) return bildir(`Sınır ${SINIR_MIN}-${SINIR_MAX} metre olmalı.`, "hata");
    setYukleniyor(true);
    try {
      const kayit = { ad: ad.trim(), enlem: nokta.enlem, boylam: nokta.boylam, limit_metre: Math.round(sinir) };
      const { error } = duzenlenen
        ? await supabase.from("subeler").update(kayit).eq("id", duzenlenen.id)
        : await supabase.from("subeler").insert(kayit);
      if (error) throw error;
      bildir(duzenlenen ? "Şube güncellendi." : "Şube eklendi.", "basari");
      await onKayit();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik={duzenlenen ? "Şubeyi düzenle" : "Yeni şube"} genis>
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket" htmlFor="subeAd">
            Şube adı
          </label>
          <input id="subeAd" className="girdi" required maxLength={80} value={ad} onChange={(e) => setAd(e.target.value)} />
        </div>

        <div className="space-y-3">
          <p className="etiket">Konum</p>
          <button type="button" className="btn btn-ikincil w-full sm:w-auto" onClick={bulundugumKonum} disabled={aliniyor}>
            <Ikon ad="konum" boyut={16} />
            {aliniyor ? "Konum alınıyor..." : "Bulunduğum konumu kullan"}
          </button>
          <div>
            <label className="m2 mb-1 block text-xs" htmlFor="koordinat">
              ya da koordinatı veya Google Haritalar bağlantısını yapıştırın
            </label>
            <input
              id="koordinat"
              className="girdi sayi"
              placeholder="41.0082, 28.9784"
              value={yapistirilan}
              onChange={(e) => yapistir(e.target.value)}
            />
            <p className="ipucu">Google Haritalar&apos;da şubenin üstüne sağ tıklayın, en üstte çıkan koordinata tıklayınca kopyalanır.</p>
          </div>
          {konumDurumu && <p className="m2 text-sm">{konumDurumu}</p>}

          {nokta ? (
            <div className="panel-ic overflow-hidden">
              <iframe
                title="Şube konumu önizleme"
                src={haritaAdresi(nokta, sinir)}
                className="block h-56 w-full border-0"
                loading="lazy"
              />
              <p className="m3 sayi flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <span>
                  {nokta.enlem.toFixed(6)}, {nokta.boylam.toFixed(6)}
                </span>
                <a href={googleHaritaAdresi(nokta)} target="_blank" rel="noopener noreferrer" className="underline">
                  Google Haritalar&apos;da kontrol et
                </a>
              </p>
            </div>
          ) : (
            <p className="m3 text-sm">Henüz konum seçilmedi.</p>
          )}
        </div>

        <div>
          <label className="etiket" htmlFor="sinir">
            Giriş/çıkış sınırı (metre)
          </label>
          <input
            id="sinir"
            className="girdi sayi"
            type="number"
            min={SINIR_MIN}
            max={SINIR_MAX}
            step={10}
            value={sinir}
            onChange={(e) => setSinir(Number(e.target.value))}
          />
          <p className="ipucu">
            Telefon konumu bu yarıçapın içindeyse kayıt alınır. Kapalı alanlarda GPS sapabildiği için 100 m önerilir.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ikincil" onClick={onKapat}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            {yukleniyor ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
