// E-posta gönderimi (Resend). RESEND_API_KEY ve EPOSTA_GONDEREN tanımlı değilse hiçbir şey gönderilmez.
// Yalnızca sunucuda kullanılır; anahtar tarayıcıya gönderilmez.
import { temizle } from "./supabase";

export function epostaAyarli(): boolean {
  return !!temizle(process.env.RESEND_API_KEY) && !!temizle(process.env.EPOSTA_GONDEREN);
}

export async function epostaGonder(alici: string, konu: string, html: string): Promise<boolean> {
  const anahtar = temizle(process.env.RESEND_API_KEY);
  const gonderen = temizle(process.env.EPOSTA_GONDEREN);
  if (!anahtar || !gonderen) return false;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${anahtar}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: gonderen, to: [alici], subject: konu, html }),
  });
  return r.ok;
}

export const htmlKacis = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
