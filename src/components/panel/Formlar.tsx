"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz, tcGecerliMi, type Personel, type Sube, type Vardiya } from "../../lib/tipler";
import { GUN_ADLARI, kisaTarih, yerelSaat, yerelSaatSn, yerelTarih } from "../../lib/tarih";
import { Avatar, Ikon, Modal, Rozet, useBildirim } from "../ui";

function Alan({ etiket, ipucu, children }: { etiket: string; ipucu?: string; children: ReactNode }) {
  return (
    <div>
      <label className="etiket">{etiket}</label>
      {children}
      {ipucu && <p className="ipucu">{ipucu}</p>}
    </div>
  );
}

function Altlik({ onKapat, yukleniyor, kaydetEtiket }: { onKapat: () => void; yukleniyor: boolean; kaydetEtiket: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" className="btn btn-ikincil" onClick={onKapat}>
        Vazgeç
      </button>
      <button type="submit" className="btn btn-ana" disabled={yukleniyor}>
        {yukleniyor ? "Kaydediliyor..." : kaydetEtiket}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Yeni personel
// ---------------------------------------------------------------------
export function PersonelFormu({
  subeler,
  vardiyalar,
  onKapat,
  onKayit,
}: {
  subeler: Sube[];
  vardiyalar: Vardiya[];
  onKapat: () => void;
  onKayit: () => void;
}) {
  const { bildir, onayla } = useBildirim();
  const [yukleniyor, setYukleniyor] = useState(false);
  const [f, setF] = useState({
    sicil_no: "",
    tc_kimlik: "",
    ad: "",
    soyad: "",
    departman: "Genel",
    varsayilan_sube_id: "",
    varsayilan_vardiya_id: "",
    pin: "",
  });

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    const tc = f.tc_kimlik.trim();

    if (!/^[0-9]{11}$/.test(tc)) {
      bildir("T.C. kimlik numarası 11 haneli ve sadece rakam olmalı.", "hata");
      return;
    }
    if (!tcGecerliMi(tc)) {
      const devam = await onayla({
        baslik: "T.C. kimlik no geçerli görünmüyor",
        metin: "Bu numara geçerlilik kontrolünden geçmedi. Yine de kaydedilsin mi?",
        onayEtiketi: "Yine de kaydet",
      });
      if (!devam) return;
    }
    if (!/^[0-9]{4,8}$/.test(f.pin)) {
      bildir("Mobil giriş PIN'i 4 ile 8 haneli rakamlardan oluşmalı.", "hata");
      return;
    }

    setYukleniyor(true);
    try {
      const { data, error } = await supabase
        .from("personeller")
        .insert([
          {
            sicil_no: f.sicil_no.trim(),
            tc_kimlik: tc,
            ad: f.ad.trim(),
            soyad: f.soyad.trim(),
            departman: f.departman.trim() || "Genel",
            varsayilan_sube_id: f.varsayilan_sube_id || null,
            varsayilan_vardiya_id: f.varsayilan_vardiya_id || null,
            rol: "PERSONEL",
            aktif: true,
          },
        ])
        .select("id")
        .single();
      if (error) throw error;

      const { error: pinHata } = await supabase.rpc("personel_pin_belirle", {
        p_personel_id: data.id,
        p_pin: f.pin,
      });
      if (pinHata) throw pinHata;

      bildir(`${f.ad.trim()} ${f.soyad.trim()} eklendi.`, "basari");
      onKayit();
      onKapat();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Yeni personel">
      <form onSubmit={kaydet} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Alan etiket="Ad">
            <input className="girdi" required value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} />
          </Alan>
          <Alan etiket="Soyad">
            <input className="girdi" required value={f.soyad} onChange={(e) => setF({ ...f, soyad: e.target.value })} />
          </Alan>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Alan etiket="Sicil no">
            <input
              className="girdi"
              required
              placeholder="MNS-101"
              value={f.sicil_no}
              onChange={(e) => setF({ ...f, sicil_no: e.target.value })}
            />
          </Alan>
          <Alan etiket="T.C. kimlik no">
            <input
              className="girdi sayi"
              required
              inputMode="numeric"
              maxLength={11}
              value={f.tc_kimlik}
              onChange={(e) => setF({ ...f, tc_kimlik: e.target.value.replace(/\D/g, "") })}
            />
          </Alan>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Alan etiket="Departman">
            <input className="girdi" value={f.departman} onChange={(e) => setF({ ...f, departman: e.target.value })} />
          </Alan>
          <Alan etiket="Şube">
            <select
              className="girdi"
              value={f.varsayilan_sube_id}
              onChange={(e) => setF({ ...f, varsayilan_sube_id: e.target.value })}
            >
              <option value="">Seçin</option>
              {subeler.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad}
                </option>
              ))}
            </select>
          </Alan>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Alan etiket="Vardiya">
            <select
              className="girdi"
              value={f.varsayilan_vardiya_id}
              onChange={(e) => setF({ ...f, varsayilan_vardiya_id: e.target.value })}
            >
              <option value="">Seçin</option>
              {vardiyalar.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.ad}
                </option>
              ))}
            </select>
          </Alan>
          <Alan etiket="Mobil PIN">
            <input
              className="girdi sayi"
              required
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoComplete="new-password"
              placeholder="4-8 rakam"
              value={f.pin}
              onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })}
            />
          </Alan>
        </div>
        <p className="ipucu">
          PIN, personelin mobil girişte T.C. kimlik numarasıyla birlikte kullanacağı gizli koddur. Sistemde yalnızca
          şifrelenmiş saklanır, personele güvenli bir yolla iletin.
        </p>
        <Altlik onKapat={onKapat} yukleniyor={yukleniyor} kaydetEtiket="Personeli ekle" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// PIN belirle
