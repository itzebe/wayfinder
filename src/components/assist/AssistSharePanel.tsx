"use client";

import { useState } from "react";
import { Check, Copy, Download, Printer, Share2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { AssistancePage } from "@/lib/assist/types";

/**
 * Share and save for a generic situation page.
 *
 * Produces a plain-text summary of the verified facts, the recommended steps and
 * the official sources. It carries no personal information beyond what the
 * traveller themselves typed, because the summary is likely to be pasted into a
 * chat or an email.
 */
export function AssistSharePanel({ assistance }: { assistance: AssistancePage }) {
  const { t, locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const summary = buildSummary(assistance, t);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setCopyFailed(false);
      window.setTimeout(() => setCopied(false), 4_000);
    } catch {
      setCopyFailed(true);
      setCopied(false);
    }
  };

  const onDownload = () => {
    const blob = new Blob([summary], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wayfinder-${assistance.category}-${locale}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const onShare = async () => {
    if (typeof navigator.share !== "function") {
      void onCopy();
      return;
    }
    try {
      await navigator.share({ title: t("share.title"), text: summary });
    } catch {
      // The traveller dismissed the share sheet; that is not an error.
    }
  };

  const [canShare] = useState(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={onCopy}>
          {copied ? (
            <>
              <Check className="size-4" aria-hidden="true" />
              {t("share.copied")}
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" />
              {t("share.copy")}
            </>
          )}
        </Button>

        {canShare ? (
          <Button variant="secondary" size="sm" onClick={onShare}>
            <Share2 className="size-4" aria-hidden="true" />
            {t("share.share")}
          </Button>
        ) : null}

        <Button variant="ghost" size="sm" onClick={onDownload}>
          <Download className="size-4" aria-hidden="true" />
          {t("share.download")}
        </Button>

        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden="true" />
          {t("share.print")}
        </Button>
      </div>

      {copyFailed ? (
        <Callout tone="warning" compact>
          {t("share.copyFailed")}
        </Callout>
      ) : null}

      <details className="rounded-md border border-line-soft bg-paper-50">
        <summary className="flex min-h-11 cursor-pointer items-center px-3.5 text-sm font-medium text-ink-700 hover:text-ink-900">
          {t("share.preview")}
        </summary>
        <pre className="max-h-72 overflow-auto border-t border-line-soft px-3.5 py-3 text-xs leading-relaxed text-ink-700">
          <code className="whitespace-pre-wrap break-words">{summary}</code>
        </pre>
      </details>
    </div>
  );
}

function buildSummary(
  assistance: AssistancePage,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const lines: string[] = [];

  lines.push(`WAYFINDER — ${t(`assist.category.${assistance.category}.title`)}`);
  lines.push(assistance.headline);
  lines.push("");

  lines.push(t("assist.section.facts"));
  for (const fact of assistance.facts) {
    const caveat = fact.caveat ? ` (${fact.caveat})` : "";
    lines.push(`- ${fact.label}: ${fact.value}${caveat}`);
  }
  lines.push("");

  if (assistance.conditions.length > 0) {
    lines.push(t("assist.section.conditions"));
    for (const condition of assistance.conditions.slice(0, 10)) {
      const detail = condition.detail ? ` — ${condition.detail}` : "";
      lines.push(`- [${t(`assist.severity.${condition.severity}`)}] ${condition.title}${detail}`);
    }
    lines.push("");
  }

  lines.push(t("assist.section.steps"));
  for (const step of assistance.recommendations) {
    lines.push(`${step.rank}. ${step.title} — ${step.rationale}`);
    if (step.actionUrl) lines.push(`   ${step.actionUrl}`);
  }
  lines.push("");

  lines.push(t("assist.section.sources"));
  for (const source of assistance.sources) {
    lines.push(`- ${source.organization}: ${source.title}`);
    lines.push(`  ${source.url}`);
  }
  lines.push("");

  lines.push(`${t("assist.timeline.sourcesChecked")}: ${assistance.updatedAt}`);

  return lines.join("\n");
}
