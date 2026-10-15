import { createClient } from "@supabase/supabase-js";

// Vercel'e yapıştırırken oluşabilen hatalara karşı koruma:
// - baştaki/sondaki boşluk ve tırnaklar temizlenir
// - adresin sonundaki "/" veya "/rest/v1" gibi fazlalıklar atılır
function temizle(deger: string | undefined): string {
  return (deger || "").trim().replace(/^["']|["']$/g, "").trim();
}

const hamUrl = temizle(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = temizle(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Sadece "https://proje.supabase.co" kısmını al
const supabaseUrl = hamUrl ? new URL(hamUrl).origin : "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Oturumu kaydetmeyen ayrı bir istemci. Yönetici, panelden yeni bir panel kullanıcısı
 * hesabı açarken (signUp) kendi oturumu kapanmasın diye kullanılır.
 */
export function geciciIstemci() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "mns-gecici" },
  });
}
