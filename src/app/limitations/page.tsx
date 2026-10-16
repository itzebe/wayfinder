import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { LimitationsContent } from "@/components/pages/LimitationsContent";

export const metadata: Metadata = {
  title: "Limitations",
  description:
    "What WAYFINDER can and cannot tell you, which data it uses, and why it refuses to display per-flight status.",
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
