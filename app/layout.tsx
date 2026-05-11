import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SideNav } from "@/components/SideNav";
import { MobileNav } from "@/components/MobileNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "yellowdog · 은퇴 자산 관리",
  description: "세금은 낮추고, 현금 흐름은 끝까지. 정보 위키 + 시뮬레이터 + OCR 자산관리",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbbf24",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: "only light" }}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-neutral-50 text-neutral-900" suppressHydrationWarning>
        <div className="mx-auto flex min-h-screen w-full max-w-6xl overflow-x-hidden">
          <SideNav />
          <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
            <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:py-10 md:pb-10">{children}</main>
          </div>
        </div>
        <MobileNav />
      </body>
    </html>
  );
}
