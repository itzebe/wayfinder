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
 *
 * A bare city ("Paris") is resolved to the country it sits in, because a place
 * name with no country is the single most common thing a person types and
 * refusing it produced an empty page for a place we can identify exactly. A name
 * that is a real city in more than one country ("San Jose") is *not* resolved:
 * choosing would invent a country the traveller never named, so the alternatives
 * are returned for them to pick.
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
  /**
   * True when the country came from a bare city name ("Paris" → FR) rather than
   * from the traveller naming the country. Disclosable, because it is our
   * reading of their words, not something they told us.
   */
  countryInferred?: boolean;
  /**
   * When a bare place name is a real city in more than one country, the choices.
   * Non-empty means we deliberately did *not* pick one: choosing would be
   * inventing a country the traveller never named.
   */
  countryAlternatives?: { countryCode: string; countryName: string }[];
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

/**
 * City → country.
 *
 * A bare place name is the most common thing a person types ("Paris", "Tokyo"),
 * and it is also the input that carries no country at all. Without this table a
 * bare city resolves to no country, which means no directory entry and no
 * provider: the traveller gets an empty page for a place we can identify
 * perfectly well.
 *
 * `countries` lists every country the name plausibly refers to. One entry means
 * the name identifies the country on its own. More than one means it does not,
 * and the caller must ask rather than choose — appending a country the traveller
 * never named is the failure this whole module exists to prevent.
 */
