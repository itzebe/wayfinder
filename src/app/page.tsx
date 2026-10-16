import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { Hero } from "@/components/landing/Hero";
import {
  ClosingCta,
  HowItWorks,
  LiveAssistance,
  SupportedSituations,
} from "@/components/landing/Sections";

export const metadata: Metadata = {
  title: "WAYFINDER — when plans change, know what to do next",
  description:
    "Understand public-transport, road, severe-weather and flight disruptions, get reliable updates from official sources, and find your next step — in a language you understand.",
};

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <Hero />
        <HowItWorks />
        <LiveAssistance />
        <SupportedSituations />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
