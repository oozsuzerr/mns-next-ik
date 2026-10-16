// Telefona anlık bildirim: SUNUCU tarafı. Yalnızca src/app/api altındaki dosyalardan
// içe aktarılmalıdır (service_role anahtarı ve VAPID gizli anahtarı kullanır).
import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl, temizle } from "./supabase";

export interface Mesaj {
  baslik: string;
  metin: string;
  /** Bildirime dokununca açılacak sayfa */
  adres: string;
  /** Aynı etiketli bildirim öncekinin yerine geçer */
  etiket?: string;
}

export function servisIstemcisi(): SupabaseClient {
  const anahtar = temizle(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!anahtar) throw new Error("SUNUCU_ANAHTARI_YOK");
  return createClient(supabaseUrl, anahtar, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** İsteği yapan panel kullanıcısının yetkileriyle çalışan istemci (veritabanı kuralları geçerli) */
export function kullaniciIstemcisi(token: string): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let vapidHazir = false;
function vapidKur() {
  if (vapidHazir) return;
  const acik = temizle(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const gizli = temizle(process.env.VAPID_PRIVATE_KEY);
  if (!acik || !gizli) throw new Error("BILDIRIM_ANAHTARI_YOK");
  webpush.setVapidDetails(temizle(process.env.VAPID_KONU) || "https://github.com/oozsuzerr/mns-next-ik", acik, gizli);
  vapidHazir = true;
}

/**
 * Panel kullanıcılarına ve/veya personele bildirim gönderir.
 * Artık geçerli olmayan abonelikler (telefon değişti, izin kaldırıldı) silinir.
 */
export async function bildirimGonder(
  servis: SupabaseClient,
  hedef: { kullanicilar?: string[]; personeller?: string[] },
  mesaj: Mesaj
): Promise<number> {
  vapidKur();
  const kullanicilar = [...new Set(hedef.kullanicilar ?? [])];
  const personeller = [...new Set(hedef.personeller ?? [])];
  if (kullanicilar.length === 0 && personeller.length === 0) return 0;

  const kosullar: string[] = [];
  if (kullanicilar.length) kosullar.push(`user_id.in.(${kullanicilar.join(",")})`);
  if (personeller.length) kosullar.push(`personel_id.in.(${personeller.join(",")})`);
  const { data, error } = await servis.from("push_abonelikleri").select("endpoint, p256dh, auth").or(kosullar.join(","));
  if (error) throw error;

  let gonderilen = 0;
  await Promise.all(
    (data ?? []).map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          JSON.stringify(mesaj),
          { TTL: 24 * 60 * 60 }
        );
        gonderilen++;
      } catch (err) {
        const kod = (err as { statusCode?: number }).statusCode;
        if (kod === 404 || kod === 410) await servis.from("push_abonelikleri").delete().eq("endpoint", a.endpoint);
      }
    })
  );
  return gonderilen;
}

/**
 * Bir şubeden sorumlu panel kullanıcıları: O FİRMANIN genel yöneticileri ve o şubeye atanmış,
 * istenen yetkiye sahip şube müdürleri. Firma bilinmiyorsa kimseye gönderilmez
 * (service_role veritabanı kurallarını atladığı için firma burada açıkça süzülür).
 */
export async function sorumlular(
  servis: SupabaseClient,
  kapsam: { firmaId: string | null | undefined; subeId: string | null | undefined },
  yetki: string
): Promise<string[]> {
  const { firmaId, subeId } = kapsam;
  if (!firmaId) return [];
  const { data: yoneticiler, error } = await servis.from("yoneticiler").select("user_id, rol, yetkiler").eq("firma_id", firmaId);
  if (error) throw error;
  const { data: atamalar } = subeId
    ? await servis.from("yonetici_subeleri").select("user_id").eq("sube_id", subeId)
    : { data: [] as { user_id: string }[] };
  const subedekiler = new Set((atamalar ?? []).map((a) => a.user_id));
  return (yoneticiler ?? [])
    .filter(
      (y) =>
        y.rol === "GENEL" ||
        (y.rol === "SUBE" && subedekiler.has(y.user_id) && ((y.yetkiler as string[] | null) ?? []).includes(yetki))
    )
    .map((y) => y.user_id as string);
}
