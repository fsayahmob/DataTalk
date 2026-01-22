import type { Metadata } from "next";
import { Geist, Geist_Mono, Ubuntu, Ubuntu_Mono, Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { StoreProvider } from "@/components/StoreProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Ubuntu fonts for Linux theme
const ubuntu = Ubuntu({
  variable: "--font-ubuntu",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const ubuntuMono = Ubuntu_Mono({
  variable: "--font-ubuntu-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

// Roboto fonts for GCP/Material theme
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "TalkData - Text-to-SQL Dashboard",
  description: "Analyse de données avec intelligence artificielle",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${ubuntu.variable} ${ubuntuMono.variable} ${roboto.variable} ${robotoMono.variable} antialiased`}
      >
        <StoreProvider>
          <LanguageProvider>
            <ThemeProvider>
              <AppShell>{children}</AppShell>
              <Toaster position="bottom-right" richColors />
            </ThemeProvider>
          </LanguageProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