// ---------------------------------------------------------------------
export function PinFormu({ hedef, onKapat, onKayit }: { hedef: Personel; onKapat: () => void; onKayit: () => void }) {
  const { bildir } = useBildirim();
  const [pin, setPin] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!/^[0-9]{4,8}$/.test(pin)) {
      bildir("PIN 4 ile 8 haneli rakamlardan oluşmalı.", "hata");
      return;
    }
    setYukleniyor(true);
    try {
      const { error } = await supabase.rpc("personel_pin_belirle", { p_personel_id: hedef.id, p_pin: pin });
      if (error) throw error;
      bildir(`${hedef.ad} ${hedef.soyad} için PIN güncellendi, açık oturumları kapandı.`, "basari");
      onKayit();
      onKapat();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Mobil PIN belirle">
      <form onSubmit={kaydet} className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar ad={hedef.ad} soyad={hedef.soyad} boyut={40} />
          <div>
            <p className="m1 font-semibold">
              {hedef.ad} {hedef.soyad}
            </p>
            <p className="m3 text-xs">{hedef.sicil_no}</p>
          </div>
        </div>
        <Alan etiket="Yeni PIN" ipucu="Kaydedince personelin açık oturumları kapanır ve hatalı deneme kilidi kalkar.">
          <input
            className="girdi sayi"
            style={{ height: 52, fontSize: 22, textAlign: "center", letterSpacing: "0.3em" }}
            type="password"
            inputMode="numeric"
            maxLength={8}
            autoFocus
            required
            autoComplete="new-password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </Alan>
        <Altlik onKapat={onKapat} yukleniyor={yukleniyor} kaydetEtiket="PIN'i kaydet" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Vardiya ekle / düzenle
// ---------------------------------------------------------------------
export function VardiyaFormu({
  duzenlenen,
  onKapat,
  onKayit,
}: {
  duzenlenen: Vardiya | null;
  onKapat: () => void;
  onKayit: () => void;
}) {
  const { bildir } = useBildirim();
  const [yukleniyor, setYukleniyor] = useState(false);
  const [f, setF] = useState({
    ad: duzenlenen?.ad ?? "",
    baslangic_saat: duzenlenen?.baslangic_saat.slice(0, 5) ?? "09:00",
    bitis_saat: duzenlenen?.bitis_saat.slice(0, 5) ?? "18:00",
    mola_dakika: duzenlenen?.mola_dakika ?? 60,
  });

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!f.ad.trim()) return;
    setYukleniyor(true);
    try {
      const kayit = {
        ad: f.ad.trim(),
        baslangic_saat: f.baslangic_saat,
        bitis_saat: f.bitis_saat,
        mola_dakika: Number(f.mola_dakika) || 0,
      };
      if (duzenlenen) {
        const { error } = await supabase.from("vardiyalar").update(kayit).eq("id", duzenlenen.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vardiyalar").insert([kayit]);
        if (error) throw error;
      }
      bildir("Vardiya kaydedildi.", "basari");
      onKayit();
      onKapat();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik={duzenlenen ? "Vardiyayı düzenle" : "Yeni vardiya"}>
      <form onSubmit={kaydet} className="space-y-4">
        <Alan etiket="Vardiya adı">
          <input
            className="girdi"
            required
            placeholder="Standart mesai"
            value={f.ad}
            onChange={(e) => setF({ ...f, ad: e.target.value })}
          />
        </Alan>
        <div className="grid grid-cols-2 gap-3">
          <Alan etiket="Başlangıç">
            <input
              className="girdi sayi"
              type="time"
              required
              value={f.baslangic_saat}
              onChange={(e) => setF({ ...f, baslangic_saat: e.target.value })}
            />
          </Alan>
          <Alan etiket="Bitiş">
            <input
              className="girdi sayi"
              type="time"
              required
              value={f.bitis_saat}
              onChange={(e) => setF({ ...f, bitis_saat: e.target.value })}
            />
          </Alan>
        </div>
        <p className="ipucu">
          Gece vardiyası için bitiş saatini başlangıçtan küçük girin (örneğin 22:00 - 06:00). Sistem bitişi ertesi güne
          sayar.
        </p>
        <Alan etiket="Mola süresi (dakika)">
          <input
            className="girdi sayi"
            type="number"
            min={0}
            value={f.mola_dakika}
            onChange={(e) => setF({ ...f, mola_dakika: Number(e.target.value) })}
          />
        </Alan>
        <Altlik onKapat={onKapat} yukleniyor={yukleniyor} kaydetEtiket="Kaydet" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// İzin / rapor ekle (yönetici onaylı)
// ---------------------------------------------------------------------
export function IzinFormu({
  personeller,
  onKapat,
  onKayit,
}: {
  personeller: Personel[];
  onKapat: () => void;
  onKayit: () => void;
}) {
  const { bildir } = useBildirim();
  const bugun = yerelTarih();
  const [yukleniyor, setYukleniyor] = useState(false);
  const [f, setF] = useState({
    personel_id: "",
    izin_turu: "Raporlu / İstirahat",
    sgk_kodu: "01 - İstirahat / Sağlık Raporu",
    baslangic_tarihi: bugun,
    bitis_tarihi: bugun,
    aciklama: "",
  });

  function turDegis(tur: string) {
    let kod = "01 - İstirahat / Sağlık Raporu";
    if (tur === "Yıllık İzin") kod = "Ücretli İzin (SGK Bildirilmez)";
    else if (tur === "Ücretsiz İzin") kod = "05 - Ücretsiz İzin";
    else if (tur === "Mazeret İzni") kod = "13 - Diğer Nedenler";
    setF({ ...f, izin_turu: tur, sgk_kodu: kod });
  }

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!f.personel_id) {
      bildir("Lütfen bir personel seçin.", "hata");
      return;
    }
    if (f.bitis_tarihi < f.baslangic_tarihi) {
      bildir("Bitiş tarihi başlangıçtan önce olamaz.", "hata");
      return;
    }
    setYukleniyor(true);
    try {
      const { error } = await supabase.from("izinler").insert([
        {
          personel_id: f.personel_id,
          izin_turu: f.izin_turu,
          sgk_kodu: f.sgk_kodu,
          baslangic_tarihi: f.baslangic_tarihi,
          bitis_tarihi: f.bitis_tarihi,
          aciklama: f.aciklama.trim() || null,
          durum: "ONAYLANDI",
        },
      ]);
      if (error) throw error;
      bildir("İzin kaydı eklendi ve puantaja yansıdı.", "basari");
      onKayit();
      onKapat();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="İzin veya rapor ekle">
      <form onSubmit={kaydet} className="space-y-4">
        <Alan etiket="Personel">
          <select className="girdi" required value={f.personel_id} onChange={(e) => setF({ ...f, personel_id: e.target.value })}>
            <option value="">Seçin</option>
            {personeller
              .filter((p) => p.aktif)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sicil_no} - {p.ad} {p.soyad}
                </option>
              ))}
          </select>
        </Alan>
        <Alan etiket="Kayıt türü">
          <select className="girdi" value={f.izin_turu} onChange={(e) => turDegis(e.target.value)}>
            <option value="Raporlu / İstirahat">Sağlık raporu / istirahat</option>
            <option value="Yıllık İzin">Yıllık ücretli izin</option>
            <option value="Mazeret İzni">Mazeret / idari izin</option>
            <option value="Ücretsiz İzin">Ücretsiz izin</option>
          </select>
        </Alan>
        <Alan etiket="SGK eksik gün kodu">
          <select className="girdi" value={f.sgk_kodu} onChange={(e) => setF({ ...f, sgk_kodu: e.target.value })}>
            <option value="01 - İstirahat / Sağlık Raporu">01 - İstirahat / Sağlık Raporu</option>
            <option value="05 - Ücretsiz İzin">05 - Ücretsiz İzin</option>
            <option value="13 - Diğer Nedenler">13 - Diğer Nedenler</option>
            <option value="Ücretli İzin (SGK Bildirilmez)">Ücretli İzin (SGK bildirilmez)</option>
          </select>
        </Alan>
        <div className="grid grid-cols-2 gap-3">
          <Alan etiket="Başlangıç">
            <input
              className="girdi sayi"
              type="date"
              required
              value={f.baslangic_tarihi}
              onChange={(e) => setF({ ...f, baslangic_tarihi: e.target.value })}
            />
          </Alan>
          <Alan etiket="Bitiş">
            <input
              className="girdi sayi"
              type="date"
              required
              value={f.bitis_tarihi}
              onChange={(e) => setF({ ...f, bitis_tarihi: e.target.value })}
            />
          </Alan>
        </div>
        <Alan etiket="Açıklama veya belge no">
          <input
            className="girdi"
            placeholder="Rapor ya da izin belgesi numarası"
            value={f.aciklama}
            onChange={(e) => setF({ ...f, aciklama: e.target.value })}
          />
        </Alan>
        <Altlik onKapat={onKapat} yukleniyor={yukleniyor} kaydetEtiket="Kaydet" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Manuel giriş / çıkış düzeltme
// ---------------------------------------------------------------------
/** Manuel formu önceden doldurmak için (ör. çıkışı eksik listesinden açılınca) */
export interface ManuelBaslangic {
  personel_id: string;
  sube_id: string;
  islem_turu: "İşe Giriş" | "İşe Çıkış";
  tarih: string;
  saat: string;
}

export function ManuelFormu({
  personeller,
  subeler,
  baslangic,
  onKapat,
  onKayit,
}: {
  personeller: Personel[];
  subeler: Sube[];
  baslangic?: ManuelBaslangic;
  onKapat: () => void;
  onKayit: () => void;
}) {
  const { bildir } = useBildirim();
  const [yukleniyor, setYukleniyor] = useState(false);
  const [f, setF] = useState({
    personel_id: "",
    sube_id: "",
    islem_turu: "İşe Çıkış",
    tarih: yerelTarih(),
    saat: "18:00",
    yonetici_notu: "Personel çıkış basmayı unuttu, yönetici onayıyla eklendi.",
    ...baslangic,
  });

  function personelSec(id: string) {
    const p = personeller.find((x) => x.id === id);
    setF({ ...f, personel_id: id, sube_id: f.sube_id || p?.varsayilan_sube_id || "" });
  }

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    if (!f.personel_id || !f.sube_id) {
      bildir("Lütfen personel ve şube seçin.", "hata");
      return;
    }
    setYukleniyor(true);
    try {
      const sube = subeler.find((s) => s.id === f.sube_id);
      const { error } = await supabase.from("hareketler").insert([
        {
          personel_id: f.personel_id,
          sube_id: f.sube_id,
          islem_turu: f.islem_turu,
          created_at: new Date(`${f.tarih}T${f.saat}:00+03:00`).toISOString(),
          enlem: sube ? Number(sube.enlem) : 0,
          boylam: sube ? Number(sube.boylam) : 0,
          mesafe_metre: 0,
          manuel: true,
          yonetici_notu: f.yonetici_notu.trim() || "İK tarafından manuel eklendi",
        },
      ]);
      if (error) throw error;
      bildir("Hareket eklendi.", "basari");
      onKayit();
      onKapat();
    } catch (err) {
      bildir(hataYaz(err), "hata");
    } finally {
      setYukleniyor(false);
    }
  }

  return (
    <Modal onKapat={onKapat} baslik="Manuel giriş / çıkış">
      <form onSubmit={kaydet} className="space-y-4">
        <Alan etiket="Personel">
          <select className="girdi" required value={f.personel_id} onChange={(e) => personelSec(e.target.value)}>
            <option value="">Seçin</option>
            {personeller
              .filter((p) => p.aktif)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sicil_no} - {p.ad} {p.soyad}
                </option>
              ))}
          </select>
        </Alan>
        <div className="grid grid-cols-2 gap-3">
          <Alan etiket="Şube">
            <select className="girdi" required value={f.sube_id} onChange={(e) => setF({ ...f, sube_id: e.target.value })}>
              <option value="">Seçin</option>
              {subeler.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.ad}
                </option>
              ))}
            </select>
          </Alan>
          <Alan etiket="İşlem">
            <select className="girdi" value={f.islem_turu} onChange={(e) => setF({ ...f, islem_turu: e.target.value })}>
              <option value="İşe Giriş">İşe giriş</option>
              <option value="İşe Çıkış">İşe çıkış</option>
            </select>
          </Alan>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Alan etiket="Tarih">
            <input className="girdi sayi" type="date" required value={f.tarih} onChange={(e) => setF({ ...f, tarih: e.target.value })} />
          </Alan>
          <Alan etiket="Saat">
            <input className="girdi sayi" type="time" required value={f.saat} onChange={(e) => setF({ ...f, saat: e.target.value })} />
          </Alan>
        </div>
        <Alan etiket="Yönetici notu" ipucu="Bu not hareketler listesinde ve denetim izinde görünür.">
          <input className="girdi" value={f.yonetici_notu} onChange={(e) => setF({ ...f, yonetici_notu: e.target.value })} />
        </Alan>
        <Altlik onKapat={onKapat} yukleniyor={yukleniyor} kaydetEtiket="Hareketi ekle" />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Bugün gelmeyenlerin listesi
