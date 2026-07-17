import GlobalBackButton from "@/components/global-back-button";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://st-market.com"),

  title: {
    default: "ST Market Intelligence",
    template: "%s | ST Market Intelligence",
  },

  description:
    "منصة احترافية لتحليل الأسهم الأمريكية وعقود الخيارات باستخدام القاما والسيولة وتدفقات الأموال الذكية، مع متابعة لحظية لأفضل الفرص.",

  keywords: [
    "الأسهم الأمريكية",
    "الأوبشن",
    "القاما",
    "السيولة",
    "Options Flow",
    "Gamma Exposure",
    "Smart Money",
    "Stock Market",
    "ST Market",
  ],

  authors: [{ name: "ST Market" }],

  creator: "ST Market",
  publisher: "ST Market",

  openGraph: {
    title: "ST Market Intelligence",
    description:
      "منصة احترافية لتحليل الأسهم الأمريكية وعقود الخيارات باستخدام القاما والسيولة.",
    url: "https://st-market.com",
    siteName: "ST Market Intelligence",
    locale: "ar_SA",
    type: "website",
  },

  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GlobalBackButton />
        {children}</body>
    </html>
  );
}
