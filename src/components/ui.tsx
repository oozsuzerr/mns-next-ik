"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// =====================================================================
// İkonlar (satır içi SVG, ek paket gerekmez)
// =====================================================================
const YOLLAR = {
  bakis: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="9" rx="2" />
      <rect x="13" y="3.5" width="7.5" height="5.5" rx="2" />
      <rect x="13" y="11" width="7.5" height="9.5" rx="2" />
      <rect x="3.5" y="14.5" width="7.5" height="6" rx="2" />
    </>
  ),
  puantaj: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  takvim: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  talepler: (
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  mesai: (
    <>
      <circle cx="11" cy="13.5" r="7.5" />
      <polyline points="11 10 11 13.5 13.5 15" />
      <path d="M9 3h4M18.5 3.5v5M16 6h5" />
    </>
  ),
  hareket: <polyline points="3 12 7.5 12 10 5 14 19 16.5 12 21 12" />,
  personel: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M17 14.2c2.6.1 4.5 2 4.5 4.8" />
    </>
  ),
  vardiya: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>
  ),
  indir: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 11 4.5 4.5 4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  arti: <path d="M12 5v14M5 12h14" />,
  ara: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  tik: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  kapat: <path d="M6 6l12 12M18 6 6 18" />,
  konum: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  cikis: (
    <>
      <path d="M9 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </>
  ),
  gunes: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  ay: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  yenile: (
    <>
      <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 14.5 4.5L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </>
  ),
  anahtar: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8M16 7l3 3M14 9l2 2" />
    </>
  ),
  kilit: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  kilitac: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 7.5-1.8" />
    </>
  ),
  telefon: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  uyari: (
    <>
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  bilgi: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.1" />
    </>
  ),
  bina: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 20.5v-4h4v4" />
    </>
  ),
  asagi: <path d="m6 9 6 6 6-6" />,
  sag: <path d="m9 6 6 6-6 6" />,
  goz: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  gozkapali: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M4 4l16 16" />
    </>
  ),
  rapor: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  kalem: <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4Z" />,
  cop: (
    <>
      <path d="M4.5 7h15M10 7V4.5h4V7" />
      <path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
    </>
  ),
  daha: (
    <>
      <circle cx="5.5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18.5" cy="12" r="1.6" />
    </>
  ),
  ik: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17" />
    </>
  ),
  guc: (
    <>
      <path d="M12 3.5v8" />
      <path d="M7 6.8a7.5 7.5 0 1 0 10 0" />
    </>
  ),
} as const;

export type IkonAdi = keyof typeof YOLLAR;

export function Ikon({ ad, boyut = 18, className }: { ad: IkonAdi; boyut?: number; className?: string }) {
  return (
    <svg
      width={boyut}
      height={boyut}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      style={{ flex: "none" }}
    >
      {YOLLAR[ad]}
    </svg>
  );
}

// =====================================================================
// Marka, avatar, rozet
// =====================================================================
export function Marka({ boyut = 36 }: { boyut?: number }) {
  return (
    <svg width={boyut} height={boyut} viewBox="0 0 40 40" aria-hidden="true" style={{ flex: "none" }}>
      <rect width="40" height="40" rx="11" fill="#11253a" />
      <path
        d="M11 29V12.5L20 22l9-9.5V29"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="31" cy="9.5" r="3.2" fill="#2cc2ad" />
    </svg>
  );
}

export function Avatar({ ad, soyad, boyut = 36 }: { ad: string; soyad: string; boyut?: number }) {
  const bas = `${ad[0] ?? ""}${soyad[0] ?? ""}`.toLocaleUpperCase("tr-TR");
  let h = 0;
  for (const c of `${ad}${soyad}`) h = (h * 31 + c.charCodeAt(0)) % 6;
  return (
    <span
      className={`avatar av-${h}`}
      style={{ width: boyut, height: boyut, fontSize: Math.round(boyut * 0.38) }}
      aria-hidden="true"
    >
      {bas}
    </span>
  );
}

export type RozetTon = "notr" | "giris" | "cikis" | "uyari" | "hata" | "izin";

export function Rozet({ ton = "notr", children }: { ton?: RozetTon; children: ReactNode }) {
  return <span className={`rozet rozet-${ton}`}>{children}</span>;
}

export function Iskelet({ genislik = "100%", yukseklik = 16 }: { genislik?: string | number; yukseklik?: number }) {
  return <div className="iskelet" style={{ width: genislik, height: yukseklik }} />;
}

