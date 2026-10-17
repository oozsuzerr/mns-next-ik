"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { hataYaz, type Personel } from "../../lib/tipler";
import { kisaTarih, yerelSaat, yerelTarih } from "../../lib/tarih";
import { Bos, Ikon, Iskelet, Rozet } from "../ui";

interface Kayit {
  id: number;
  zaman: string;
  kullanici_id: string | null;
  kullanici_eposta: string | null;
  tablo: string;
  islem: "INSERT" | "UPDATE" | "DELETE";
  kayit_id: string | null;
  personel_id: string | null;
  once: Record<string, unknown> | null;
  sonra: Record<string, unknown> | null;
}

const SAYFA = 200;
/** Aynı kişinin aynı türdeki işlemleri bu kadar saniye içindeyse tek satırda toplanır (ör. toplu atama) */
const GRUP_SANIYE = 10;

const TABLOLAR: Record<string, string> = {
  hareketler: "Giriş/çıkış",
  izinler: "İzin",
  vardiya_plani: "Vardiya planı",
  personeller: "Personel",
  vardiyalar: "Vardiya tanımı",
  subeler: "Şube",
  resmi_tatiller: "Resmi tatil",
  yoneticiler: "Panel kullanıcısı",
  yonetici_subeleri: "Müdür şubesi",
  ay_kilitleri: "Ay kilidi",
  cihaz_talepleri: "Telefon talebi",
  personel_ozluk: "Özlük bilgisi",
  personel_belgeleri: "Personel belgesi",
};

const ALANLAR: Record<string, string> = {
  durum: "Durum",
  aktif: "Aktif",
  islem_turu: "İşlem",
  created_at: "Zaman",
  tarih: "Tarih",
  tur: "Tür",
  vardiya_id: "Vardiya",
  baslangic_tarihi: "Başlangıç",
  bitis_tarihi: "Bitiş",
  izin_turu: "İzin türü",
  cihaz_id: "Cihaz",
  cihaz_bilgisi: "Telefon",
  pin: "PIN",
  rol: "Rol",
  yetkiler: "Yetkiler",
  ad: "Ad",
  soyad: "Soyad",
  varsayilan_sube_id: "Şube",
  varsayilan_vardiya_id: "Vardiya",
  yonetici_notu: "Not",
  baslangic_saat: "Başlangıç saati",
  bitis_saat: "Bitiş saati",
  mola_dakika: "Mola",
  limit_metre: "Sınır (m)",
};

function deger(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "evet" : "hayır";
  if (Array.isArray(v)) return v.join(", ") || "-";
  const m = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(m)) return `${kisaTarih(yerelTarih(m))} ${yerelSaat(m)}`;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(m)) return "…" + m.slice(-4);
  return m.length > 40 ? m.slice(0, 40) + "…" : m;
}

/** Bir kaydı okunur bir cümleye çevirir */
function ozet(k: Kayit): string {
  const o = k.once ?? {};
  const y = k.sonra ?? {};
  if (k.tablo === "ay_kilitleri") return k.islem === "DELETE" ? `${o.ay} ayını açtı` : `${y.ay} ayını kapattı`;
  if (k.tablo === "personeller" && k.islem === "UPDATE") {
    if ("pin" in y) return "PIN'i değiştirdi";
    if ("cihaz_id" in y && !y.cihaz_id) return "cihaz kilidini açtı";
    if ("cihaz_id" in y) return "yeni telefonu tanımladı";
    if ("aktif" in y) return y.aktif ? "personeli aktif etti" : "personeli pasife aldı";
  }
  if (k.tablo === "cihaz_talepleri" && k.islem === "UPDATE" && "durum" in y) {
    return y.durum === "ONAYLANDI" ? "yeni telefon talebini onayladı" : "yeni telefon talebini reddetti";
  }
  if (k.tablo === "izinler" && k.islem === "UPDATE" && "durum" in y) {
    return y.durum === "ONAYLANDI" ? "izni onayladı" : y.durum === "REDDEDILDI" ? "izni reddetti" : "izin durumunu değiştirdi";
  }
  if (k.tablo === "hareketler" && k.islem === "INSERT") {
    return `manuel ${String(y.islem_turu ?? "hareket").toLocaleLowerCase("tr-TR")} ekledi (${deger(y.created_at)})`;
  }
  const fiil = k.islem === "INSERT" ? "ekledi" : k.islem === "UPDATE" ? "değiştirdi" : "sildi";
  return `${(TABLOLAR[k.tablo] ?? k.tablo).toLocaleLowerCase("tr-TR")} kaydı ${fiil}`;
}

function ayrintilar(k: Kayit): string[] {
  if (k.islem === "UPDATE") {
    return Object.keys(k.sonra ?? {}).map(
      (a) => `${ALANLAR[a] ?? a}: ${deger(k.once?.[a])} → ${deger(k.sonra?.[a])}`
    );
  }
  const kaynak = (k.islem === "INSERT" ? k.sonra : k.once) ?? {};
  return Object.keys(ALANLAR)
    .filter((a) => a in kaynak && kaynak[a] !== null && kaynak[a] !== "")
    .slice(0, 5)
    .map((a) => `${ALANLAR[a]}: ${deger(kaynak[a])}`);
}

