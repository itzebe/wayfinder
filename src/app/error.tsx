"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/pages/ErrorState";

/**
 * Route-level error boundary. It catches render errors below the root layout, so
 * the traveller still gets the header, footer and their language, along with a
 * way to retry the action and a way home.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[wayfinder] route error:", error);
  }, [error]);

  return <ErrorState kind="error" onRetry={reset} digest={error.digest} />;
}
