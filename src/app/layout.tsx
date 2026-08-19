import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nomos — Universal Rules-and-Reality Operating System",
  description:
    "Nomos: a universal rules-and-reality operating system. Frozen architecture, deterministic rule engine, end-to-end provenance, and per-jurisdiction package composition.",
  keywords: [
    "Nomos",
    "rules engine",
    "provenance",
    "jurisdiction graph",
    "AfCFTA",
    "ECOWAS",
    "border crossing",
    "Next.js",
    "TypeScript",
  ],
  authors: [{ name: "Nomos" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Nomos",
    description: "A universal rules-and-reality operating system",
    siteName: "Nomos",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nomos",
    description: "A universal rules-and-reality operating system",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
          <Sonner position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