export default function IslemGecmisi({ personeller }: { personeller: Personel[] }) {
  const [kayitlar, setKayitlar] = useState<Kayit[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [tablo, setTablo] = useState("");
  const [limit, setLimit] = useState(SAYFA);

  const getir = useCallback(() => {
    let sorgu = supabase.from("islem_gecmisi").select("*").order("zaman", { ascending: false }).range(0, limit - 1);
    if (tablo) sorgu = sorgu.eq("tablo", tablo);
    return Promise.resolve(sorgu)
      .then(({ data, error }) => {
        if (error) throw error;
        setKayitlar((data ?? []) as Kayit[]);
        setHata(null);
      })
      .catch((err) => {
        const metin = hataYaz(err);
        setHata(
          /islem_gecmisi/.test(metin) && /(does not exist|could not find|schema cache)/i.test(metin)
            ? "İşlem geçmişi tablosu henüz oluşturulmamış. supabase/2026-10-15_yetkiler_gecmis_ay_kilidi.sql dosyasını çalıştırın."
            : metin
        );
      })
      .finally(() => setYukleniyor(false));
  }, [tablo, limit, setKayitlar, setHata, setYukleniyor]);

  useEffect(() => {
    getir();
  }, [getir]);

  const personelAdi = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const p = personeller.find((x) => x.id === id);
      return p ? `${p.ad} ${p.soyad}` : "Silinmiş personel";
    },
    [personeller]
  );

  // Art arda gelen aynı tür işlemleri grupla
  const gruplar = useMemo(() => {
    const sonuc: Kayit[][] = [];
    for (const k of kayitlar) {
      const son = sonuc[sonuc.length - 1];
      const ilk = son?.[0];
      if (
        ilk &&
        ilk.kullanici_id === k.kullanici_id &&
        ilk.tablo === k.tablo &&
        ilk.islem === k.islem &&
        Math.abs(Date.parse(son[son.length - 1].zaman) - Date.parse(k.zaman)) <= GRUP_SANIYE * 1000
      ) {
        son.push(k);
      } else {
        sonuc.push([k]);
      }
    }
    return sonuc;
  }, [kayitlar]);

  function filtreDegistir(t: string) {
    if (t === tablo) return;
    setYukleniyor(true);
    setTablo(t);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m2 flex-1 text-sm">
          Panelden yapılan her ekleme, değişiklik ve silme burada; kim yaptığı ve önceki/sonraki değerleriyle. Kayıtlar
          silinemez.
        </p>
        <select
          className="girdi girdi-sik"
          style={{ width: "auto" }}
          value={tablo}
          onChange={(e) => filtreDegistir(e.target.value)}
          aria-label="Kayıt türü"
        >
          <option value="">Tüm işlemler</option>
          {Object.entries(TABLOLAR).map(([a, ad]) => (
            <option key={a} value={a}>
              {ad}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-hayalet btn-kucuk btn-ikon" onClick={() => getir()} aria-label="Yenile">
          <Ikon ad="yenile" className={yukleniyor ? "donen" : ""} boyut={16} />
        </button>
      </div>

      {hata && (
        <div className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--hata-acik)", color: "var(--hata)" }} role="alert">
          {hata}
        </div>
      )}

      <div className="panel overflow-hidden">
        {yukleniyor && kayitlar.length === 0 ? (
          <div className="space-y-3 p-5">
            <Iskelet yukseklik={20} />
            <Iskelet yukseklik={20} />
            <Iskelet yukseklik={20} />
          </div>
        ) : gruplar.length === 0 ? (
          <Bos ikon="hareket" baslik="Kayıt yok" metin="Panelden işlem yapıldıkça burada listelenir." />
        ) : (
          <ul className="liste">
            {gruplar.map((g) => {
              const k = g[0];
              const kisiler = [...new Set(g.map((x) => personelAdi(x.personel_id)).filter(Boolean))];
              const satirlar = g.flatMap((x) =>
                ayrintilar(x).map((a) => (g.length > 1 && x.personel_id ? `${personelAdi(x.personel_id)}: ${a}` : a))
              );
              return (
                <li key={k.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="m3 sayi text-xs">
                      {kisaTarih(yerelTarih(k.zaman))} {yerelSaat(k.zaman)}
                    </span>
                    <span className="m1 text-sm font-semibold">{k.kullanici_eposta ?? "Bilinmeyen kullanıcı"}</span>
                    <span className="m2 text-sm">{ozet(k)}</span>
                    {g.length > 1 && <Rozet>{g.length} kayıt</Rozet>}
                  </div>
                  {kisiler.length > 0 && (
                    <p className="m2 mt-0.5 text-xs">
                      {kisiler.slice(0, 4).join(", ")}
                      {kisiler.length > 4 ? ` ve ${kisiler.length - 4} kişi daha` : ""}
                    </p>
                  )}
                  {satirlar.length > 0 && (
                    <details className="mt-1">
                      <summary className="m3 cursor-pointer text-xs">Ayrıntılar</summary>
                      <ul className="m2 mt-1 space-y-0.5 text-xs">
                        {satirlar.slice(0, 30).map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                        {satirlar.length > 30 && <li className="m3">… {satirlar.length - 30} satır daha</li>}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {kayitlar.length >= limit && (
        <div className="flex justify-center">
          <button
            type="button"
            className="btn btn-ikincil btn-kucuk"
            onClick={() => {
              setYukleniyor(true);
              setLimit(limit + SAYFA);
            }}
          >
            Daha eski kayıtlar
          </button>
        </div>
      )}
    </div>
  );
}
