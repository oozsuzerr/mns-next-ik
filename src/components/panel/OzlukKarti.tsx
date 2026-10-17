"use client";

// Personelin özlük bilgileri ve belgeleri (yalnızca genel yönetici; veritabanı da denetler).
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import {
  BELGE_KOVASI,
  BELGE_MAKS_BAYT,
  BELGE_TURLERI,
  BELGE_TURLERI_MIME,
  CALISMA_SEKILLERI,
  EGITIM_DURUMLARI,
  UCRET_TURLERI,
  hataYaz,
  type Personel,
  type PersonelBelge,
  type PersonelOzluk,
} from "../../lib/tipler";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { Avatar, Bos, Ikon, Iskelet, Modal, Rozet, useBildirim } from "../ui";

type Alanlar = Omit<PersonelOzluk, "personel_id" | "ucret"> & { ucret: string };

const BOS_FORM: Alanlar = {
  telefon: "",
  eposta: "",
  adres: "",
  unvan: "",
  calisma_sekli: "",
  egitim: "",
  acil_kisi: "",
  acil_yakinlik: "",
  acil_telefon: "",
  ucret: "",
  ucret_turu: "",
  iban: "",
  notlar: "",
};

function tabloYok(err: unknown): boolean {
  return /personel_(ozluk|belgeleri)|bucket not found|could not find|does not exist/i.test(hataYaz(err));
}

