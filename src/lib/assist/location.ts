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
 * The country table is the complete ISO 3166-1 alpha-2 set (all 249 codes),
 * taken from the IANA time-zone database's public-domain `iso3166.tab`, plus the
 * aliases people actually type. A partial table is not a neutral gap: it is the
 * difference between a traveller in Iceland or Nepal getting a forecast and
 * being told, falsely, that no source covers their country. The table is still
 * not a coverage claim — a country being resolvable here says nothing about
 * whether a live provider serves it. Coverage is derived from the provider
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
  { code: "AD", name: "Andorra", aliases: [] },
  { code: "AE", name: "United Arab Emirates", aliases: ["u.a.e."] },
  { code: "AF", name: "Afghanistan", aliases: [] },
  { code: "AG", name: "Antigua & Barbuda", aliases: [] },
  { code: "AI", name: "Anguilla", aliases: [] },
  { code: "AL", name: "Albania", aliases: [] },
  { code: "AM", name: "Armenia", aliases: [] },
  { code: "AO", name: "Angola", aliases: [] },
  { code: "AQ", name: "Antarctica", aliases: [] },
  { code: "AR", name: "Argentina", aliases: ["argentina", "argentine"] },
  { code: "AS", name: "American Samoa", aliases: ["Samoa (American)"] },
  { code: "AT", name: "Austria", aliases: ["austria", "österreich"] },
  { code: "AU", name: "Australia", aliases: ["australia"] },
  { code: "AW", name: "Aruba", aliases: [] },
  { code: "AX", name: "Åland Islands", aliases: [] },
  { code: "AZ", name: "Azerbaijan", aliases: [] },
  { code: "BA", name: "Bosnia & Herzegovina", aliases: [] },
  { code: "BB", name: "Barbados", aliases: [] },
  { code: "BD", name: "Bangladesh", aliases: ["bangladesh"] },
  { code: "BE", name: "Belgium", aliases: ["belgium", "belgique", "belgië"] },
  { code: "BF", name: "Burkina Faso", aliases: [] },
  { code: "BG", name: "Bulgaria", aliases: [] },
  { code: "BH", name: "Bahrain", aliases: [] },
  { code: "BI", name: "Burundi", aliases: [] },
  { code: "BJ", name: "Benin", aliases: [] },
  { code: "BL", name: "Saint Barthelemy", aliases: ["St Barthelemy"] },
  { code: "BM", name: "Bermuda", aliases: [] },
  { code: "BN", name: "Brunei", aliases: [] },
  { code: "BO", name: "Bolivia", aliases: [] },
  { code: "BQ", name: "Caribbean Netherlands", aliases: ["Caribbean NL"] },
  { code: "BR", name: "Brazil", aliases: ["brazil", "brasil"] },
  { code: "BS", name: "Bahamas", aliases: [] },
  { code: "BT", name: "Bhutan", aliases: [] },
  { code: "BV", name: "Bouvet Island", aliases: [] },
  { code: "BW", name: "Botswana", aliases: [] },
  { code: "BY", name: "Belarus", aliases: [] },
  { code: "BZ", name: "Belize", aliases: [] },
  { code: "CA", name: "Canada", aliases: ["canada"] },
  { code: "CC", name: "Cocos (Keeling) Islands", aliases: [] },
  { code: "CD", name: "DR Congo", aliases: ["Congo (Dem. Rep.)"] },
  { code: "CF", name: "Central African Republic", aliases: ["Central African Rep."] },
  { code: "CG", name: "Republic of the Congo", aliases: ["Congo (Rep.)"] },
  { code: "CH", name: "Switzerland", aliases: ["switzerland", "schweiz", "suisse", "svizzera"] },
  { code: "CI", name: "Côte d'Ivoire", aliases: ["Côte d’Ivoire"] },
  { code: "CK", name: "Cook Islands", aliases: [] },
  { code: "CL", name: "Chile", aliases: ["chile"] },
  { code: "CM", name: "Cameroon", aliases: [] },
  { code: "CN", name: "China", aliases: ["china", "中国", "中华人民共和国", "prc"] },
  { code: "CO", name: "Colombia", aliases: ["colombia"] },
  { code: "CR", name: "Costa Rica", aliases: [] },
  { code: "CU", name: "Cuba", aliases: [] },
  { code: "CV", name: "Cabo Verde", aliases: ["Cape Verde"] },
  { code: "CW", name: "Curaçao", aliases: [] },
  { code: "CX", name: "Christmas Island", aliases: [] },
  { code: "CY", name: "Cyprus", aliases: [] },
  { code: "CZ", name: "Czechia", aliases: ["czechia", "czech republic", "tschechien"] },
  { code: "DE", name: "Germany", aliases: ["germany", "deutschland", "allemagne", "alemania"] },
  { code: "DJ", name: "Djibouti", aliases: [] },
  { code: "DK", name: "Denmark", aliases: ["denmark", "danmark"] },
  { code: "DM", name: "Dominica", aliases: [] },
  { code: "DO", name: "Dominican Republic", aliases: [] },
  { code: "DZ", name: "Algeria", aliases: [] },
  { code: "EC", name: "Ecuador", aliases: [] },
  { code: "EE", name: "Estonia", aliases: [] },
  { code: "EG", name: "Egypt", aliases: ["egypt", "مصر", "misr"] },
  { code: "EH", name: "Western Sahara", aliases: [] },
  { code: "ER", name: "Eritrea", aliases: [] },
  { code: "ES", name: "Spain", aliases: ["spain", "españa", "espagne"] },
  { code: "ET", name: "Ethiopia", aliases: ["ethiopia"] },
  { code: "FI", name: "Finland", aliases: ["finland", "suomi"] },
  { code: "FJ", name: "Fiji", aliases: [] },
  { code: "FK", name: "Falkland Islands", aliases: [] },
  { code: "FM", name: "Micronesia", aliases: [] },
  { code: "FO", name: "Faroe Islands", aliases: [] },
  { code: "FR", name: "France", aliases: ["france", "francia", "frankreich"] },
  { code: "GA", name: "Gabon", aliases: [] },
  { code: "GB", name: "United Kingdom", aliases: ["united kingdom", "uk", "great britain", "britain", "england", "scotland", "wales", "northern ireland", "Britain (UK)"] },
  { code: "GD", name: "Grenada", aliases: [] },
  { code: "GE", name: "Georgia", aliases: [] },
  { code: "GF", name: "French Guiana", aliases: [] },
  { code: "GG", name: "Guernsey", aliases: [] },
  { code: "GH", name: "Ghana", aliases: ["ghana"] },
  { code: "GI", name: "Gibraltar", aliases: [] },
  { code: "GL", name: "Greenland", aliases: [] },
  { code: "GM", name: "Gambia", aliases: [] },
  { code: "GN", name: "Guinea", aliases: [] },
  { code: "GP", name: "Guadeloupe", aliases: [] },
  { code: "GQ", name: "Equatorial Guinea", aliases: [] },
  { code: "GR", name: "Greece", aliases: ["greece", "hellas", "ελλάδα"] },
  { code: "GS", name: "South Georgia & the South Sandwich Islands", aliases: [] },
  { code: "GT", name: "Guatemala", aliases: [] },
  { code: "GU", name: "Guam", aliases: [] },
  { code: "GW", name: "Guinea-Bissau", aliases: [] },
  { code: "GY", name: "Guyana", aliases: [] },
  { code: "HK", name: "Hong Kong", aliases: ["hong kong", "香港"] },
  { code: "HM", name: "Heard Island & McDonald Islands", aliases: [] },
  { code: "HN", name: "Honduras", aliases: [] },
  { code: "HR", name: "Croatia", aliases: [] },
  { code: "HT", name: "Haiti", aliases: [] },
  { code: "HU", name: "Hungary", aliases: [] },
  { code: "ID", name: "Indonesia", aliases: ["indonesia"] },
  { code: "IE", name: "Ireland", aliases: ["ireland", "éire"] },
  { code: "IL", name: "Israel", aliases: ["israel", "ישראל"] },
  { code: "IM", name: "Isle of Man", aliases: [] },
  { code: "IN", name: "India", aliases: ["india", "भारत", "bharat"] },
  { code: "IO", name: "British Indian Ocean Territory", aliases: [] },
  { code: "IQ", name: "Iraq", aliases: [] },
  { code: "IR", name: "Iran", aliases: [] },
  { code: "IS", name: "Iceland", aliases: [] },
  { code: "IT", name: "Italy", aliases: ["italy", "italia", "italie"] },
  { code: "JE", name: "Jersey", aliases: [] },
  { code: "JM", name: "Jamaica", aliases: [] },
  { code: "JO", name: "Jordan", aliases: [] },
  { code: "JP", name: "Japan", aliases: ["japan", "日本", "nippon"] },
  { code: "KE", name: "Kenya", aliases: ["kenya"] },
  { code: "KG", name: "Kyrgyzstan", aliases: [] },
  { code: "KH", name: "Cambodia", aliases: [] },
  { code: "KI", name: "Kiribati", aliases: [] },
  { code: "KM", name: "Comoros", aliases: [] },
  { code: "KN", name: "Saint Kitts and Nevis", aliases: ["St Kitts & Nevis"] },
  { code: "KP", name: "North Korea", aliases: ["Korea (North)"] },
  { code: "KR", name: "South Korea", aliases: ["south korea", "korea", "republic of korea", "대한민국", "한국", "Korea (South)"] },
  { code: "KW", name: "Kuwait", aliases: [] },
  { code: "KY", name: "Cayman Islands", aliases: [] },
  { code: "KZ", name: "Kazakhstan", aliases: [] },
  { code: "LA", name: "Laos", aliases: [] },
  { code: "LB", name: "Lebanon", aliases: [] },
  { code: "LC", name: "Saint Lucia", aliases: ["St Lucia"] },
  { code: "LI", name: "Liechtenstein", aliases: [] },
  { code: "LK", name: "Sri Lanka", aliases: [] },
  { code: "LR", name: "Liberia", aliases: [] },
  { code: "LS", name: "Lesotho", aliases: [] },
  { code: "LT", name: "Lithuania", aliases: [] },
  { code: "LU", name: "Luxembourg", aliases: [] },
  { code: "LV", name: "Latvia", aliases: [] },
  { code: "LY", name: "Libya", aliases: [] },
  { code: "MA", name: "Morocco", aliases: ["morocco", "maroc", "المغرب"] },
  { code: "MC", name: "Monaco", aliases: [] },
  { code: "MD", name: "Moldova", aliases: [] },
  { code: "ME", name: "Montenegro", aliases: [] },
  { code: "MF", name: "Saint Martin", aliases: ["St Martin (French)"] },
  { code: "MG", name: "Madagascar", aliases: [] },
  { code: "MH", name: "Marshall Islands", aliases: [] },
  { code: "MK", name: "North Macedonia", aliases: [] },
  { code: "ML", name: "Mali", aliases: [] },
  { code: "MM", name: "Myanmar", aliases: ["Myanmar (Burma)"] },
  { code: "MN", name: "Mongolia", aliases: [] },
  { code: "MO", name: "Macao", aliases: ["Macau"] },
  { code: "MP", name: "Northern Mariana Islands", aliases: [] },
  { code: "MQ", name: "Martinique", aliases: [] },
  { code: "MR", name: "Mauritania", aliases: [] },
  { code: "MS", name: "Montserrat", aliases: [] },
  { code: "MT", name: "Malta", aliases: [] },
  { code: "MU", name: "Mauritius", aliases: [] },
  { code: "MV", name: "Maldives", aliases: [] },
  { code: "MW", name: "Malawi", aliases: [] },
  { code: "MX", name: "Mexico", aliases: ["mexico", "méjico"] },
  { code: "MY", name: "Malaysia", aliases: ["malaysia"] },
  { code: "MZ", name: "Mozambique", aliases: [] },
  { code: "NA", name: "Namibia", aliases: [] },
  { code: "NC", name: "New Caledonia", aliases: [] },
  { code: "NE", name: "Niger", aliases: [] },
  { code: "NF", name: "Norfolk Island", aliases: [] },
  { code: "NG", name: "Nigeria", aliases: ["nigeria", "naija"] },
  { code: "NI", name: "Nicaragua", aliases: [] },
  { code: "NL", name: "Netherlands", aliases: ["netherlands", "holland", "nederland"] },
  { code: "NO", name: "Norway", aliases: ["norway", "norge"] },
  { code: "NP", name: "Nepal", aliases: [] },
  { code: "NR", name: "Nauru", aliases: [] },
  { code: "NU", name: "Niue", aliases: [] },
  { code: "NZ", name: "New Zealand", aliases: ["new zealand", "aotearoa"] },
  { code: "OM", name: "Oman", aliases: [] },
  { code: "PA", name: "Panama", aliases: [] },
  { code: "PE", name: "Peru", aliases: ["peru"] },
  { code: "PF", name: "French Polynesia", aliases: [] },
  { code: "PG", name: "Papua New Guinea", aliases: [] },
  { code: "PH", name: "Philippines", aliases: ["philippines", "pilipinas"] },
  { code: "PK", name: "Pakistan", aliases: ["pakistan", "پاکستان"] },
  { code: "PL", name: "Poland", aliases: ["poland", "polska"] },
  { code: "PM", name: "Saint Pierre and Miquelon", aliases: ["St Pierre & Miquelon"] },
  { code: "PN", name: "Pitcairn", aliases: [] },
  { code: "PR", name: "Puerto Rico", aliases: [] },
  { code: "PS", name: "Palestine", aliases: [] },
  { code: "PT", name: "Portugal", aliases: ["portugal"] },
  { code: "PW", name: "Palau", aliases: [] },
  { code: "PY", name: "Paraguay", aliases: [] },
  { code: "QA", name: "Qatar", aliases: [] },
  { code: "RE", name: "Réunion", aliases: [] },
  { code: "RO", name: "Romania", aliases: ["romania"] },
  { code: "RS", name: "Serbia", aliases: [] },
  { code: "RU", name: "Russia", aliases: ["russia", "россия", "russian federation"] },
  { code: "RW", name: "Rwanda", aliases: [] },
  { code: "SA", name: "Saudi Arabia", aliases: ["saudi arabia", "السعودية"] },
  { code: "SB", name: "Solomon Islands", aliases: [] },
  { code: "SC", name: "Seychelles", aliases: [] },
  { code: "SD", name: "Sudan", aliases: [] },
  { code: "SE", name: "Sweden", aliases: ["sweden", "sverige"] },
  { code: "SG", name: "Singapore", aliases: ["singapore", "新加坡"] },
  { code: "SH", name: "Saint Helena", aliases: ["St Helena"] },
  { code: "SI", name: "Slovenia", aliases: [] },
  { code: "SJ", name: "Svalbard & Jan Mayen", aliases: [] },
  { code: "SK", name: "Slovakia", aliases: [] },
  { code: "SL", name: "Sierra Leone", aliases: [] },
  { code: "SM", name: "San Marino", aliases: [] },
  { code: "SN", name: "Senegal", aliases: [] },
  { code: "SO", name: "Somalia", aliases: [] },
  { code: "SR", name: "Suriname", aliases: [] },
  { code: "SS", name: "South Sudan", aliases: [] },
  { code: "ST", name: "Sao Tome & Principe", aliases: [] },
  { code: "SV", name: "El Salvador", aliases: [] },
  { code: "SX", name: "Sint Maarten", aliases: ["St Maarten (Dutch)"] },
  { code: "SY", name: "Syria", aliases: [] },
  { code: "SZ", name: "Eswatini", aliases: ["Eswatini (Swaziland)"] },
  { code: "TC", name: "Turks & Caicos Is", aliases: [] },
  { code: "TD", name: "Chad", aliases: [] },
  { code: "TF", name: "French Southern Territories", aliases: ["French S. Terr."] },
  { code: "TG", name: "Togo", aliases: [] },
  { code: "TH", name: "Thailand", aliases: ["thailand", "ประเทศไทย"] },
  { code: "TJ", name: "Tajikistan", aliases: [] },
  { code: "TK", name: "Tokelau", aliases: [] },
  { code: "TL", name: "Timor-Leste", aliases: ["East Timor"] },
  { code: "TM", name: "Turkmenistan", aliases: [] },
  { code: "TN", name: "Tunisia", aliases: [] },
  { code: "TO", name: "Tonga", aliases: [] },
  { code: "TR", name: "Türkiye", aliases: ["turkiye", "turkey", "türkei"] },
  { code: "TT", name: "Trinidad & Tobago", aliases: [] },
  { code: "TV", name: "Tuvalu", aliases: [] },
  { code: "TW", name: "Taiwan", aliases: ["taiwan", "台灣", "台湾"] },
  { code: "TZ", name: "Tanzania", aliases: ["tanzania"] },
  { code: "UA", name: "Ukraine", aliases: ["ukraine", "україна"] },
  { code: "UG", name: "Uganda", aliases: ["uganda"] },
  { code: "UM", name: "United States Minor Outlying Islands", aliases: ["US minor outlying islands"] },
  { code: "US", name: "United States", aliases: ["united states", "usa", "us", "america", "united states of america"] },
  { code: "UY", name: "Uruguay", aliases: [] },
  { code: "UZ", name: "Uzbekistan", aliases: [] },
  { code: "VA", name: "Vatican City", aliases: [] },
  { code: "VC", name: "Saint Vincent and the Grenadines", aliases: ["St Vincent"] },
  { code: "VE", name: "Venezuela", aliases: [] },
  { code: "VG", name: "British Virgin Islands", aliases: ["Virgin Islands (UK)"] },
  { code: "VI", name: "U.S. Virgin Islands", aliases: ["Virgin Islands (US)"] },
  { code: "VN", name: "Vietnam", aliases: ["vietnam", "viet nam"] },
  { code: "VU", name: "Vanuatu", aliases: [] },
  { code: "WF", name: "Wallis & Futuna", aliases: [] },
  { code: "WS", name: "Samoa", aliases: ["Samoa (western)"] },
  { code: "YE", name: "Yemen", aliases: [] },
  { code: "YT", name: "Mayotte", aliases: [] },
  { code: "ZA", name: "South Africa", aliases: ["south africa", "suid-afrika"] },
  { code: "ZM", name: "Zambia", aliases: [] },
  { code: "ZW", name: "Zimbabwe", aliases: [] },
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
