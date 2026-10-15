"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { geciciIstemci, supabase } from "../../lib/supabase";
import { hataYaz, type Sube } from "../../lib/tipler";
import { kisaTarih, yerelTarih } from "../../lib/tarih";
import { Bos, Ikon, Iskelet, Modal, Rozet, useBildirim } from "../ui";

interface Kullanici {
  user_id: string;
  eposta: string | null;
  ad: string | null;
  rol: "GENEL" | "SUBE";
  ben: boolean;
  son_giris: string | null;
  subeler: string[];
}

function kullaniciHatasi(err: unknown): string {
  const metin = hataYaz(err);
  if (metin.includes("KULLANICI_YOK"))
    return "Bu e-postayla bir hesap yok. Geçici şifre girerek yeni hesap oluşturun.";
  if (metin.includes("SUBE_SECILMELI")) return "Şube müdürü için en az bir şube seçin.";
  if (metin.includes("KENDINI_DEGISTIREMEZ")) return "Kendi rolünüzü değiştiremez ya da erişiminizi kaldıramazsınız.";
  if (metin.includes("YETKISIZ")) return "Bu işlem için genel yönetici olmalısınız.";
  if (/yonetici_(listesi|kaydet|kaldir)/.test(metin) && /(could not find|does not exist)/i.test(metin))
    return "Rol tabloları henüz oluşturulmamış. supabase/2026-10-15_sube_muduru_rolleri.sql dosyasını Supabase SQL Editor'de çalıştırın.";
  return metin;
}

