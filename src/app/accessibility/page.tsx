import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { AccessibilityContent } from "@/components/pages/AccessibilityContent";

export const metadata: Metadata = {
  title: "Accessibility",
  description:
    "How WAYFINDER is built towards WCAG 2.2 AA, including keyboard support, colour contrast, reduced motion and screen-reader behaviour.",
};

export default function AccessibilityPage() {
  return (
    <>
      <SiteHeader />
      <AccessibilityContent />
      <SiteFooter />
    </>
  );
}
