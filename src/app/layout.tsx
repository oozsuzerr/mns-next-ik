import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwKayit from "./SwKayit";

export const metadata: Metadata = {
  title: "MNS Next IK",
  description: "Akıllı PDKS & İK Yönetim Platformu",
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
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="antialiased">
        {children}
        <SwKayit />
      </body>
    </html>
  );
}
