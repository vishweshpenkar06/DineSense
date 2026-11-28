import type { Metadata, Viewport } from "next";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "./globals.css";
import { PwaRegister } from "./pwa-register";
import { AppToaster } from "@/components/app-toaster";
import { ThemeProvider, ThemeScript } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "DineSense",
  description: "Local-first restaurant table management",
  applicationName: "DineSense",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DineSense",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0A08",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <ThemeScript />
        <ThemeProvider>
          <PwaRegister />
          {children}
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
