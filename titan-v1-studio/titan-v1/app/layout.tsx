import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/hooks/useToasts";
import { Toasts } from "@/components/Toasts";

const sans = Archivo({ subsets: ["latin"], variable: "--font-sans", display: "swap", axes: ["wdth"] });
const mono = Martian_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Titan Studio",
  description: "Write a prompt, get a finished vertical video with voice-over and music.",
};
export const viewport: Viewport = { themeColor: "#080808", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <ToastProvider>
          {children}
          <Toasts />
        </ToastProvider>
      </body>
    </html>
  );
}