// ---------------------------------------------------------------------
export function GelmeyenlerListesi({ liste, onKapat }: { liste: Personel[]; onKapat: () => void }) {
  return (
    <Modal onKapat={onKapat} baslik={`Henüz gelmeyenler (${liste.length})`}>
      <ul className="liste panel-ic overflow-hidden">
        {liste.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar ad={p.ad} soyad={p.soyad} />
            <div className="min-w-0">
              <p className="m1 font-semibold">
                {p.ad} {p.soyad}
              </p>
              <p className="m3 text-xs">
                {p.sicil_no}, {p.subeler?.ad || "Şube atanmamış"}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-ana" onClick={onKapat}>
          Kapat
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Çıkış basmayı unutanların listesi
// ---------------------------------------------------------------------
export interface CikisEksikSatiri {
  personel: Personel;
  /** Çıkışı olmayan girişin zamanı (ISO) */
  giris: string;
  subeId: string | null;
  /** Girişin eşleştiği planlı vardiyanın bitişi (ISO); eşleşme yoksa null */
  planliBitis: string | null;
  /** Girişin eşleştiği planlı vardiyanın adı */
  vardiyaAdi: string | null;
}

function gunEtiketi(iso: string): string {
  const tarih = yerelTarih(iso);
  const gunAdi = GUN_ADLARI[new Date(`${tarih}T12:00:00+03:00`).getUTCDay()];
  return `${kisaTarih(tarih)} ${gunAdi}`;
}

export function CikisEksikListesi({
  liste,
  onKapat,
  onCikisEkle,
}: {
  liste: CikisEksikSatiri[];
  onKapat: () => void;
  onCikisEkle: (baslangic: ManuelBaslangic) => void;
}) {
  const bugun = yerelTarih();
  return (
    <Modal onKapat={onKapat} baslik={`Çıkış kaydı eksik (${liste.length})`}>
      <p className="m2 mb-4 text-sm">
        Bu personeller vardiyaları bittiği halde çıkış basmamış. Gerçek çıkış saatini öğrenip ekleyin; kayıt eklenince
        hem bu listeden hem de personelin telefonundaki uyarıdan düşer.
      </p>
      {liste.length === 0 ? (
        <p className="m3 text-sm">Çıkışı eksik kayıt yok.</p>
      ) : (
        <ul className="liste panel-ic overflow-hidden">
          {liste.map((s) => {
            const gunFarki = Math.round(
              (Date.parse(`${bugun}T12:00:00+03:00`) - Date.parse(`${yerelTarih(s.giris)}T12:00:00+03:00`)) / 86400000
            );
            const onerilen = s.planliBitis ?? s.giris;
            return (
              <li key={`${s.personel.id}-${s.giris}`} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar ad={s.personel.ad} soyad={s.personel.soyad} />
                <div className="min-w-0 flex-1">
                  <p className="m1 font-semibold">
                    {s.personel.ad} {s.personel.soyad}
                  </p>
                  <p className="m3 text-xs">
                    {gunEtiketi(s.giris)}, <span className="sayi">{yerelSaat(s.giris)}</span> girişi
                    {s.vardiyaAdi ? `, ${s.vardiyaAdi} vardiyası` : ""}
                    {", "}
                    {s.personel.subeler?.ad || "Şube atanmamış"}
                  </p>
                </div>
                <Rozet ton={gunFarki >= 2 ? "hata" : "uyari"}>{gunFarki <= 0 ? "Bugün" : `${gunFarki} gün önce`}</Rozet>
                <button
                  type="button"
                  className="btn btn-ikincil btn-kucuk"
                  disabled={!s.subeId}
                  title={s.subeId ? undefined : "Personelin şubesi yok; Manuel giriş/çıkış formundan ekleyin"}
                  onClick={() =>
                    s.subeId &&
                    onCikisEkle({
                      personel_id: s.personel.id,
                      sube_id: s.subeId,
                      islem_turu: "İşe Çıkış",
                      tarih: yerelTarih(onerilen),
                      // h23 biçimi: gece yarısı "24:00" değil "00:00" olur
                      saat: yerelSaatSn(onerilen).slice(0, 5),
                    })
                  }
                >
                  <Ikon ad="arti" boyut={15} />
                  Çıkış ekle
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-ana" onClick={onKapat}>
          Kapat
        </button>
      </div>
    </Modal>
  );
}
