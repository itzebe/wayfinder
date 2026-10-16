/**
 * Official passenger-rights references.
 *
 * These are stable, official, publicly published sources — not inferred advice.
 * WAYFINDER links to them and summarises what each instrument covers. It never
 * determines eligibility: that depends on the operating carrier, the ticket
 * conditions and the actual circumstances.
 *
 * Every entry carries `quote`, the verbatim text on the official page that
 * supports `summary`, plus the date that page was last checked. Re-runnable
 * with `npm run verify:sources`.
 */

import type { Translate } from "@/lib/i18n/translator";
import type { RightsNote } from "@/lib/core/types";

/** Date the URLs and quotes below were last retrieved and compared. */
export const RIGHTS_CHECKED_AT = "2026-10-15";

export const RIGHTS_NOTES: RightsNote[] = [
  {
    id: "eu261",
    jurisdiction: "European Union",
    organization: "European Commission — Your Europe",
    instrument: "EU air passenger rights (Regulation (EC) No 261/2004)",
    summary:
      "The Commission's own guidance on the EU rules for cancelled flights, delayed flights, denied boarding and downgrading. Care such as meals and accommodation can apply during a long delay. Compensation depends on the cause of the disruption and on how much notice you were given.",
    url: "https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm",
    quote:
      "If your flight is cancelled you have the right to choose between reimbursement, re-routing or return. You are also entitled to assistance at the airport . If you were informed of the cancellation less than 14 days prior to the scheduled departure date, you have a right to compensation .",
    checkedAt: RIGHTS_CHECKED_AT,
    possiblyApplies: false,
  },
  {
    id: "uk261",
    jurisdiction: "United Kingdom",
    organization: "UK Civil Aviation Authority",
    instrument: "UK air passenger rights (retained Regulation 261/2004)",
    summary:
      "The CAA is the UK regulator for air passenger rights. It publishes what you are entitled to when a flight is delayed or cancelled, and how to escalate a complaint to the CAA if the airline does not resolve it.",
    url: "https://www.caa.co.uk/passengers-and-public/resolving-travel-problems/flight-delays-and-cancellations/",
    quote:
      "As a consumer you have important legal rights when the flight you are booked on is delayed or cancelled.",
    checkedAt: RIGHTS_CHECKED_AT,
    possiblyApplies: false,
  },
  {
    id: "us-refunds",
    jurisdiction: "United States",
    organization: "U.S. Department of Transportation (14 CFR Part 260, on eCFR)",
    instrument: "Refunds for airline fare and ancillary service fees (14 CFR Part 260)",
    summary:
      "The United States rule on refunds, which took effect in 2024. It requires a prompt refund, rather than a voucher, when a flight is cancelled or significantly changed and the passenger does not accept the alternative. It also covers ancillary fees paid for a service that was not provided.",
    url: "https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-260",
    quote:
      "Airfare including nonrefundable airfare for a flight that is cancelled or significantly changed where the consumer does not accept the significantly changed flight or rebooking on an alternative flight, or accept any voucher, credit, or other compensation offered by the carrier.",
    checkedAt: RIGHTS_CHECKED_AT,
    possiblyApplies: false,
  },
  {
    id: "ca-apr",
    jurisdiction: "Canada",
    organization: "Canadian Transportation Agency",
    instrument: "Air Passenger Protection Regulations (SOR/2019-150)",
    summary:
      "The Canadian rules set minimum airline obligations in air travel, including standards of treatment during a disruption and, in some situations, compensation. The Canadian Transportation Agency publishes the rules and handles complaints.",
    url: "https://otc-cta.gc.ca/eng/air-passenger-protection-regulations",
    quote:
      "The regulations provide for clearer and more consistent air passenger rights by imposing certain minimum airline requirements in air travel – including standards of treatment and, in some situations, compensation for passengers.",
    checkedAt: RIGHTS_CHECKED_AT,
    possiblyApplies: false,
  },
  {
    id: "montreal",
    jurisdiction: "International",
    organization: "Montreal Convention 1999 (text as enacted in the UK Carriage by Air Act 1961)",
    instrument: "Montreal Convention 1999 — liability for delay (Article 19)",
    summary:
      "The treaty that governs airline liability for international carriage. Article 19 makes the carrier liable for damage caused by delay in the carriage of passengers. That liability is capped in Special Drawing Rights, a figure that is revised periodically. This is separate from any care or compensation entitlement under national passenger-rights rules.",
    url: "https://www.legislation.gov.uk/ukpga/1961/27/schedule/1B",
    quote:
      "The carrier is liable for damage occasioned by delay in the carriage by air of passengers, baggage or cargo.",
    checkedAt: RIGHTS_CHECKED_AT,
    possiblyApplies: false,
  },
];

const EU_MEMBER_AND_EEA = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "CH",
]);

/**
 * Marks which rights instruments could plausibly relate to a route.
 *
 * This is a jurisdiction filter for presentation only. It is explicitly not an
 * eligibility decision and the UI presents it that way.
 */
export function selectRightsNotes(
  input: {
    originCountryCode?: string;
    destinationCountryCode?: string;
    airlineCountry?: string;
  },
  t: Translate,
): RightsNote[] {
  const codes = new Set(
    [input.originCountryCode, input.destinationCountryCode, input.airlineCountry]
      .filter((code): code is string => Boolean(code))
      .map((code) => code.toUpperCase()),
  );

  const hasEu = [...codes].some((code) => EU_MEMBER_AND_EEA.has(code));
  const hasUk = codes.has("GB");
  const hasUs = codes.has("US");
  const hasCa = codes.has("CA");

  const selected = RIGHTS_NOTES.map((note): RightsNote => {
    let applies = false;
    let because: string | undefined;

    switch (note.id) {
      case "eu261":
        applies = hasEu;
        because = hasEu ? t("rights.because.eu") : undefined;
        break;
      case "uk261":
        applies = hasUk;
        because = hasUk ? t("rights.because.uk") : undefined;
        break;
      case "us-refunds":
        applies = hasUs;
        because = hasUs ? t("rights.because.us") : undefined;
        break;
      case "ca-apr":
        applies = hasCa;
        because = hasCa ? t("rights.because.ca") : undefined;
        break;
      case "montreal":
        // Governs international carriage between States party to the treaty.
        applies = codes.size > 1;
        because = codes.size > 1 ? t("rights.because.montreal") : undefined;
        break;
    }

    return { ...note, possiblyApplies: applies, appliesBecause: because };
  });

  // Surface the most relevant instruments first, but keep all of them available.
  return selected.sort((a, b) => Number(b.possiblyApplies) - Number(a.possiblyApplies));
}