/** "TR12 0006 ..." -> "TR120006..." */
function ibanTemizle(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

function boyutYaz(bayt: number | null): string {
  if (!bayt) return "";
  return bayt >= 1024 * 1024 ? `${(bayt / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bayt / 1024))} KB`;
}

export default function OzlukKarti({ hedef, onKapat }: { hedef: Personel; onKapat: () => void }) {
  const [sekme, setSekme] = useState<"bilgi" | "belge">("bilgi");
  return (
    <Modal onKapat={onKapat} baslik="Özlük dosyası" genis>
      <div className="mb-4 flex items-center gap-3">
        <Avatar ad={hedef.ad} soyad={hedef.soyad} boyut={40} />
        <div>
          <p className="m1 font-semibold">
            {hedef.ad} {hedef.soyad}
          </p>
          <p className="m3 text-xs">
            {hedef.sicil_no} · {hedef.subeler?.ad ?? "Şube atanmamış"}
          </p>
        </div>
      </div>
      <div className="segment mb-4" style={{ maxWidth: 360 }} role="tablist" aria-label="Özlük bölümü">
        <button type="button" role="tab" aria-selected={sekme === "bilgi"} data-aktif={sekme === "bilgi"} onClick={() => setSekme("bilgi")}>
          Özlük bilgileri
        </button>
        <button type="button" role="tab" aria-selected={sekme === "belge"} data-aktif={sekme === "belge"} onClick={() => setSekme("belge")}>
          Belgeler
        </button>
      </div>
      {sekme === "bilgi" ? <OzlukFormu hedef={hedef} onKapat={onKapat} /> : <Belgeler hedef={hedef} />}
    </Modal>
  );
}

function OzlukFormu({ hedef, onKapat }: { hedef: Personel; onKapat: () => void }) {
  const { bildir } = useBildirim();
  const [f, setF] = useState<Alanlar>(BOS_FORM);
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    supabase
      .from("personel_ozluk")
      .select("*")
      .eq("personel_id", hedef.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setDurum(tabloYok(error) ? "kurulmamis" : "hazir");
          if (!tabloYok(error)) bildir(hataYaz(error), "hata");
          return;
        }
        if (data) {
          const o = data as PersonelOzluk;
          setF({
            ...BOS_FORM,
            ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? ""])),
            ucret: o.ucret != null ? String(o.ucret) : "",
          } as Alanlar);
        }
        setDurum("hazir");
      });
  }, [hedef.id, bildir]);

  const alan = (k: keyof Alanlar) => ({
    value: f[k] ?? "",
    onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }),
  });

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    const iban = f.iban ? ibanTemizle(f.iban) : "";
    if (iban && !/^TR[0-9]{24}$/.test(iban)) return bildir("IBAN TR ile başlayan 26 karakter olmalı.", "hata");
    const ucret = f.ucret.trim() ? Number(f.ucret.replace(/\./g, "").replace(",", ".")) : null;
    if (ucret != null && (!Number.isFinite(ucret) || ucret < 0)) return bildir("Ücret geçerli bir sayı olmalı.", "hata");
    const bosaNull = (v: string | null) => (v && v.trim() ? v.trim() : null);
    setKaydediliyor(true);
    try {
      const { error } = await supabase.from("personel_ozluk").upsert(
        {
          personel_id: hedef.id,
          telefon: bosaNull(f.telefon),
          eposta: bosaNull(f.eposta),
          adres: bosaNull(f.adres),
          unvan: bosaNull(f.unvan),
          calisma_sekli: bosaNull(f.calisma_sekli),
          egitim: bosaNull(f.egitim),
          acil_kisi: bosaNull(f.acil_kisi),
          acil_yakinlik: bosaNull(f.acil_yakinlik),
          acil_telefon: bosaNull(f.acil_telefon),
          ucret,
          ucret_turu: bosaNull(f.ucret_turu),
          iban: iban || null,
          notlar: bosaNull(f.notlar),
          guncelleme: new Date().toISOString(),
        },
        { onConflict: "personel_id" }
      );
      if (error) throw error;
      bildir("Özlük bilgileri kaydedildi.", "basari");
      onKapat();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setKaydediliyor(false);
    }
  }

  if (durum === "yukleniyor") return <Iskelet yukseklik={180} />;
  if (durum === "kurulmamis") return <KurulumYok />;

  return (
    <form onSubmit={kaydet} className="space-y-5">
      <Bolum baslik="İletişim">
        <Girdi etiket="Telefon" tip="tel" {...alan("telefon")} />
        <Girdi etiket="E-posta" tip="email" {...alan("eposta")} />
        <div className="sm:col-span-2">
          <label className="etiket">Adres</label>
          <textarea className="girdi" rows={2} maxLength={500} {...alan("adres")} />
        </div>
      </Bolum>

      <Bolum baslik="İş">
        <Girdi etiket="Unvan / görev" {...alan("unvan")} />
        <Secim etiket="Çalışma şekli" secenekler={CALISMA_SEKILLERI} {...alan("calisma_sekli")} />
        <Secim etiket="Eğitim durumu" secenekler={EGITIM_DURUMLARI} {...alan("egitim")} />
      </Bolum>

      <Bolum baslik="Ücret">
        <Girdi etiket="Tutar (TL)" tip="text" inputMode="decimal" {...alan("ucret")} />
        <Secim etiket="Ücret türü" secenekler={UCRET_TURLERI} {...alan("ucret_turu")} />
        <div className="sm:col-span-2">
          <label className="etiket">IBAN</label>
          <input className="girdi sayi" placeholder="TR00 0000 0000 0000 0000 0000 00" maxLength={34} {...alan("iban")} />
        </div>
      </Bolum>

      <Bolum baslik="Acil durumda aranacak kişi">
        <Girdi etiket="Ad soyad" {...alan("acil_kisi")} />
        <Girdi etiket="Yakınlığı" {...alan("acil_yakinlik")} />
        <Girdi etiket="Telefon" tip="tel" {...alan("acil_telefon")} />
      </Bolum>

      <div>
        <label className="etiket">Notlar</label>
        <textarea className="girdi" rows={3} maxLength={2000} {...alan("notlar")} />
      </div>

      <p className="m3 text-xs">Bu bilgileri yalnızca genel yöneticiler görür. Değişiklikler işlem geçmişine kaydedilir.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ikincil" onClick={onKapat}>
          Vazgeç
        </button>
        <button type="submit" className="btn btn-ana" disabled={kaydediliyor}>
          {kaydediliyor ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </form>
  );
}

