import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";

import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: true,
});

/**
 * Fraunces is used only for editorial display headings, with its softer optical
 * sizing turned off so headlines read as precise rather than decorative.
 */
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["SOFT", "WONK"],
});

export const metadata: Metadata = {
  title: {
    default: "WAYFINDER — when plans change, know what to do next",
    template: "%s · WAYFINDER",
  },
  description:
    "WAYFINDER helps you understand unexpected situations — public-transport, road, severe-weather and flight disruptions — get reliable updates from official sources, and find your next step — in a language you understand.",
  applicationName: "WAYFINDER",
  robots: { index: true, follow: true },
  openGraph: {
    title: "WAYFINDER — when plans change, know what to do next",
    description:
      "Understand disruptions, get reliable updates, and find your next step — in a language you understand.",
    type: "website",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#fbfaf7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-dvh antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
