/**
 * Location resolution.
 *
 * The brief's core failure was that a traveller who typed "Lagos, Nigeria" got
 * a dead end: the form demanded a two-letter country code, and even when one was
 * supplied the provider registry only knew GB/US/DE. Neither is acceptable — the
 * product is international, and a place name is the only thing a person in an
 * airport actually has in front of them.
 *
 * This module turns free text into a country code and a city, accepting the way
 * people really type: with or without a comma, with or without diacritics, in
 * any capitalisation, and optionally with a region in the middle
 * ("Ikeja, Lagos, Nigeria"). It never guesses silently: when the input carries a
 * country part it cannot match, it says so rather than assuming.
 *
 * The country table is reference data (ISO 3166-1 alpha-2 plus common aliases).
 * It is not a coverage claim — a country being resolvable here says nothing
 * about whether a live provider serves it. Coverage is derived from the provider
 * registry and reported separately.
 */

export interface ResolvedLocation {
  /** ISO 3166-1 alpha-2, when the country was recognised. */
  countryCode?: string;
  /** The city or locality, as typed. */
  city?: string;
  /** A region/state between the city and the country, when present. */
  region?: string;
  /** The country name exactly as the traveller typed it. */
  countryAsTyped?: string;
  /** The input had a country part but we could not match it. */
  countryUnrecognised: boolean;
}

/** ISO 3166-1 alpha-2 → English name plus aliases people actually type. */
interface CountryEntry {
  code: string;
  name: string;
  aliases: string[];
}

const COUNTRIES: CountryEntry[] = [
  { code: "AR", name: "Argentina", aliases: ["argentina", "argentine"] },
  { code: "AT", name: "Austria", aliases: ["austria", "österreich", "osterreich"] },
  { code: "AU", name: "Australia", aliases: ["australia"] },
  { code: "BD", name: "Bangladesh", aliases: ["bangladesh"] },
  { code: "BE", name: "Belgium", aliases: ["belgium", "belgique", "belgië", "belgie"] },
  { code: "BR", name: "Brazil", aliases: ["brazil", "brasil"] },
  { code: "CA", name: "Canada", aliases: ["canada"] },
  { code: "CH", name: "Switzerland", aliases: ["switzerland", "schweiz", "suisse", "svizzera"] },
  { code: "CL", name: "Chile", aliases: ["chile"] },
  { code: "CN", name: "China", aliases: ["china", "中国", "中华人民共和国", "prc"] },
  { code: "CO", name: "Colombia", aliases: ["colombia"] },
  { code: "CZ", name: "Czechia", aliases: ["czechia", "czech republic", "tschechien"] },
  { code: "DE", name: "Germany", aliases: ["germany", "deutschland", "allemagne", "alemania"] },
  { code: "DK", name: "Denmark", aliases: ["denmark", "danmark"] },
  { code: "EG", name: "Egypt", aliases: ["egypt", "مصر", "misr"] },
  { code: "ES", name: "Spain", aliases: ["spain", "españa", "espana", "espagne"] },
  { code: "ET", name: "Ethiopia", aliases: ["ethiopia"] },
  { code: "FI", name: "Finland", aliases: ["finland", "suomi"] },
  { code: "FR", name: "France", aliases: ["france", "francia", "frankreich"] },
  { code: "GB", name: "United Kingdom", aliases: ["united kingdom", "uk", "great britain", "britain", "england", "scotland", "wales", "northern ireland"] },
  { code: "GH", name: "Ghana", aliases: ["ghana"] },
  { code: "GR", name: "Greece", aliases: ["greece", "hellas", "ελλάδα"] },
  { code: "HK", name: "Hong Kong", aliases: ["hong kong", "香港"] },
  { code: "ID", name: "Indonesia", aliases: ["indonesia"] },
  { code: "IE", name: "Ireland", aliases: ["ireland", "éire", "eire"] },
  { code: "IL", name: "Israel", aliases: ["israel", "ישראל"] },
  { code: "IN", name: "India", aliases: ["india", "भारत", "bharat"] },
  { code: "IT", name: "Italy", aliases: ["italy", "italia", "italie"] },
  { code: "JP", name: "Japan", aliases: ["japan", "日本", "nippon"] },
  { code: "KE", name: "Kenya", aliases: ["kenya"] },
  { code: "KR", name: "South Korea", aliases: ["south korea", "korea", "republic of korea", "대한민국", "한국"] },
  { code: "MA", name: "Morocco", aliases: ["morocco", "maroc", "المغرب"] },
  { code: "MX", name: "Mexico", aliases: ["mexico", "méxico", "méjico"] },
  { code: "MY", name: "Malaysia", aliases: ["malaysia"] },
  { code: "NG", name: "Nigeria", aliases: ["nigeria", "naija"] },
  { code: "NL", name: "Netherlands", aliases: ["netherlands", "holland", "nederland"] },
  { code: "NO", name: "Norway", aliases: ["norway", "norge"] },
  { code: "NZ", name: "New Zealand", aliases: ["new zealand", "aotearoa"] },
  { code: "PE", name: "Peru", aliases: ["peru", "perú"] },
  { code: "PH", name: "Philippines", aliases: ["philippines", "pilipinas"] },
  { code: "PK", name: "Pakistan", aliases: ["pakistan", "پاکستان"] },
  { code: "PL", name: "Poland", aliases: ["poland", "polska"] },
  { code: "PT", name: "Portugal", aliases: ["portugal"] },
  { code: "RO", name: "Romania", aliases: ["romania", "românia"] },
  { code: "RU", name: "Russia", aliases: ["russia", "россия", "russian federation"] },
  { code: "SA", name: "Saudi Arabia", aliases: ["saudi arabia", "السعودية"] },
  { code: "SE", name: "Sweden", aliases: ["sweden", "sverige"] },
  { code: "SG", name: "Singapore", aliases: ["singapore", "新加坡"] },
  { code: "TH", name: "Thailand", aliases: ["thailand", "ประเทศไทย"] },
  { code: "TR", name: "Türkiye", aliases: ["turkiye", "türkiye", "turkey", "türkei"] },
  { code: "TW", name: "Taiwan", aliases: ["taiwan", "台灣", "台湾"] },
  { code: "TZ", name: "Tanzania", aliases: ["tanzania"] },
  { code: "UA", name: "Ukraine", aliases: ["ukraine", "україна"] },
  { code: "UG", name: "Uganda", aliases: ["uganda"] },
  { code: "US", name: "United States", aliases: ["united states", "usa", "us", "u.s.", "u.s.a.", "america", "united states of america"] },
  { code: "VN", name: "Vietnam", aliases: ["vietnam", "viet nam", "việt nam"] },
  { code: "ZA", name: "South Africa", aliases: ["south africa", "suid-afrika"] },
];

