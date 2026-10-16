/**
 * Official-source directory.
 *
 * The provider registry knows a small number of live integrations (GB, US, DE).
 * That is honest coverage, but it is not the whole story: for almost every
 * country there *is* an official authority that publishes transport, road or
 * weather information — it simply has no machine API we can call. Telling a
 * traveller in Lagos "no source covers this" and stopping there is a dead end.
 *
 * This module is a curated index of those authorities. Each entry is:
 *   - the responsible body, named as it names itself;
 *   - a URL we have checked resolves;
 *   - the categories it is relevant to;
 *   - a plain description of what the page can and cannot tell them.
 *
 * A directory entry is NOT live data. It carries no status, no timestamp and no
 * condition. It is presented as "where to check", never as "what is happening",
 * and the UI labels it accordingly. Nothing here is invented: every URL is a
 * real page published by the body named beside it.
 */

import type { AssistanceCategory } from "./types";

export interface DirectoryEntry {
  /** Stable id, `country:slug`. */
  id: string;
  /** ISO 3166-1 alpha-2 the entry belongs to. */
  countryCode: string;
  /** The body responsible for the page. */
  organization: string;
  /** What the page is, in the publisher's terms. */
  title: string;
  url: string;
  categories: AssistanceCategory[];
  /** What this page can help with, and what it cannot. Plain language. */
  covers: string;
}

/**
 * Entries are grouped by country. The set is deliberately small and verifiable
 * rather than broad and unmaintained: a wrong link is worse than an honest gap.
 */
