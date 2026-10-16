import { ErrorState } from "@/components/pages/ErrorState";

/**
 * 404 surface. Next.js renders this for any unmatched route, inside the root
 * layout, so the traveller keeps their language choice and a clear way home.
 */
export default function NotFound() {
  return <ErrorState kind="notFound" />;
}
