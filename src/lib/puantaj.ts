import { ayGunSayisi, GUN_ADLARI, gunStr, haftaGunu, planAni, sureYaz, yerelSaat, yerelTarih } from "./tarih";
import { MAKS_VARDIYA_MS, mesaiSonSiniri } from "./mesai";
import { gunPlani, planHaritasi, vardiyaAni, vardiyaCozucu, type PlanSatiri } from "./vardiyaPlani";
import { ayarlariTamamla, DK_MS, type Ayarlar } from "./ayarlar";

// ---------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------
export interface VardiyaT {
  id: string;
  ad: string;
  baslangic_saat: string;
  bitis_saat: string;
  mola_dakika: number;
}

export interface PersonelT {
  id: string;
  sicil_no: string;
  ad: string;
  soyad: string;
  departman: string | null;
  varsayilan_sube_id: string | null;
  aktif: boolean;
  created_at: string;
  subeler?: { ad: string } | null;
  vardiyalar?: VardiyaT | null;
}

export interface HareketT {
  id: string;
  personel_id: string;
  islem_turu: string;
  created_at: string;
  manuel?: boolean;
}

export interface IzinT {
  personel_id: string;
  izin_turu: string;
  /** Saatlik izinde başlangıç ve bitiş saati ("10:00:00") */
  baslangic_saat?: string | null;
  bitis_saat?: string | null;
  sgk_kodu?: string | null;
  baslangic_tarihi: string;
  bitis_tarihi: string;
  aciklama: string | null;
  durum?: string;
}

export interface TatilT {
  tarih: string;
  ad: string;
}

export interface GunDetay {
  gun: number;
  tarih: string;
  gunAdi: string;
  giris: string;
  cikis: string;
  netCalisma: string;
  durum: string;
  not: string;
  tip: "calisma" | "eksik" | "rapor" | "izin" | "devamsiz" | "tatil" | "bos";
}

export interface PuantajSatiri {
  id: string;
  sicil_no: string;
  adSoyad: string;
  departman: string;
  subeAdi: string;
  subeId: string | null;
  vardiyaAdi: string;
  calisilanGunler: number;
  eksikGunler: number;
  raporluGunler: number;
  izinliGunler: number;
  devamsizGunler: number;
  resmiTatilCalismalari: number;
  haftaTatiliCalismalari: number;
  toplamCalismaDk: number;
  planDisiMesaiDk: number;
  resmiTatilMesaiDk: number;
  haftaTatiliMesaiDk: number;
  gecikmeDk: number;
  gunlukDetaylar: GunDetay[];
}

export interface PuantajGirdi {
  yil: number;
  ay: number;
  personeller: PersonelT[];
  hareketler: HareketT[];
  izinler: IzinT[];
  resmiTatiller: TatilT[];
  vardiyalar: VardiyaT[];
  /** Vardiya planı (yoksa varsayılan vardiya ve Pazar tatili geçerli) */
  planlar?: PlanSatiri[];
  /** Tolerans kuralları (yoksa varsayılanlar) */
  ayarlar?: Partial<Ayarlar> | null;
  /** Türkiye saatine göre bugün: "2026-10-13" */
  bugun: string;
  simdi: Date;
}

// ---------------------------------------------------------------------
// Kurallar (gerekirse buradan değiştirin)
// ---------------------------------------------------------------------
// Gecikme, mesai ve mola eşikleri şirket ayarlarından gelir (bkz. lib/ayarlar.ts)

// ---------------------------------------------------------------------
// Giriş-çıkış eşleştirme (gece vardiyası ve çoklu çift destekli)
// ---------------------------------------------------------------------
interface Oturum {
  giris: Date | null;
  cikis: Date | null;
  girisManuel: boolean;
  cikisManuel: boolean;
}