function Belgeler({ hedef }: { hedef: Personel }) {
  const { bildir, onayla } = useBildirim();
  const [belgeler, setBelgeler] = useState<PersonelBelge[]>([]);
  const [durum, setDurum] = useState<"yukleniyor" | "hazir" | "kurulmamis">("yukleniyor");
  const [tur, setTur] = useState<string>(BELGE_TURLERI[0]);
  const [bitis, setBitis] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const dosyaRef = useRef<HTMLInputElement>(null);

  const getir = useCallback(
    () =>
      Promise.resolve(
        supabase.from("personel_belgeleri").select("*").eq("personel_id", hedef.id).order("created_at", { ascending: false })
      ).then(({ data, error }) => {
        if (error) {
          setDurum(tabloYok(error) ? "kurulmamis" : "hazir");
          if (!tabloYok(error)) bildir(hataYaz(error), "hata");
          return;
        }
        setBelgeler((data ?? []) as PersonelBelge[]);
        setDurum("hazir");
      }),
    [hedef.id, bildir]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  async function yukle(e: FormEvent) {
    e.preventDefault();
    const dosya = dosyaRef.current?.files?.[0];
    if (!dosya) return bildir("Bir dosya seçin.", "hata");
    if (dosya.size > BELGE_MAKS_BAYT) return bildir("Dosya en fazla 10 MB olabilir.", "hata");
    if (dosya.type && !BELGE_TURLERI_MIME.includes(dosya.type)) return bildir("Yalnızca PDF ve resim (JPG, PNG, WEBP, HEIC) yüklenebilir.", "hata");
    if (!hedef.firma_id) return bildir("Personelin firma bilgisi okunamadı; sayfayı yenileyin.", "hata");

    // Dosya adı: Türkçe karakterler sadeleşir, yol güvenli kalır
    const temizAd = dosya.name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(-80);
    const yol = `${hedef.firma_id}/${hedef.id}/${crypto.randomUUID()}-${temizAd}`;

    setYukleniyor(true);
    try {
      const { error: depoHata } = await supabase.storage.from(BELGE_KOVASI).upload(yol, dosya, { contentType: dosya.type || undefined, upsert: false });
      if (depoHata) throw depoHata;
      const { error } = await supabase.from("personel_belgeleri").insert({
        personel_id: hedef.id,
        tur,
        ad: dosya.name.slice(0, 200),
        dosya_yolu: yol,
        boyut: dosya.size,
        mime: dosya.type || null,
        gecerlilik_bitis: bitis || null,
        aciklama: aciklama.trim() || null,
      });
      if (error) {
        // Kayıt açılamadıysa yüklenen dosya sahipsiz kalmasın
        await supabase.storage.from(BELGE_KOVASI).remove([yol]);
        throw error;
      }
      bildir("Belge yüklendi.", "basari");
      if (dosyaRef.current) dosyaRef.current.value = "";
      setBitis("");
      setAciklama("");
      await getir();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  async function ac(b: PersonelBelge) {
    const { data, error } = await supabase.storage.from(BELGE_KOVASI).createSignedUrl(b.dosya_yolu, 60);
    if (error || !data) return bildir(hataYaz(error ?? "Bağlantı oluşturulamadı."), "hata");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function sil(b: PersonelBelge) {
    const tamam = await onayla({ baslik: `"${b.ad}" silinsin mi?`, metin: "Dosya kalıcı olarak silinir.", onayEtiketi: "Sil", tehlikeli: true });
    if (!tamam) return;
    try {
      const { error } = await supabase.from("personel_belgeleri").delete().eq("id", b.id);
      if (error) throw error;
      await supabase.storage.from(BELGE_KOVASI).remove([b.dosya_yolu]);
      bildir("Belge silindi.", "basari");
      await getir();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    }
  }

  if (durum === "yukleniyor") return <Iskelet yukseklik={180} />;
  if (durum === "kurulmamis") return <KurulumYok />;

  const bugun = yerelTarih();
  return (
    <div className="space-y-4">
      <form onSubmit={yukle} className="panel-ic grid gap-3 p-4 sm:grid-cols-2">
        <div>
          <label className="etiket">Belge türü</label>
          <select className="girdi" value={tur} onChange={(e) => setTur(e.target.value)}>
            {BELGE_TURLERI.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="etiket">Geçerlilik bitişi (isteğe bağlı)</label>
          <input className="girdi sayi" type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="etiket">Dosya (PDF ya da resim, en fazla 10 MB)</label>
          <input ref={dosyaRef} className="girdi" type="file" accept=".pdf,image/*" required />
        </div>
        <div className="sm:col-span-2">
          <label className="etiket">Açıklama (isteğe bağlı)</label>
          <input className="girdi" maxLength={500} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
            <Ikon ad="arti" boyut={16} />
            {yukleniyor ? "Yükleniyor..." : "Belge yükle"}
          </button>
        </div>
      </form>

      <div className="panel overflow-hidden">
        {belgeler.length === 0 ? (
          <Bos ikon="rapor" baslik="Belge yok" metin="Sözleşme, kimlik, diploma, rapor gibi belgeleri buradan yükleyin." />
        ) : (
          <ul className="liste">
            {belgeler.map((b) => {
              const doldu = !!b.gecerlilik_bitis && b.gecerlilik_bitis < bugun;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <div className="min-w-[200px] flex-1">
                    <p className="m1 truncate text-sm font-semibold">{b.ad}</p>
                    <p className="m3 text-xs">
                      {kisaTarih(yerelTarih(b.created_at))} · {boyutYaz(b.boyut)}
                      {b.aciklama ? ` · ${b.aciklama}` : ""}
                    </p>
                  </div>
                  <Rozet ton="notr">{b.tur}</Rozet>
                  {b.gecerlilik_bitis && (
                    <Rozet ton={doldu ? "hata" : "uyari"}>
                      {doldu ? "Süresi doldu" : "Bitiş"} {kisaTarih(b.gecerlilik_bitis)}
                    </Rozet>
                  )}
                  <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => ac(b)}>
                    <Ikon ad="goz" boyut={14} />
                    Aç
                  </button>
                  <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => sil(b)} aria-label={`${b.ad} sil`}>
                    <Ikon ad="cop" boyut={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="m3 text-xs">Dosyalar gizli depoda tutulur; &quot;Aç&quot; bağlantısı 60 saniye geçerlidir. Belgeleri yalnızca genel yöneticiler görür.</p>
    </div>
  );
}

function KurulumYok() {
  return (
    <Bos
      ikon="uyari"
      baslik="Özlük modülü henüz kurulmamış"
      metin="Veritabanında özlük ve belge tabloları yok. Sistem yöneticisinin 2026-10-17_ozluk_belge.sql dosyasını çalıştırması gerekiyor."
    />
  );
}

function Bolum({ baslik, children }: { baslik: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="m1 mb-2 text-sm font-semibold">{baslik}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Girdi({
  etiket,
  tip = "text",
  inputMode,
  value,
  onChange,
}: {
  etiket: string;
  tip?: string;
  inputMode?: "decimal" | "tel" | "email" | "text";
  value: string;
  onChange: (e: { target: { value: string } }) => void;
}) {
  return (
    <div>
      <label className="etiket">{etiket}</label>
      <input className="girdi" type={tip} inputMode={inputMode} maxLength={200} value={value} onChange={onChange} />
    </div>
  );
}

function Secim({
  etiket,
  secenekler,
  value,
  onChange,
}: {
  etiket: string;
  secenekler: readonly string[];
  value: string;
  onChange: (e: { target: { value: string } }) => void;
}) {
  return (
    <div>
      <label className="etiket">{etiket}</label>
      <select className="girdi" value={value} onChange={onChange}>
        <option value="">Seçilmedi</option>
        {secenekler.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
