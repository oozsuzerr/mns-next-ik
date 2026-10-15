import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";
import "./tasarim.css";
import SwKayit from "./SwKayit";
import { BildirimSaglayici } from "../components/ui";

const baslikFont = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-baslik",
  display: "swap",
});

const govdeFont = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-govde",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MNS Next IK",
  description: "Akıllı PDKS ve İK yönetim platformu",
  applicationName: "MNS Next IK",
  appleWebApp: {
    capable: true,
    title: "MNS IK",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1118" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${baslikFont.variable} ${govdeFont.variable}`}>
      <body>
        <BildirimSaglayici>{children}</BildirimSaglayici>
        <SwKayit />
      </body>
    </html>
  );
}