function oturumlariOlustur(hareketler: HareketT[]): Oturum[] {
  const sirali = [...hareketler].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const sonuc: Oturum[] = [];
  let acik: { t: Date; manuel: boolean } | null = null;

  for (const h of sirali) {
    const t = new Date(h.created_at);
    const manuel = !!h.manuel;

    if (h.islem_turu === "İşe Giriş") {
      if (acik) {
        sonuc.push({ giris: acik.t, cikis: null, girisManuel: acik.manuel, cikisManuel: false });
      }
      acik = { t, manuel };
    } else if (h.islem_turu === "İşe Çıkış") {
      if (acik && t.getTime() - acik.t.getTime() <= MAKS_VARDIYA_MS) {
        sonuc.push({ giris: acik.t, cikis: t, girisManuel: acik.manuel, cikisManuel: manuel });
        acik = null;
      } else {
        if (acik) {
          sonuc.push({ giris: acik.t, cikis: null, girisManuel: acik.manuel, cikisManuel: false });
          acik = null;
        }
        sonuc.push({ giris: null, cikis: t, girisManuel: false, cikisManuel: manuel });
      }
    }
  }

  if (acik) {
    sonuc.push({ giris: acik.t, cikis: null, girisManuel: acik.manuel, cikisManuel: false });
  }
  return sonuc;
}