const CITIES: { name: string; countries: string[] }[] = [
  // Unambiguous in practice — the name identifies one country.
  { name: "Paris", countries: ["FR"] },
  { name: "Marseille", countries: ["FR"] },
  { name: "Lyon", countries: ["FR"] },
  { name: "Toulouse", countries: ["FR"] },
  { name: "Lagos", countries: ["NG"] },
  { name: "Abuja", countries: ["NG"] },
  { name: "Kano", countries: ["NG"] },
  { name: "Ikeja", countries: ["NG"] },
  { name: "Port Harcourt", countries: ["NG"] },
  { name: "Tokyo", countries: ["JP"] },
  { name: "Osaka", countries: ["JP"] },
  { name: "Kyoto", countries: ["JP"] },
  { name: "Nagoya", countries: ["JP"] },
  { name: "Sapporo", countries: ["JP"] },
  { name: "Fukuoka", countries: ["JP"] },
  { name: "London", countries: ["GB"] },
  { name: "Bristol", countries: ["GB"] },
  { name: "Edinburgh", countries: ["GB"] },
  { name: "Glasgow", countries: ["GB"] },
  { name: "Cardiff", countries: ["GB"] },
  { name: "Belfast", countries: ["GB"] },
  { name: "Leeds", countries: ["GB"] },
  { name: "Liverpool", countries: ["GB"] },
  { name: "Berlin", countries: ["DE"] },
  { name: "Munich", countries: ["DE"] },
  { name: "Hamburg", countries: ["DE"] },
  { name: "Frankfurt", countries: ["DE"] },
  { name: "Cologne", countries: ["DE"] },
  { name: "Stuttgart", countries: ["DE"] },
  { name: "Madrid", countries: ["ES"] },
  { name: "Barcelona", countries: ["ES"] },
  { name: "Lisbon", countries: ["PT"] },
  { name: "Porto", countries: ["PT"] },
  { name: "Rome", countries: ["IT"] },
  { name: "Milan", countries: ["IT"] },
  { name: "Naples", countries: ["IT"] },
  { name: "Amsterdam", countries: ["NL"] },
  { name: "Rotterdam", countries: ["NL"] },
  { name: "Brussels", countries: ["BE"] },
  { name: "Vienna", countries: ["AT"] },
  { name: "Zurich", countries: ["CH"] },
  { name: "Geneva", countries: ["CH"] },
  { name: "Copenhagen", countries: ["DK"] },
  { name: "Stockholm", countries: ["SE"] },
  { name: "Oslo", countries: ["NO"] },
  { name: "Helsinki", countries: ["FI"] },
  { name: "Warsaw", countries: ["PL"] },
  { name: "Krakow", countries: ["PL"] },
  { name: "Prague", countries: ["CZ"] },
  { name: "Athens", countries: ["GR"] },
  { name: "Dublin", countries: ["IE"] },
  { name: "Istanbul", countries: ["TR"] },
  { name: "Ankara", countries: ["TR"] },
  { name: "Moscow", countries: ["RU"] },
  { name: "Kyiv", countries: ["UA"] },
  { name: "Cairo", countries: ["EG"] },
  { name: "Alexandria", countries: ["EG"] },
  { name: "Nairobi", countries: ["KE"] },
  { name: "Mombasa", countries: ["KE"] },
  { name: "Accra", countries: ["GH"] },
  { name: "Kumasi", countries: ["GH"] },
  { name: "Addis Ababa", countries: ["ET"] },
  { name: "Dar es Salaam", countries: ["TZ"] },
  { name: "Kampala", countries: ["UG"] },
  { name: "Casablanca", countries: ["MA"] },
  { name: "Marrakesh", countries: ["MA"] },
  { name: "Johannesburg", countries: ["ZA"] },
  { name: "Cape Town", countries: ["ZA"] },
  { name: "Durban", countries: ["ZA"] },
  { name: "Pretoria", countries: ["ZA"] },
  { name: "Mumbai", countries: ["IN"] },
  { name: "Delhi", countries: ["IN"] },
  { name: "Bengaluru", countries: ["IN"] },
  { name: "Bangalore", countries: ["IN"] },
  { name: "Chennai", countries: ["IN"] },
  { name: "Kolkata", countries: ["IN"] },
  { name: "Hyderabad", countries: ["IN"] },
  { name: "Karachi", countries: ["PK"] },
  { name: "Lahore", countries: ["PK"] },
  { name: "Islamabad", countries: ["PK"] },
  { name: "Dhaka", countries: ["BD"] },
  { name: "Bangkok", countries: ["TH"] },
  { name: "Phuket", countries: ["TH"] },
  { name: "Hanoi", countries: ["VN"] },
  { name: "Ho Chi Minh City", countries: ["VN"] },
  { name: "Saigon", countries: ["VN"] },
  { name: "Jakarta", countries: ["ID"] },
  { name: "Bali", countries: ["ID"] },
  { name: "Manila", countries: ["PH"] },
  { name: "Singapore", countries: ["SG"] },
  { name: "Kuala Lumpur", countries: ["MY"] },
  { name: "Seoul", countries: ["KR"] },
  { name: "Busan", countries: ["KR"] },
  { name: "Beijing", countries: ["CN"] },
  { name: "Shanghai", countries: ["CN"] },
  { name: "Guangzhou", countries: ["CN"] },
  { name: "Shenzhen", countries: ["CN"] },
  { name: "Taipei", countries: ["TW"] },
  { name: "Hong Kong", countries: ["HK"] },
  { name: "Sydney", countries: ["AU"] },
  { name: "Melbourne", countries: ["AU"] },
  { name: "Brisbane", countries: ["AU"] },
  { name: "Perth", countries: ["AU"] },
  { name: "Auckland", countries: ["NZ"] },
  { name: "Wellington", countries: ["NZ"] },
  { name: "Toronto", countries: ["CA"] },
  { name: "Vancouver", countries: ["CA"] },
  { name: "Montreal", countries: ["CA"] },
  { name: "Ottawa", countries: ["CA"] },
  { name: "Calgary", countries: ["CA"] },
  { name: "New York", countries: ["US"] },
  { name: "New York City", countries: ["US"] },
  { name: "Los Angeles", countries: ["US"] },
  { name: "Chicago", countries: ["US"] },
  { name: "San Francisco", countries: ["US"] },
  { name: "Seattle", countries: ["US"] },
  { name: "Boston", countries: ["US"] },
  { name: "Washington", countries: ["US"] },
  { name: "Miami", countries: ["US"] },
  { name: "Atlanta", countries: ["US"] },
  { name: "Houston", countries: ["US"] },
  { name: "Dallas", countries: ["US"] },
  { name: "Denver", countries: ["US"] },
  { name: "Phoenix", countries: ["US"] },
  { name: "Las Vegas", countries: ["US"] },
  { name: "Mexico City", countries: ["MX"] },
  { name: "Guadalajara", countries: ["MX"] },
  { name: "Cancun", countries: ["MX"] },
  { name: "Sao Paulo", countries: ["BR"] },
  { name: "Rio de Janeiro", countries: ["BR"] },
  { name: "Brasilia", countries: ["BR"] },
  { name: "Buenos Aires", countries: ["AR"] },
  { name: "Lima", countries: ["PE"] },
  { name: "Bogota", countries: ["CO"] },
  { name: "Medellin", countries: ["CO"] },
  { name: "Dubai", countries: ["AE"] },
  { name: "Abu Dhabi", countries: ["AE"] },
  { name: "Riyadh", countries: ["SA"] },
  { name: "Jeddah", countries: ["SA"] },
  { name: "Tel Aviv", countries: ["IL"] },
  { name: "Jerusalem", countries: ["IL"] },

  // Genuinely ambiguous — the same name is a real city in more than one country,
  // so it cannot identify a country on its own and the traveller must choose.
  { name: "San Jose", countries: ["CR", "US"] },
  { name: "Cordoba", countries: ["AR", "ES", "MX"] },
  { name: "Valencia", countries: ["ES", "VE"] },
  { name: "Victoria", countries: ["CA", "AU", "SC"] },
  { name: "Hamilton", countries: ["CA", "NZ", "BM"] },
  { name: "Birmingham", countries: ["GB", "US"] },
  { name: "Manchester", countries: ["GB", "US"] },
  { name: "Newcastle", countries: ["GB", "AU", "US"] },
  { name: "Toledo", countries: ["ES", "US", "PH"] },
  { name: "Portland", countries: ["US", "AU"] },
  { name: "Kingston", countries: ["JM", "CA", "US"] },
];