export function Bos({
  ikon,
  baslik,
  metin,
  children,
}: {
  ikon: IkonAdi;
  baslik: string;
  metin?: string;
  children?: ReactNode;
}) {
  return (
    <div className="text-center px-6 py-12">
      <div className="bos-ikon mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full">
        <Ikon ad={ikon} boyut={20} />
      </div>
      <p className="m1 font-semibold">{baslik}</p>
      {metin && <p className="m2 mx-auto mt-1 max-w-sm text-sm">{metin}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

// =====================================================================
// Pencere (telefonda alttan açılan panel, masaüstünde ortada)
// =====================================================================
export function Modal({
  onKapat,
  baslik,
  children,
  genis = false,
}: {
  onKapat: () => void;
  baslik: string;
  children: ReactNode;
  genis?: boolean;
}) {
  useEffect(() => {
    const onay = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKapat();
    };
    window.addEventListener("keydown", onay);
    const onceki = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onay);
      document.body.style.overflow = onceki;
    };
  }, [onKapat]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={baslik}
    >
      <div className="perde absolute inset-0" onClick={onKapat} />
      <div
        className={`sheet relative flex max-h-[92vh] w-full flex-col ${genis ? "sm:max-w-3xl" : "sm:max-w-md"}`}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h3 className="baslik-font m1 text-xl">{baslik}</h3>
          <button type="button" onClick={onKapat} className="btn btn-hayalet btn-ikon btn-kucuk" aria-label="Kapat">
            <Ikon ad="kapat" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

// =====================================================================
// Açılır menü
// =====================================================================
export function AcilirMenu({
  tetikleyici,
  children,
  sinif = "btn btn-ikincil",
  hizala = "sag",
  etiket,
}: {
  tetikleyici: ReactNode;
  children: (kapat: () => void) => ReactNode;
  sinif?: string;
  hizala?: "sag" | "sol";
  etiket: string;
}) {
  const [acik, setAcik] = useState(false);
  const kapat = useCallback(() => setAcik(false), []);

  useEffect(() => {
    if (!acik) return;
    const onay = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAcik(false);
    };
    window.addEventListener("keydown", onay);
    return () => window.removeEventListener("keydown", onay);
  }, [acik]);

  return (
    <div className="relative">
      <button
        type="button"
        className={sinif}
        aria-haspopup="menu"
        aria-expanded={acik}
        aria-label={etiket}
        onClick={() => setAcik(!acik)}
      >
        {tetikleyici}
      </button>
      {acik && (
        <>
          <div className="fixed inset-0 z-40" onClick={kapat} />
          <div role="menu" className={`menu-kutu absolute z-50 mt-2 ${hizala === "sag" ? "right-0" : "left-0"}`}>
            {children(kapat)}
          </div>
        </>
      )}
    </div>
  );
}

// =====================================================================
// Bildirim ve onay sistemi (alert/confirm yerine)
// =====================================================================
type BildirimTuru = "basari" | "hata" | "bilgi";

interface Bildirim {
  id: number;
  metin: string;
  tur: BildirimTuru;
}

interface OnayIstegi {
  baslik: string;
  metin?: string;
  onayEtiketi?: string;
  tehlikeli?: boolean;
  coz: (sonuc: boolean) => void;
}

interface BildirimBaglam {
  bildir: (metin: string, tur?: BildirimTuru) => void;
  onayla: (istek: Omit<OnayIstegi, "coz">) => Promise<boolean>;
}

const BildirimBaglami = createContext<BildirimBaglam | null>(null);

export function useBildirim(): BildirimBaglam {
  const baglam = useContext(BildirimBaglami);
  if (!baglam) throw new Error("useBildirim, BildirimSaglayici içinde kullanılmalı");
  return baglam;
}

export function BildirimSaglayici({ children }: { children: ReactNode }) {
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([]);
  const [onay, setOnay] = useState<OnayIstegi | null>(null);
  const sayac = useRef(0);

  const bildir = useCallback((metin: string, tur: BildirimTuru = "bilgi") => {
    const id = ++sayac.current;
    setBildirimler((liste) => [...liste, { id, metin, tur }]);
    setTimeout(() => setBildirimler((liste) => liste.filter((b) => b.id !== id)), tur === "hata" ? 6500 : 3800);
  }, []);

  const onayla = useCallback(
    (istek: Omit<OnayIstegi, "coz">) => new Promise<boolean>((coz) => setOnay({ ...istek, coz })),
    []
  );

  const onayKapat = useCallback(
    (sonuc: boolean) => {
      onay?.coz(sonuc);
      setOnay(null);
    },
    [onay]
  );

  const deger = useMemo(() => ({ bildir, onayla }), [bildir, onayla]);

  return (
    <BildirimBaglami.Provider value={deger}>
      {children}

      <div className="toast-alani" aria-live="polite">
        {bildirimler.map((b) => (
          <div key={b.id} className={`toast toast-${b.tur}`} role="status">
            <Ikon ad={b.tur === "hata" ? "uyari" : b.tur === "basari" ? "tik" : "bilgi"} />
            <span>{b.metin}</span>
          </div>
        ))}
      </div>

      {onay && (
        <Modal onKapat={() => onayKapat(false)} baslik={onay.baslik}>
          {onay.metin && <p className="m2 mb-5 text-sm">{onay.metin}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ikincil" onClick={() => onayKapat(false)}>
              Vazgeç
            </button>
            <button
              type="button"
              className={`btn ${onay.tehlikeli ? "btn-tehlike" : "btn-ana"}`}
              onClick={() => onayKapat(true)}
              autoFocus
            >
              {onay.onayEtiketi ?? "Onayla"}
            </button>
          </div>
        </Modal>
      )}
    </BildirimBaglami.Provider>
  );
}
