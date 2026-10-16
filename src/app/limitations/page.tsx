import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { LimitationsContent } from "@/components/pages/LimitationsContent";

export const metadata: Metadata = {
  title: "Limitations",
  description:
    "What WAYFINDER can and cannot tell you, which official sources it uses, and why it refuses to display a status no source publishes.",
};

export default function LimitationsPage() {
  return (
    <>
      <SiteHeader />
      <LimitationsContent />
      <SiteFooter />
    </>
  );
}
