import { createClient } from "@supabase/supabase-js";

// Vercel'e yapıştırırken oluşabilen hatalara karşı koruma:
// - baştaki/sondaki boşluk ve tırnaklar temizlenir
// - değere yanlışlıkla eklenen "DEGISKEN_ADI=" öneki atılır (.env satırının tamamı yapıştırılırsa)
// - adresin sonundaki "/" veya "/rest/v1" gibi fazlalıklar atılır
export function temizle(deger: string | undefined): string {
  return (deger || "")
    .trim()
    .replace(/^[A-Z][A-Z0-9_]*=(?=.)/, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

const hamUrl = temizle(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = temizle(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Sadece "https://proje.supabase.co" kısmını al
export const supabaseUrl = hamUrl ? new URL(hamUrl).origin : "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

