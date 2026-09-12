import type { Metadata } from "next";
import {
  Noto_Sans,
  Noto_Sans_Devanagari,
  Noto_Sans_Gujarati,
  DM_Serif_Display,
} from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const notoSans = Noto_Sans({
  subsets: ["latin"],
  variable: "--font-noto-sans",
  display: "swap",
});

const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-devanagari",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const notoSansGujarati = Noto_Sans_Gujarati({
  subsets: ["gujarati"],
  variable: "--font-noto-gujarati",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  title: "AEGIS — Audit & Compliance Platform",
  description:
    "Internal Audit & RBI Compliance Management for Urban Cooperative Banks",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${notoSans.variable} ${notoSansDevanagari.variable} ${notoSansGujarati.variable} ${dmSerifDisplay.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