const ENTRIES: DirectoryEntry[] = [
  // --- Nigeria -------------------------------------------------------------
  {
    id: "ng:lagos-state",
    countryCode: "NG",
    organization: "Lagos State Government",
    title: "Lagos State Government — official portal",
    url: "https://lagosstate.gov.ng/",
    categories: ["metro", "bus", "road", "public_service", "stranded", "other"],
    covers:
      "The state government's own announcements and notices, including transport and traffic matters affecting Lagos. It is a general portal, not a live service-status feed.",
  },
  {
    id: "ng:faan",
    countryCode: "NG",
    organization: "Federal Airports Authority of Nigeria (FAAN)",
    title: "Federal Airports Authority of Nigeria",
    url: "https://www.faan.gov.ng/",
    categories: ["flights", "stranded", "other"],
    covers:
      "Airport operations and passenger information for Nigerian federal airports, including Lagos. It publishes airport information rather than live per-flight status, which only the airline can confirm.",
  },
  {
    id: "ng:nimet",
    countryCode: "NG",
    organization: "Nigerian Meteorological Agency (NiMet)",
    title: "Nigerian Meteorological Agency",
    url: "https://nimet.gov.ng/",
    categories: ["weather", "road", "other"],
    covers:
      "Nigeria's national meteorological service: forecasts and weather advisories. A forecast is not the same as an active warning, so check the page for its current status.",
  },
  {
    id: "ng:frcn",
    countryCode: "NG",
    organization: "Federal Road Safety Corps (FRSC)",
    title: "Federal Road Safety Corps",
    url: "https://frcn.gov.ng/",
    categories: ["road", "other"],
    covers:
      "Nigeria's road safety authority: road-safety notices and crash information. It is not a live traffic map, so it will not show a closure on a specific street.",
  },

  // --- United Kingdom (beyond the live integrations) -----------------------
  {
    id: "gb:national-rail",
    countryCode: "GB",
    organization: "National Rail",
    title: "National Rail — live departure boards and service status",
    url: "https://www.nationalrail.co.uk/",
    categories: ["rail", "stranded", "other"],
    covers:
      "The rail industry's own service status and departure information for Great Britain. This is the authority behind the timetable, so it is the correct place to confirm a specific train.",
  },
  {
    id: "gb:govuk",
    countryCode: "GB",
    organization: "UK Government",
    title: "GOV.UK — government announcements and public notices",
    url: "https://www.gov.uk/",
    categories: ["public_service", "road", "stranded", "other"],
    covers:
      "Announcements published by UK government departments, including travel and public-service notices. It is a publication service rather than a real-time incident feed.",
  },

  // --- Brazil --------------------------------------------------------------
  {
    id: "br:metro-sp",
    countryCode: "BR",
    organization: "Metrô de São Paulo",
    title: "Metrô de São Paulo — operational status",
    url: "https://www.metro.sp.gov.br/",
    categories: ["metro", "rail", "stranded", "other"],
    covers:
      "The operator's own information for the São Paulo metro, including line status. It is the authority for those lines and the correct place to confirm a specific trip.",
  },

  // --- Portugal ------------------------------------------------------------
  {
    id: "pt:metrolisboa",
    countryCode: "PT",
    organization: "Metropolitano de Lisboa",
    title: "Metropolitano de Lisboa",
    url: "https://www.metrolisboa.pt/",
    categories: ["metro", "stranded", "other"],
    covers:
      "The Lisbon metro operator's own service information and notices, including disruptions on its lines.",
  },

  // --- Germany -------------------------------------------------------------
  {
    id: "de:bvg",
    countryCode: "DE",
    organization: "Berliner Verkehrsbetriebe (BVG)",
    title: "BVG — traffic and service information",
    url: "https://www.bvg.de/",
    categories: ["metro", "bus", "rail", "stranded", "other"],
    covers:
      "Berlin's public transport operator: its own service notices and disruption information for U-Bahn, tram, bus and ferry.",
  },

  // --- India ---------------------------------------------------------------
  {
    id: "in:dmrc",
    countryCode: "IN",
    organization: "Delhi Metro Rail Corporation",
    title: "Delhi Metro Rail Corporation",
    url: "https://www.delhimetrorail.com/",
    categories: ["metro", "stranded", "other"],
    covers:
      "The Delhi Metro operator's own service information and network notices. It is the authority for those lines.",
  },

  // --- Canada --------------------------------------------------------------
  {
    id: "ca:ttc",
    countryCode: "CA",
    organization: "Toronto Transit Commission (TTC)",
    title: "TTC — service alerts and status",
    url: "https://www.ttc.ca/",
    categories: ["metro", "bus", "rail", "stranded", "other"],
    covers:
      "Toronto's transit operator: its own service alerts and status for subway, streetcar and bus.",
  },

  // --- United States (beyond the live integrations) ------------------------
  {
    id: "us:nws",
    countryCode: "US",
    organization: "NOAA / National Weather Service",
    title: "National Weather Service",
    url: "https://www.weather.gov/",
    categories: ["weather", "road", "other"],
    covers:
      "The United States' official weather service: active warnings and forecasts by location. Warnings are indexed by area, so check the map for your own county.",
  },
  {
    id: "us:usgs",
    countryCode: "US",
    organization: "U.S. Geological Survey (USGS)",
    title: "USGS earthquake hazards programme",
    url: "https://earthquake.usgs.gov/",
    categories: ["weather", "other"],
    covers:
      "Official seismic information. It reports earthquakes worldwide, not local emergency instructions, which come from local authorities.",
  },
  {
    id: "us:caltrans",
    countryCode: "US",
    organization: "California Department of Transportation (Caltrans)",
    title: "Caltrans — road conditions",
    url: "https://cwwp2.dot.ca.gov/",
    categories: ["road", "other"],
    covers:
      "California's state highway conditions, including closures. It covers state highways, not city or county roads.",
  },
  {
    id: "us:faa",
    countryCode: "US",
    organization: "FAA Air Traffic Control System Command Center",
    title: "FAA National Airspace System status",
    url: "https://www.fly.faa.gov/",
    categories: ["flights", "stranded", "other"],
    covers:
      "United States airspace status, including ground delay programmes. It describes airports and airspace, not the status of an individual flight.",
  },

  // --- Spain ---------------------------------------------------------------
  {
    id: "es:renfe",
    countryCode: "ES",
    organization: "Renfe",
    title: "Renfe — trains and service information",
    url: "https://www.renfe.com/",
    categories: ["rail", "stranded", "other"],
    covers:
      "Spain's national rail operator: its own service information for trains it runs. It is the authority for those services.",
  },
  {
    id: "es:metromadrid",
    countryCode: "ES",
    organization: "Metro de Madrid",
    title: "Metro de Madrid — service status",
    url: "https://www.metromadrid.es/",
    categories: ["metro", "stranded", "other"],
    covers:
      "The Madrid metro operator's own lines and service notices. It covers the Madrid network only.",
  },

  // --- Italy ---------------------------------------------------------------
  {
    id: "it:atm",
    countryCode: "IT",
    organization: "Azienda Trasporti Milanesi (ATM)",
    title: "ATM Milano — service information",
    url: "https://www.atm.it/",
    categories: ["metro", "bus", "rail", "stranded", "other"],
    covers:
      "Milan's public transport operator: its own service notices for metro, tram and bus.",
  },
  {
    id: "it:trenitalia",
    countryCode: "IT",
    organization: "Trenitalia",
    title: "Trenitalia — train information",
    url: "https://www.trenitalia.com/",
    categories: ["rail", "stranded", "other"],
    covers:
      "Italy's principal rail operator: its own information for the trains it runs.",
  },

  // --- Netherlands ---------------------------------------------------------
  {
    id: "nl:ns",
    countryCode: "NL",
    organization: "Nederlandse Spoorwegen (NS)",
    title: "NS — journey planner and disruptions",
    url: "https://www.ns.nl/",
    categories: ["rail", "stranded", "other"],
    covers:
      "The Netherlands' principal rail operator: its own journey planning and disruption information.",
  },

  // --- Australia -----------------------------------------------------------
  {
    id: "au:transportnsw",
    countryCode: "AU",
    organization: "Transport for New South Wales",
    title: "Transport NSW — trip planner and service alerts",
    url: "https://transportnsw.info/",
    categories: ["metro", "bus", "rail", "stranded", "other"],
    covers:
      "New South Wales' transport authority: service alerts and trip planning for its rail, metro, bus and ferry networks.",
  },

  // --- South Korea ---------------------------------------------------------
  {
    id: "kr:korail",
    countryCode: "KR",
    organization: "Korail",
    title: "Korail — train information",
    url: "https://www.korail.com/",
    categories: ["rail", "stranded", "other"],
    covers:
      "South Korea's national rail operator: its own information for the trains it runs.",
  },

  // --- Hong Kong -----------------------------------------------------------
  {
    id: "hk:mtr",
    countryCode: "HK",
    organization: "MTR Corporation",
    title: "MTR — service status",
    url: "https://www.mtr.com.hk/",
    categories: ["metro", "rail", "stranded", "other"],
    covers:
      "Hong Kong's metro operator: its own service status and notices for the MTR network.",
  },

  // --- Singapore -----------------------------------------------------------
  {
    id: "sg:lta",
    countryCode: "SG",
    organization: "Land Transport Authority (LTA) Singapore",
    title: "LTA — transport information",
    url: "https://www.lta.gov.sg/",
    categories: ["metro", "bus", "road", "stranded", "other"],
    covers:
      "Singapore's land transport authority: public transport and road information for Singapore.",
  },
  {
    id: "sg:sbs",
    countryCode: "SG",
    organization: "SBS Transit",
    title: "SBS Transit — service information",
    url: "https://www.sbstransit.com.sg/",
    categories: ["metro", "bus", "stranded", "other"],
    covers:
      "A major Singapore operator: its own service information for the bus and rail routes it runs.",
  },

  // --- Japan ---------------------------------------------------------------
  {
    id: "jp:jma",
    countryCode: "JP",
    organization: "Japan Meteorological Agency (JMA)",
    title: "JMA — weather warnings and advisories",
    url: "https://www.jma.go.jp/bosai/",
    categories: ["weather", "public_service", "road", "other"],
    covers:
      "Japan's national meteorological authority: its live warning and advisory map. Check the page for the warning level in force where you are.",
  },
  {
    id: "jp:mlit",
    countryCode: "JP",
    organization: "Ministry of Land, Infrastructure, Transport and Tourism (MLIT)",
    title: "MLIT — transport and infrastructure notices",
    url: "https://www.mlit.go.jp/",
    categories: ["rail", "metro", "bus", "road", "public_service", "stranded", "other"],
    covers:
      "Japan's transport ministry: announcements affecting rail, road, aviation and ports. It publishes notices rather than a per-train status, so confirm a specific service with the operator.",
  },
  {
    id: "jp:odpt",
    countryCode: "JP",
    organization: "Association of Open Public Transportation Data (ODPT)",
    title: "ODPT — Tokyo public transport open data",
    url: "https://www.odpt.org/",
    categories: ["metro", "rail", "bus", "other"],
    covers:
      "The open-data body for Tokyo's transport operators. It describes the data the operators publish; the operator's own page remains the source for a specific line.",
  },

  // --- France --------------------------------------------------------------
  {
    id: "fr:idfm",
    countryCode: "FR",
    organization: "Île-de-France Mobilités",
    title: "Île-de-France Mobilités — traffic information",
    url: "https://www.iledefrance-mobilites.fr/",
    categories: ["metro", "rail", "bus", "road", "public_service", "stranded", "other"],
    covers:
      "The transport authority for the Paris region: its 'Infos trafic' section reports disruptions to the metro, RER, tram and bus networks. It is a general information page, not a live service-status feed.",
  },
  {
    id: "fr:sncf",
    countryCode: "FR",
    organization: "SNCF",
    title: "SNCF — trains and network information",
    url: "https://www.sncf.com/",
    categories: ["rail", "stranded", "other"],
    covers:
      "France's national rail operator: mainline train information and service notices. Covers SNCF journeys, not urban metro or bus networks.",
  },
  {
    id: "fr:meteofrance",
    countryCode: "FR",
    organization: "Météo-France",
    title: "Météo-France — forecasts and vigilance",
    url: "https://meteofrance.com/",
    categories: ["weather", "public_service", "road", "other"],
    covers:
      "France's national meteorological service: forecasts and the official vigilance map for severe-weather warnings.",
  },

  // --- Spain ---------------------------------------------------------------
  {
    id: "es:dgt",
    countryCode: "ES",
    organization: "Dirección General de Tráfico (DGT)",
    title: "DGT — traffic information",
    url: "https://www.dgt.es/",
    categories: ["road", "public_service", "other"],
    covers:
      "Spain's traffic authority: its own traffic and road-condition information, including incidents and closures.",
  },

  // --- Mexico --------------------------------------------------------------
  {
    id: "mx:sct",
    countryCode: "MX",
    organization: "Secretaría de Infraestructura, Comunicaciones y Transportes (SICT)",
    title: "SICT — transport and infrastructure information",
    url: "https://www.gob.mx/sct",
    categories: ["road", "rail", "bus", "metro", "public_service", "stranded", "other"],
    covers:
      "Mexico's federal transport ministry: notices for roads, rail and transport. A national publication rather than a live incident feed.",
  },

  // --- Argentina -----------------------------------------------------------
  {
    id: "ar:transporte",
    countryCode: "AR",
    organization: "Ministerio de Transporte de la Nación",
    title: "Ministerio de Transporte — transport information",
    url: "https://www.argentina.gob.ar/transporte",
    categories: ["rail", "bus", "road", "metro", "public_service", "stranded", "other"],
    covers:
      "Argentina's national transport ministry: notices and information for the transport services it oversees.",
  },

  // --- United Arab Emirates ------------------------------------------------
  {
    id: "ae:rta",
    countryCode: "AE",
    organization: "Roads and Transport Authority (RTA) Dubai",
    title: "RTA Dubai — transport and road information",
    url: "https://www.rta.ae/wps/portal/rta/ae/home",
    categories: ["metro", "bus", "road", "stranded", "other"],
    covers:
      "Dubai's roads and transport authority: information for the metro, buses and roads it operates.",
  },

  // --- New Zealand ---------------------------------------------------------
  {
    id: "nz:nzta",
    countryCode: "NZ",
    organization: "Waka Kotahi NZ Transport Agency",
    title: "NZTA — traffic and travel information",
    url: "https://www.nzta.govt.nz/traffic-and-travel-information/",
    categories: ["road", "public_service", "other"],
    covers:
      "New Zealand's transport agency: its own traffic and travel information, including road closures and conditions.",
  },

  // --- South Korea (weather) ----------------------------------------------
  {
    id: "kr:kma",
    countryCode: "KR",
    organization: "Korea Meteorological Administration (KMA)",
    title: "KMA — weather information",
    url: "https://www.kma.go.kr/eng/",
    categories: ["weather", "public_service", "other"],
    covers:
      "South Korea's national meteorological service: forecasts and weather warnings.",
  },

  // --- Kenya ---------------------------------------------------------------
  {
    id: "ke:transport",
    countryCode: "KE",
    organization: "Ministry of Roads and Transport (Kenya)",
    title: "Kenya Ministry of Roads and Transport",
    url: "https://www.transport.go.ke/",
    categories: ["road", "rail", "bus", "metro", "public_service", "stranded", "other"],
    covers:
      "Kenya's national roads and transport ministry: notices and information for the transport it oversees.",
  },
  {
    id: "ke:kenha",
    countryCode: "KE",
    organization: "Kenya National Highways Authority (KeNHA)",
    title: "KeNHA — road information",
    url: "https://www.kenha.co.ke/",
    categories: ["road", "public_service", "other"],
    covers:
      "Kenya's national highways authority: information for the trunk roads it manages, including closures and works.",
  },
  {
    id: "ke:kura",
    countryCode: "KE",
    organization: "Kenya Urban Roads Authority (KURA)",
    title: "KURA — urban road information",
    url: "https://www.kura.go.ke/",
    categories: ["road", "public_service", "other"],
    covers:
      "Kenya's urban roads authority: information for the city roads it manages.",
  },
  {
    id: "ke:kma-weather",
    countryCode: "KE",
    organization: "Kenya Meteorological Department",
    title: "Kenya Meteorological Department — forecasts and warnings",
    url: "https://kma.go.ke/",
    categories: ["weather", "public_service", "road", "other"],
    covers:
      "Kenya's national meteorological service: forecasts and weather advisories.",
  },

  // --- Colombia ------------------------------------------------------------
  {
    id: "co:transport",
    countryCode: "CO",
    organization: "Ministerio de Transporte (Colombia)",
    title: "Ministerio de Transporte — transport information",
    url: "https://www.mintransporte.gov.co/",
    categories: ["road", "rail", "bus", "metro", "public_service", "stranded", "other"],
    covers:
      "Colombia's national transport ministry: notices and information for the transport it oversees.",
  },
  {
    id: "co:invias",
    countryCode: "CO",
    organization: "INVÍAS — Instituto Nacional de Vías",
    title: "INVÍAS — road conditions",
    url: "https://www.invias.gov.co/",
    categories: ["road", "public_service", "other"],
    covers:
      "Colombia's national roads institute: information for the national road network, including closures and conditions.",
  },

  // --- Vietnam -------------------------------------------------------------
  {
    id: "vn:vr",
    countryCode: "VN",
    organization: "Vietnam Railways (VNR)",
    title: "Vietnam Railways — official site",
    url: "https://www.vr.com.vn/",
    categories: ["rail", "metro", "stranded", "other"],
    covers:
      "The national rail operator's own notices and timetable information. It is not a live per-train status feed, so a specific train's running status should be confirmed directly.",
  },
  {
    id: "vn:nchmf",
    countryCode: "VN",
    organization: "National Center for Hydro-Meteorological Forecasting (NCHMF)",
    title: "National Center for Hydro-Meteorological Forecasting",
    url: "https://www.nchmf.gov.vn/",
    categories: ["weather", "road", "other"],
    covers:
      "Vietnam's national weather service: forecasts and storm advisories. A forecast is not an active warning, so check the page for its current status.",
  },

  // --- Thailand ------------------------------------------------------------
  {
    id: "th:dlt",
    countryCode: "TH",
    organization: "Department of Land Transport",
    title: "Department of Land Transport — official site",
    url: "https://www.dlt.go.th/",
    categories: ["bus", "road", "public_service", "other"],
    covers:
      "Thailand's land-transport authority: operator and licensing notices affecting buses and road transport. It publishes authority information rather than a live service-status feed.",
  },
  {
    id: "th:tmd",
    countryCode: "TH",
    organization: "Thai Meteorological Department (TMD)",
    title: "Thai Meteorological Department",
    url: "https://www.tmd.go.th/",
    categories: ["weather", "road", "other"],
    covers:
      "Thailand's national meteorological service: forecasts and weather warnings. A forecast is not an active warning, so confirm the page's current status.",
  },
  {
    id: "th:mot",
    countryCode: "TH",
    organization: "Ministry of Transport (Thailand)",
    title: "Ministry of Transport — official portal",
    url: "https://www.mot.go.th/",
    categories: ["metro", "rail", "bus", "road", "public_service", "stranded", "other"],
    covers:
      "Thailand's transport ministry: notices and announcements across rail, road and urban transport. It is a general portal, not a live service-status feed.",
  },
  {
    id: "th:doh",
    countryCode: "TH",
    organization: "Department of Highways",
    title: "Department of Highways — official site",
    url: "https://www.doh.go.th/",
    categories: ["road", "other"],
    covers:
      "Thailand's national highway authority: information for the national road network, including road conditions and closures.",
  },

  // --- Türkiye -------------------------------------------------------------
  {
    id: "tr:ibb",
    countryCode: "TR",
    organization: "İstanbul Büyükşehir Belediyesi (Istanbul Metropolitan Municipality)",
    title: "Istanbul Metropolitan Municipality",
    url: "https://www.ibb.istanbul/",
    categories: ["metro", "bus", "road", "public_service", "stranded", "other"],
    covers:
      "Istanbul's municipal authority: announcements affecting city transport and services. It is a general portal, not a live service-status feed.",
  },
  {
    id: "tr:mgm",
    countryCode: "TR",
    organization: "Turkish State Meteorological Service (MGM)",
    title: "Turkish State Meteorological Service",
    url: "https://www.mgm.gov.tr/",
    categories: ["weather", "road", "other"],
    covers:
      "Türkiye's national meteorological service: forecasts and weather warnings. A forecast is not an active warning, so confirm the page's current status.",
  },
  {
    id: "tr:kgm",
    countryCode: "TR",
    organization: "General Directorate of Highways (KGM)",
    title: "General Directorate of Highways",
    url: "https://www.kgm.gov.tr/",
    categories: ["road", "other"],
    covers:
      "Türkiye's national highways authority: information for the national road network, including road conditions and closures.",
  },

  // --- Poland --------------------------------------------------------------
  {
    id: "pl:imgw",
    countryCode: "PL",
    organization: "Institute of Meteorology and Water Management (IMGW-PIB)",
    title: "Institute of Meteorology and Water Management",
    url: "https://www.imgw.pl/",
    categories: ["weather", "road", "public_service", "other"],
    covers:
      "Poland's national meteorological and hydrological service: forecasts and warnings. A forecast is not an active warning, so confirm the page's current status.",
  },
  {
    id: "pl:infrastruktura",
    countryCode: "PL",
    organization: "Ministry of Infrastructure (Poland)",
    title: "Ministry of Infrastructure — official portal",
    url: "https://www.gov.pl/web/infrastruktura",
    categories: ["metro", "rail", "bus", "road", "public_service", "stranded", "other"],
    covers:
      "Poland's infrastructure ministry: notices and announcements across rail, road and urban transport. It is a general portal, not a live service-status feed.",
  },
  {
    id: "pl:pkp",
    countryCode: "PL",
    organization: "PKP S.A. (Polskie Koleje Państwowe)",
    title: "PKP — official site",
    url: "https://www.pkp.pl/",
    categories: ["rail", "metro", "stranded", "other"],
    covers:
      "Poland's national rail group: operator information and notices. A specific train's running status should be confirmed directly with the operator.",
  },
  {
    id: "pl:gddkia",
    countryCode: "PL",
    organization: "General Directorate for National Roads and Motorways (GDDKiA)",
    title: "General Directorate for National Roads and Motorways",
    url: "https://www.gddkia.gov.pl/",
    categories: ["road", "other"],
    covers:
      "Poland's national roads authority: information for the national road network, including road conditions and closures.",
  },

  // --- South Africa --------------------------------------------------------
  {
    id: "za:airports",
    countryCode: "ZA",
    organization: "Airports Company South Africa (ACSA)",
    title: "Airports Company South Africa — official site",
    url: "https://www.airports.co.za/",
    categories: ["flights", "stranded", "other"],
    covers:
      "The operator of South Africa's major airports: airport information and passenger notices. It publishes airport information rather than live per-flight status, which only the airline can confirm.",
  },
  {
    id: "za:gautrain",
    countryCode: "ZA",
    organization: "Gautrain",
    title: "Gautrain — official site",
    url: "https://www.gautrain.co.za/",
    categories: ["rail", "metro", "stranded", "other"],
    covers:
      "The Gautrain rapid-rail operator: service information and notices for its routes. Confirm a specific service's status directly with the operator.",
  },
  {
    id: "za:transnet",
    countryCode: "ZA",
    organization: "Transnet",
    title: "Transnet — official site",
    url: "https://www.transnet.net/",
    categories: ["rail", "bus", "public_service", "other"],
    covers:
      "South Africa's state freight and port rail operator: notices affecting rail and port operations. It is not a live passenger service-status feed.",
  },
  {
    id: "za:prasa",
    countryCode: "ZA",
    organization: "Passenger Rail Agency of South Africa (PRASA)",
    title: "Passenger Rail Agency of South Africa",
    url: "https://www.prasa.com/",
    categories: ["rail", "metro", "stranded", "other"],
    covers:
      "South Africa's passenger rail operator: service information and notices for commuter rail. Confirm a specific service's status directly with the operator.",
  },
  {
    id: "za:joburg",
    countryCode: "ZA",
    organization: "City of Johannesburg",
    title: "City of Johannesburg — official site",
    url: "https://www.joburg.org.za/",
    categories: ["metro", "bus", "road", "public_service", "stranded", "other"],
    covers:
      "The City of Johannesburg's official portal: municipal announcements affecting transport and services. It is not a live service-status feed.",
  },
  {
    id: "za:capetown",
    countryCode: "ZA",
    organization: "City of Cape Town",
    title: "City of Cape Town — official site",
    url: "https://www.capetown.gov.za/",
    categories: ["metro", "bus", "road", "public_service", "stranded", "other"],
    covers:
      "The City of Cape Town's official portal: municipal announcements affecting transport and services. It is not a live service-status feed.",
  },
  {
    id: "za:arrivealive",
    countryCode: "ZA",
    organization: "Arrive Alive (Road Traffic Management Corporation)",
    title: "Arrive Alive — road safety information",
    url: "https://www.arrivealive.co.za/",
    categories: ["road", "other"],
    covers:
      "South Africa's road-safety information service: road-safety notices and advice. It is not a live traffic map, so it will not show a closure on a specific road.",
  },
];

const BY_COUNTRY = new Map<string, DirectoryEntry[]>();
for (const entry of ENTRIES) {
  const list = BY_COUNTRY.get(entry.countryCode) ?? [];
  list.push(entry);
  BY_COUNTRY.set(entry.countryCode, list);
}

/** Directory entries for a country and category, most specific first. */
export function directoryFor(
  countryCode: string | undefined,
  category: AssistanceCategory,
): DirectoryEntry[] {
  if (!countryCode) return [];
  const entries = BY_COUNTRY.get(countryCode.toUpperCase()) ?? [];
  return entries
    .filter((entry) => entry.categories.includes(category) || entry.categories.includes("other"))
    .sort((a, b) => {
      const aExact = a.categories.includes(category) ? 0 : 1;
      const bExact = b.categories.includes(category) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.organization.localeCompare(b.organization);
    });
}

/** Every country the directory has at least one entry for. */
export function directoryCountries(): string[] {
  return [...BY_COUNTRY.keys()].sort();
}

/** The full directory, for the coverage/limitations surface. */
export function directoryCatalogue(): DirectoryEntry[] {
  return [...ENTRIES];
}
