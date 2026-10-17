"use client";

// Panel kullanıcılarının şifre işlemleri: kendi şifresini değiştirme, yöneticinin başkasına
// yeni şifre vermesi ve giriş ekranından "şifremi unuttum".
import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { hataYaz } from "../lib/tipler";
import { Modal, useBildirim } from "./ui";

const SIFRE_MIN = 8;
const SIFRE_MAX = 72;

function sifreSorunu(sifre: string, tekrar: string): string | null {
  if (sifre.length < SIFRE_MIN || sifre.length > SIFRE_MAX) return `Şifre ${SIFRE_MIN}-${SIFRE_MAX} karakter olmalı.`;
  if (sifre !== tekrar) return "Şifreler birbirini tutmuyor.";
  return null;
}

function supabaseSifreHatasi(err: unknown): string {
  const metin = hataYaz(err);
  if (/should be different|same_password/i.test(metin)) return "Yeni şifre eskisiyle aynı olamaz.";
  if (/weak|at least/i.test(metin)) return "Şifre çok zayıf; daha uzun ve tahmin edilmesi zor bir şifre seçin.";
  if (/reauthentication|nonce/i.test(metin)) return "Güvenlik nedeniyle yeniden giriş yapıp tekrar deneyin.";
  return metin;
}

function SifreAlanlari({
  sifre,
  tekrar,
  setSifre,
  setTekrar,
}: {
  sifre: string;
  tekrar: string;
  setSifre: (s: string) => void;
  setTekrar: (s: string) => void;
}) {
  return (
    <>
      <div>
        <label className="etiket" htmlFor="yeniSifre">
          Yeni şifre
        </label>
        <input
          id="yeniSifre"
          className="girdi"
          type="password"
          required
          minLength={SIFRE_MIN}
          maxLength={SIFRE_MAX}
          autoComplete="new-password"
          autoFocus
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
        />
        <p className="ipucu">En az {SIFRE_MIN} karakter.</p>
      </div>
      <div>
        <label className="etiket" htmlFor="yeniSifreTekrar">
          Yeni şifre (tekrar)
        </label>
        <input
          id="yeniSifreTekrar"
          className="girdi"
          type="password"
          required
          autoComplete="new-password"
          value={tekrar}
          onChange={(e) => setTekrar(e.target.value)}
        />
      </div>
    </>
  );
}

function Altlik({ onKapat, yukleniyor, etiket }: { onKapat: () => void; yukleniyor: boolean; etiket: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" className="btn btn-ikincil" onClick={onKapat}>
        Vazgeç
      </button>
      <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
        {yukleniyor ? "Kaydediliyor..." : etiket}
      </button>
    </div>
  );
}

/** Giriş yapmış kullanıcının kendi şifresini değiştirmesi */
export function SifreDegistirFormu({ onKapat }: { onKapat: () => void }) {
  const { bildir } = useBildirim();
  const [sifre, setSifre] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    const sorun = sifreSorunu(sifre, tekrar);
    if (sorun) return bildir(sorun, "hata");
    setYukleniyor(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: sifre });
      if (error) throw error;
      bildir("Şifreniz değiştirildi.", "basari");
      onKapat();
    } catch (err) {
      bildir(supabaseSifreHatasi(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Şifremi değiştir">
      <form onSubmit={kaydet} className="space-y-4">
        <SifreAlanlari sifre={sifre} tekrar={tekrar} setSifre={setSifre} setTekrar={setTekrar} />
        <Altlik onKapat={onKapat} yukleniyor={yukleniyor} etiket="Değiştir" />
      </form>
    </Modal>
  );
}

const SUNUCU_HATALARI: Record<string, string> = {
  YETKISIZ: "Bu kullanıcının şifresini değiştirme yetkiniz yok.",
  KENDINIZ: "Kendi şifrenizi \"Şifremi değiştir\" ile değiştirin.",
  KULLANICI_YOK: "Bu e-postayla bir panel kullanıcısı bulunamadı.",
  SIFRE_GECERSIZ: `Şifre ${SIFRE_MIN}-${SIFRE_MAX} karakter olmalı.`,
  SUNUCU_ANAHTARI_YOK: "Sunucu ayarı eksik (SUPABASE_SERVICE_ROLE_KEY).",
};

/** Genel yönetici (kendi firmasındaki) ya da sistem yöneticisi bir panel kullanıcısına yeni şifre verir */
export function SifreBelirleFormu({ eposta, onKapat }: { eposta: string; onKapat: () => void }) {
  const { bildir } = useBildirim();
  const [sifre, setSifre] = useState("");
  const [tekrar, setTekrar] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    const sorun = sifreSorunu(sifre, tekrar);
    if (sorun) return bildir(sorun, "hata");
    setYukleniyor(true);
    try {
      const { data } = await supabase.auth.getSession();
      const cevap = await fetch("/api/sifre-sifirla", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ eposta, sifre }),
      });
      const sonuc = (await cevap.json().catch(() => ({}))) as { hata?: string };
      if (!cevap.ok) throw new Error(SUNUCU_HATALARI[sonuc.hata ?? ""] ?? sonuc.hata ?? "Şifre değiştirilemedi.");
      bildir(`${eposta} için yeni şifre kaydedildi. Kişiye kendiniz iletin.`, "basari");
      onKapat();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Yeni şifre belirle">
      <form onSubmit={kaydet} className="space-y-4">
        <p className="m2 text-sm">
          <strong className="m1">{eposta}</strong> hesabına yeni şifre verilecek. Eski şifre geçersiz olur.
        </p>
        <SifreAlanlari sifre={sifre} tekrar={tekrar} setSifre={setSifre} setTekrar={setTekrar} />
        <Altlik onKapat={onKapat} yukleniyor={yukleniyor} etiket="Kaydet" />
      </form>
    </Modal>
  );
}

/** Giriş ekranı: e-postaya şifre yenileme bağlantısı gönderir */
export function SifremiUnuttumFormu({ ilkEposta, onKapat }: { ilkEposta: string; onKapat: () => void }) {
  const { bildir } = useBildirim();
  const [eposta, setEposta] = useState(ilkEposta);
  const [gonderildi, setGonderildi] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);

  async function gonder(e: FormEvent) {
    e.preventDefault();
    setYukleniyor(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(eposta.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/sifre-yenile`,
      });
      if (error) throw error;
      setGonderildi(true);
    } catch (err) {
      const metin = hataYaz(err);
      bildir(/rate limit|too many/i.test(metin) ? "Çok fazla deneme yapıldı; bir süre sonra tekrar deneyin." : metin, "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Şifremi unuttum">
      {gonderildi ? (
        <div className="space-y-4">
          <p className="m1 text-sm">
            Bu e-posta kayıtlıysa şifre yenileme bağlantısı gönderildi. Gelen kutunuzu (ve istenmeyen klasörünü) kontrol edin.
          </p>
          <p className="m3 text-sm">E-posta gelmezse firmanızın genel yöneticisinden size yeni şifre vermesini isteyin.</p>
          <div className="flex justify-end">
            <button type="button" className="btn btn-ana" onClick={onKapat}>
              Tamam
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={gonder} className="space-y-4">
          <div>
            <label className="etiket" htmlFor="unuttumEposta">
              E-posta
            </label>
            <input
              id="unuttumEposta"
              className="girdi"
              type="email"
              required
              autoComplete="username"
              autoFocus
              value={eposta}
              onChange={(e) => setEposta(e.target.value)}
            />
          </div>
          <Altlik onKapat={onKapat} yukleniyor={yukleniyor} etiket="Bağlantı gönder" />
        </form>
      )}
    </Modal>
  );
}