const BY_ALIAS = new Map<string, CountryEntry>();
for (const entry of COUNTRIES) {
  BY_ALIAS.set(fold(entry.name), entry);
  for (const alias of entry.aliases) BY_ALIAS.set(fold(alias), entry);
}

/** Strips diacritics and punctuation so "São Paulo" == "Sao Paulo". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolves a country name or code on its own. */
export function resolveCountry(value: string | undefined): CountryEntry | undefined {
  if (!value) return undefined;
  const folded = fold(value);
  if (!folded) return undefined;
  const direct = BY_ALIAS.get(folded);
  if (direct) return direct;
  // A bare two-letter code is accepted only when it is a code we know, so "us"
  // does not silently become a country.
  if (/^[a-z]{2}$/.test(folded)) {
    return COUNTRIES.find((entry) => entry.code.toLowerCase() === folded);
  }
  return undefined;
}

/**
 * Splits "Ikeja, Lagos, Nigeria" into parts, keeping the traveller's own
 * capitalisation. Commas are the separator people use; a trailing country name
 * with no comma ("Lagos Nigeria") is also handled.
 */
function splitParts(input: string): string[] {
  const byComma = input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (byComma.length > 1) return byComma;

  // No comma: peel a known trailing country name, longest match first.
  const words = input.trim().split(/\s+/);
  for (let start = 1; start < words.length; start += 1) {
    const tail = words.slice(start).join(" ");
    if (resolveCountry(tail)) {
      return [words.slice(0, start).join(" "), tail].filter(Boolean);
    }
  }
  return byComma;
}

/**
 * Resolves a free-text location.
 *
 * Recognises a trailing country name or code, a leading one, and an optional
 * region in the middle. When the input carries no recognisable country the city
 * is still returned so the caller can search with it and be honest about the
 * gap rather than rejecting the request outright.
 */
export function resolveLocation(input: string | undefined): ResolvedLocation {
  const raw = (input ?? "").trim();
  if (!raw) return { countryUnrecognised: false };

  const parts = splitParts(raw);

  // A leading country with a following city also happens ("Nigeria, Lagos").
  const leading = parts.length > 1 ? resolveCountry(parts[0]) : undefined;
  if (leading) {
    const rest = parts.slice(1);
    return {
      countryCode: leading.code,
      countryAsTyped: parts[0],
      city: rest[0],
      region: rest.length > 1 ? rest.slice(1).join(", ") : undefined,
      countryUnrecognised: false,
    };
  }

  const trailing = parts.length > 1 ? resolveCountry(parts[parts.length - 1]) : undefined;
  if (trailing) {
    const middle = parts.slice(0, -1);
    return {
      countryCode: trailing.code,
      countryAsTyped: parts[parts.length - 1],
      // "Ikeja, Lagos, Nigeria" — the first part is the locality, the rest is
      // the region. Both are preserved; neither is silently dropped.
      city: middle[0],
      region: middle.length > 1 ? middle.slice(1).join(", ") : undefined,
      countryUnrecognised: false,
    };
  }

  // A single token that is itself a country name ("Nigeria").
  const single = resolveCountry(raw);
  if (single) {
    return { countryCode: single.code, countryAsTyped: raw, countryUnrecognised: false };
  }

  // No country recognised. Keep what the traveller gave us as the city so it can
  // still be used for retrieval, and flag that the country was not matched.
  return {
    city: parts[0] ?? raw,
    region: parts.length > 1 ? parts.slice(1).join(", ") : undefined,
    countryUnrecognised: parts.length > 1,
  };
}

/** Country name for a code, for display back to the traveller. */
export function countryName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return COUNTRIES.find((entry) => entry.code === code.toUpperCase())?.name;
}

export function isKnownCountryCode(code: string | undefined): boolean {
  return resolveCountry(code) !== undefined;
}