export default function PanelKullanicilari({ subeler }: { subeler: Sube[] }) {
  const { bildir, onayla } = useBildirim();
  const [liste, setListe] = useState<Kullanici[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [form, setForm] = useState<Kullanici | "yeni" | null>(null);

  const getir = useCallback(
    () =>
      Promise.resolve(supabase.rpc("yonetici_listesi"))
        .then(({ data, error }) => {
          if (error) throw error;
          setListe((data ?? []) as Kullanici[]);
          setHata(null);
        })
        .catch((err) => setHata(kullaniciHatasi(err)))
        .finally(() => setYukleniyor(false)),
    [setListe, setHata, setYukleniyor]
  );

  useEffect(() => {
    getir();
  }, [getir]);

  const subeAdi = (id: string) => subeler.find((s) => s.id === id)?.ad ?? "Silinmiş şube";

  async function kaldir(k: Kullanici) {
    const tamam = await onayla({
      baslik: `${k.ad || k.eposta} panelden çıkarılsın mı?`,
      metin: "Bu kişi artık panele giremez. Supabase'deki giriş hesabı silinmez; isterseniz daha sonra tekrar ekleyebilirsiniz.",
      onayEtiketi: "Erişimi kaldır",
      tehlikeli: true,
    });
    if (!tamam) return;
    const { error } = await supabase.rpc("yonetici_kaldir", { p_user_id: k.user_id });
    if (error) bildir(kullaniciHatasi(error), "hata");
    else {
      bildir("Panel erişimi kaldırıldı.", "basari");
      getir();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m2 text-sm">
          Şube müdürleri yalnızca atandıkları şubelerin personelini görür; plan, izin onayı, manuel giriş/çıkış ve
          cihaz kilidi açma yapabilir.
        </p>
        <button type="button" className="btn btn-ana btn-kucuk" onClick={() => setForm("yeni")} disabled={!!hata}>
          <Ikon ad="arti" boyut={14} />
          Kullanıcı ekle
        </button>
      </div>

      {hata && (
        <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--hata-acik)", color: "var(--hata)" }} role="alert">
          {hata}
        </div>
      )}

      <div className="panel overflow-hidden">
        {yukleniyor ? (
          <div className="space-y-3 p-5">
            <Iskelet yukseklik={20} />
            <Iskelet yukseklik={20} />
          </div>
        ) : liste.length === 0 ? (
          <Bos ikon="personel" baslik="Kullanıcı yok" metin="Panel kullanıcıları burada listelenir." />
        ) : (
          <ul className="liste">
            {liste.map((k) => (
              <li key={k.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="m1 font-semibold">
                    {k.ad || k.eposta} {k.ben && <span className="m3 text-xs font-normal">(siz)</span>}
                  </p>
                  <p className="m3 truncate text-xs">
                    {k.eposta}
                    {k.son_giris ? `, son giriş ${kisaTarih(yerelTarih(k.son_giris))}` : ", henüz giriş yapmadı"}
                  </p>
                  {k.rol === "SUBE" && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {k.subeler.map((id) => (
                        <Rozet key={id}>{subeAdi(id)}</Rozet>
                      ))}
                    </div>
                  )}
                </div>
                <Rozet ton={k.rol === "GENEL" ? "izin" : "giris"}>{k.rol === "GENEL" ? "Genel yönetici" : "Şube müdürü"}</Rozet>
                {!k.ben && (
                  <div className="flex gap-1.5">
                    <button type="button" className="btn btn-ikincil btn-kucuk" onClick={() => setForm(k)}>
                      <Ikon ad="kalem" boyut={14} />
                      Düzenle
                    </button>
                    <button type="button" className="btn btn-hayalet btn-kucuk" onClick={() => kaldir(k)}>
                      <Ikon ad="cop" boyut={14} />
                      Kaldır
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {form && (
        <KullaniciFormu
          mevcut={form === "yeni" ? null : form}
          subeler={subeler}
          onKapat={() => setForm(null)}
          onKayit={getir}
        />
      )}
    </div>
  );
}

function KullaniciFormu({
  mevcut,
  subeler,
  onKapat,
  onKayit,
}: {
  mevcut: Kullanici | null;
  subeler: Sube[];
  onKapat: () => void;
  onKayit: () => void;
}) {
  const { bildir } = useBildirim();
  const [ad, setAd] = useState(mevcut?.ad ?? "");
  const [eposta, setEposta] = useState(mevcut?.eposta ?? "");
  const [sifre, setSifre] = useState("");
  const [rol, setRol] = useState<"GENEL" | "SUBE">(mevcut?.rol ?? "SUBE");
  const [secili, setSecili] = useState<string[]>(mevcut?.subeler ?? []);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    const temizEposta = eposta.trim().toLowerCase();
    if (rol === "SUBE" && secili.length === 0) return bildir("Şube müdürü için en az bir şube seçin.", "hata");
    if (sifre && sifre.length < 8) return bildir("Geçici şifre en az 8 karakter olmalı.", "hata");

    setYukleniyor(true);
    try {
      // Yeni hesap: kendi oturumumuzu kapatmayan ayrı bir istemciyle açılır
      if (!mevcut && sifre) {
        const { error } = await geciciIstemci().auth.signUp({ email: temizEposta, password: sifre });
        if (error && !/already registered|already been registered|already exists/i.test(error.message)) {
          if (/signups? not allowed|disabled/i.test(error.message)) {
            throw new Error(
              "Supabase'de yeni kayıt kapalı. Hesabı Supabase > Authentication > Users > Add user ile oluşturun, sonra burada şifre girmeden kaydedin."
            );
          }
          throw error;
        }
      }
      const { error } = await supabase.rpc("yonetici_kaydet", {
        p_eposta: temizEposta,
        p_ad: ad,
        p_rol: rol,
        p_subeler: rol === "SUBE" ? secili : [],
      });
      if (error) throw error;
      bildir(
        mevcut
          ? "Kullanıcı güncellendi."
          : sifre
          ? "Kullanıcı eklendi. E-posta doğrulaması açıksa önce gelen e-postadaki bağlantıya tıklaması gerekir."
          : "Kullanıcı eklendi.",
        "basari"
      );
      onKayit();
      onKapat();
    } catch (err) {
      bildir(kullaniciHatasi(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik={mevcut ? "Kullanıcıyı düzenle" : "Panel kullanıcısı ekle"}>
      <form onSubmit={kaydet} className="space-y-4">
        <div>
          <label className="etiket">Ad soyad</label>
          <input className="girdi" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Ör. Ayşe Yılmaz" />
        </div>
        <div>
          <label className="etiket">E-posta</label>
          <input
            className="girdi"
            type="email"
            required
            value={eposta}
            onChange={(e) => setEposta(e.target.value)}
            disabled={!!mevcut}
            autoComplete="off"
          />
        </div>
        {!mevcut && (
          <div>
            <label className="etiket">Geçici şifre</label>
            <input
              className="girdi"
              type="text"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              placeholder="En az 8 karakter"
              autoComplete="new-password"
            />
            <p className="ipucu">
              Yeni hesap için doldurun ve kişiye iletin. Hesap Supabase&apos;de zaten varsa boş bırakın.
            </p>
          </div>
        )}
        <div className="segment" role="tablist" aria-label="Rol">
          <button type="button" role="tab" aria-selected={rol === "SUBE"} data-aktif={rol === "SUBE"} onClick={() => setRol("SUBE")}>
            Şube müdürü
          </button>
          <button type="button" role="tab" aria-selected={rol === "GENEL"} data-aktif={rol === "GENEL"} onClick={() => setRol("GENEL")}>
            Genel yönetici
          </button>
        </div>
        {rol === "SUBE" ? (
          <div>
            <label className="etiket">Şubeleri ({secili.length} seçili)</label>
            <div className="panel-ic max-h-56 overflow-y-auto">
              {subeler.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={secili.includes(s.id)}
                    onChange={(e) => setSecili(e.target.checked ? [...secili, s.id] : secili.filter((x) => x !== s.id))}
                  />
                  <span className="m1 text-sm">{s.ad}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="m2 text-sm">Genel yönetici tüm şubeleri, personeli ve ayarları yönetir.</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ikincil" onClick={onKapat} disabled={yukleniyor}>
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