const BY_CITY = new Map<string, string[]>();
for (const entry of CITIES) {
  const key = fold(entry.name);
  const existing = BY_CITY.get(key);
  if (existing) {
    for (const code of entry.countries) if (!existing.includes(code)) existing.push(code);
  } else {
    BY_CITY.set(key, [...entry.countries]);
  }
}

/**
 * Looks a bare place name up as a city.
 *
 * Returns the distinct countries the name could refer to. `undefined` means the
 * name is not one we know, which is an honest outcome — the caller then searches
 * with the words the traveller gave and says the country was not recognised.
 */
export function resolveCity(
  value: string | undefined,
): { countryCode: string; countryName: string }[] | undefined {
  if (!value) return undefined;
  const codes = BY_CITY.get(fold(value));
  if (!codes || codes.length === 0) return undefined;
  return codes.map((code) => ({
    countryCode: code,
    countryName: countryName(code) ?? code,
  }));
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

  // No country was named. Before giving up, try the place as a city: "Paris" and
  // "Tokyo" are places we can identify exactly, and refusing them because they
  // arrived without a country is what produced an empty page. A name that maps
  // to one country is accepted; a name that maps to several is returned as
  // alternatives so the caller asks instead of choosing.
  const asCity = resolveCity(parts[0] ?? raw);
  if (asCity) {
    if (asCity.length === 1) {
      return {
        countryCode: asCity[0].countryCode,
        countryAsTyped: parts[0] ?? raw,
        city: parts[0] ?? raw,
        countryInferred: true,
        countryUnrecognised: false,
      };
    }
    if (parts.length === 1) {
      return {
        city: parts[0] ?? raw,
        countryAlternatives: asCity,
        countryUnrecognised: false,
      };
    }
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