// ---------------------------------------------------------------------
// Aylık puantaj
// ---------------------------------------------------------------------
export function aylikPuantajHesapla(g: PuantajGirdi): PuantajSatiri[] {
  const gunSayisi = ayGunSayisi(g.yil, g.ay);
  const ayOnek = `${g.yil}-${String(g.ay).padStart(2, "0")}`;
  const tatilHaritasi = new Map<string, string>(g.resmiTatiller.map((t) => [t.tarih, t.ad]));
  const planlar = planHaritasi(g.planlar ?? []);
  const ayar = ayarlariTamamla(g.ayarlar);
  const cikisToleransMs = ayar.cikis_tolerans_dk * DK_MS;
  const vardiyaHaritasi = new Map(g.vardiyalar.map((v) => [v.id, v]));
  const vardiyaBul = (id: string) => vardiyaHaritasi.get(id);

  const hareketlerPersonele = new Map<string, HareketT[]>();
  for (const h of g.hareketler) {
    const liste = hareketlerPersonele.get(h.personel_id);
    if (liste) liste.push(h);
    else hareketlerPersonele.set(h.personel_id, [h]);
  }

  const dahilPersoneller = g.personeller.filter((p) => {
    if (p.aktif) return true;
    // Pasif personel, o ay hareketi varsa yine de puantajda görünür (işten ayrılan)
    const ham = hareketlerPersonele.get(p.id) ?? [];
    return ham.some((h) => yerelTarih(h.created_at).startsWith(ayOnek));
  });

  return dahilPersoneller.map((p) => {
    const ham = hareketlerPersonele.get(p.id) ?? [];
    const oturumlar = oturumlariOlustur(ham);

    const vardiya: VardiyaT | null = p.vardiyalar ?? g.vardiyalar[0] ?? null;
    const gunPlaniBul = (tarih: string) => gunPlani(planlar.get(`${p.id}|${tarih}`), tarih, vardiya, vardiyaBul);
    const cozucu = vardiyaCozucu(gunPlaniBul, ayar.erken_giris_payi_dk * DK_MS);
    const bitisBul = (an: Date) => cozucu(an)?.son ?? null;

    // Oturum, girişinin ait olduğu planlı vardiyanın gününe yazılır (gece vardiyasına erken giriş dahil)
    const gunHaritasi = new Map<string, Oturum[]>();
    for (const o of oturumlar) {
      const an = (o.giris ?? o.cikis) as Date;
      const anahtar = (o.giris && cozucu(o.giris)?.tarih) || yerelTarih(an);
      const liste = gunHaritasi.get(anahtar);
      if (liste) liste.push(o);
      else gunHaritasi.set(anahtar, [o]);
    }

    const kadroBaslangic = yerelTarih(p.created_at);
    const personelIzinleri = g.izinler.filter(
      (iz) => iz.personel_id === p.id && (!iz.durum || iz.durum === "ONAYLANDI")
    );
    let calisilan = 0;
    let eksikGun = 0;
    let raporlu = 0;
    let izinli = 0;
    let devamsiz = 0;
    let resmiTatilCalisma = 0;
    let haftaTatiliCalisma = 0;
    let toplamDk = 0;
    let planDisiDk = 0;
    let resmiTatilDk = 0;
    let haftaTatiliDk = 0;
    let gecikmeDk = 0;
    const detaylar: GunDetay[] = [];

    for (let gun = 1; gun <= gunSayisi; gun++) {
      const tarih = gunStr(g.yil, g.ay, gun);
      const hg = haftaGunu(tarih);
      const gp = gunPlaniBul(tarih);
      const haftaTatili = gp.tatil;
      const haftaTatiliMetni = gp.kaynak === "plan" ? "Hafta Tatili (Plan)" : "Hafta Tatili (Pazar)";
      const tatilAdi = tatilHaritasi.get(tarih);
      const isGunu = !haftaTatili && !tatilAdi;

      const oturum = gunHaritasi.get(tarih) ?? [];
      const tam = oturum.filter((o) => o.giris && o.cikis);
      // Çıkışsız giriş, vardiya bitişi + fazla mesai payı dolana kadar "devam ediyor" sayılır (bkz. lib/mesai.ts)
      const devamEdiyor = (o: Oturum) =>
        !!o.giris && !o.cikis && g.simdi.getTime() < mesaiSonSiniri(o.giris, bitisBul, cikisToleransMs);
      const mesaide = oturum.some(devamEdiyor);
      const eksik = oturum.filter((o) => (!o.giris || !o.cikis) && !devamEdiyor(o));

      const aktifIzin = personelIzinleri.find(
        (iz) => iz.izin_turu !== "Saatlik İzin" && tarih >= iz.baslangic_tarihi && tarih <= iz.bitis_tarihi
      );
      // O günün onaylı saatlik izinleri (ör. 10:00-12:00): bu aralıktaki gecikme sayılmaz
      const saatlikIzinler = personelIzinleri
        .filter((iz) => iz.izin_turu === "Saatlik İzin" && iz.baslangic_tarihi === tarih && iz.baslangic_saat && iz.bitis_saat)
        .map((iz) => ({
          bas: planAni(tarih, iz.baslangic_saat as string).getTime(),
          son: planAni(tarih, iz.bitis_saat as string).getTime(),
          metin: `${(iz.baslangic_saat as string).slice(0, 5)}-${(iz.bitis_saat as string).slice(0, 5)}`,
        }));

      let durum = "";
      let tip: GunDetay["tip"] = "bos";
      let not = "";
      let girisStr = "-";
      let cikisStr = "-";
      let netDk = 0;

      if (oturum.length > 0) {
        const ilkGiris = oturum.find((o) => o.giris)?.giris ?? null;
        const sonCikisHerhangi = [...oturum].reverse().find((o) => o.cikis)?.cikis ?? null;

        if (ilkGiris) girisStr = yerelSaat(ilkGiris);
        if (sonCikisHerhangi) cikisStr = yerelSaat(sonCikisHerhangi);

        if (oturum.some((o) => o.girisManuel)) not += "Giriş: Manuel Düzeltildi. ";
        if (oturum.some((o) => o.cikisManuel)) not += "Çıkış: Manuel Düzeltildi. ";
        if (tam.length > 1) not += `${tam.length} giriş-çıkış çifti. `;
        if (aktifIzin) not += "İzinli günde çalışıldı. ";
        for (const iz of saatlikIzinler) not += `Saatlik izin ${iz.metin}. `;

        if (tam.length > 0) {
          const brut = tam.reduce(
            (t, o) =>
              t + Math.max(0, Math.round(((o.cikis as Date).getTime() - (o.giris as Date).getTime()) / 60000)),
            0
          );
          // Mola: o günün planlı vardiyalarının molası (bölünmüş çalışmada toplamı); plan yoksa varsayılan vardiya
          const molaVardiyalari = gp.vardiyalar.length > 0 ? gp.vardiyalar : vardiya ? [vardiya] : [];
          const mola = molaVardiyalari.reduce((t, v) => t + (v.mola_dakika || 0), 0);
          netDk = molaVardiyalari.length > 0 && brut >= ayar.mola_esigi_dk ? Math.max(0, brut - mola) : brut;

          calisilan++;
          toplamDk += netDk;
          tip = "calisma";

          if (tatilAdi) {
            resmiTatilCalisma++;
            resmiTatilDk += netDk;
            durum = `Resmi Tatil Çalışması (${tatilAdi})`;
          } else if (haftaTatili) {
            haftaTatiliCalisma++;
            haftaTatiliDk += netDk;
            durum = `${haftaTatiliMetni.replace("Hafta Tatili", "Hafta Tatili Çalışması")}`;
          } else {
            durum = "Fiili Çalışma";

            // Her planlı vardiya kendi oturumlarıyla karşılaştırılır (bölünmüş çalışmada sabah ve akşam ayrı ayrı)
            for (const v of gp.vardiyalar) {
              const plan = vardiyaAni(tarih, v);
              const kendi = oturum.filter((o) => {
                if (!o.giris) return false;
                const enYakin = gp.vardiyalar.reduce((a, b) =>
                  Math.abs(vardiyaAni(tarih, b).bas - (o.giris as Date).getTime()) <
                  Math.abs(vardiyaAni(tarih, a).bas - (o.giris as Date).getTime())
                    ? b
                    : a
                );
                return enYakin.id === v.id;
              });
              const vGiris = kendi.find((o) => o.giris)?.giris ?? null;
              const vCikis = [...kendi].reverse().find((o) => o.giris && o.cikis)?.cikis ?? null;

              if (vGiris) {
                // Vardiya başı ile giriş arasındaki süreden, o aralığa denk gelen saatlik izin düşülür
                const izinliDk = saatlikIzinler.reduce(
                  (t, iz) => t + Math.max(0, Math.min(iz.son, vGiris.getTime()) - Math.max(iz.bas, plan.bas)) / 60000,
                  0
                );
                const gecikme = Math.round((vGiris.getTime() - plan.bas) / 60000 - izinliDk);
                if (gecikme > ayar.gecikme_tolerans_dk) gecikmeDk += gecikme;
              }
              if (vCikis) {
                const mesai = Math.round((vCikis.getTime() - plan.son) / 60000);
                if (mesai > ayar.mesai_tolerans_dk) planDisiDk += mesai;
              }
            }
          }
        } else if (mesaide) {
          calisilan++;
          tip = "calisma";
          durum = "Mesaide (çıkış bekleniyor)";
        }

        if (eksik.length > 0) {
          eksikGun++;
          tip = "eksik";
          durum = durum ? `${durum} + Eksik Hareket` : "Eksik Hareket (Giriş/Çıkış)";
          if (eksik.some((o) => !o.giris)) not += "Giriş kaydı yok. ";
          if (eksik.some((o) => !o.cikis)) not += "Çıkış kaydı yok. ";
        }
      } else if (aktifIzin) {
        const rapor = aktifIzin.izin_turu.includes("Rapor");
        if (rapor) {
          // SGK eksik gün sayımında rapor, takvim gününe göre sayılır
          raporlu++;
          tip = "rapor";
          durum = `Sağlık Raporu [${aktifIzin.sgk_kodu || "01"}]`;
        } else if (isGunu) {
          izinli++;
          tip = "izin";
          durum = `${aktifIzin.izin_turu} [${aktifIzin.sgk_kodu || "İzin"}]`;
        } else {
          tip = "tatil";
          durum = tatilAdi ? `Resmi Tatil (${tatilAdi})` : haftaTatiliMetni;
        }
        not = aktifIzin.aciklama || "";
      } else if (tatilAdi) {
        tip = "tatil";
        durum = `Resmi Tatil (${tatilAdi})`;
      } else if (haftaTatili) {
        tip = "tatil";
        durum = haftaTatiliMetni;
      } else if (tarih < kadroBaslangic) {
        durum = "Kadro Öncesi";
      } else if (tarih > g.bugun) {
        durum = "";
      } else if (tarih === g.bugun) {
        durum = "Bugün (henüz giriş yok)";
      } else {
        devamsiz++;
        tip = "devamsiz";
        durum = "Devamsız";
      }

      detaylar.push({
        gun,
        tarih,
        gunAdi: GUN_ADLARI[hg],
        giris: girisStr,
        cikis: cikisStr,
        netCalisma: netDk > 0 ? sureYaz(netDk) : "-",
        durum,
        not: not.trim(),
        tip,
      });
    }

    return {
      id: p.id,
      sicil_no: p.sicil_no,
      adSoyad: `${p.ad} ${p.soyad}`,
      departman: p.departman || "Genel",
      subeAdi: p.subeler?.ad || "Atanmamış",
      subeId: p.varsayilan_sube_id,
      vardiyaAdi: vardiya?.ad || "Tanımsız",
      calisilanGunler: calisilan,
      eksikGunler: eksikGun,
      raporluGunler: raporlu,
      izinliGunler: izinli,
      devamsizGunler: devamsiz,
      resmiTatilCalismalari: resmiTatilCalisma,
      haftaTatiliCalismalari: haftaTatiliCalisma,
      toplamCalismaDk: toplamDk,
      planDisiMesaiDk: planDisiDk,
      resmiTatilMesaiDk: resmiTatilDk,
      haftaTatiliMesaiDk: haftaTatiliDk,
      gecikmeDk,
      gunlukDetaylar: detaylar,
    };
  });
}
