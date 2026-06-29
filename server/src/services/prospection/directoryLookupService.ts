import { normalizePhoneFR, sleep } from '../../utils/prospectionHelpers';
import { pickBestWebsite, searchDdg } from './websiteDiscoveryService';

const USER_AGENT = 'ConnectComedyClub-Prospection/1.0';
const PARIS_AREA_DEPARTMENTS = new Set(['75', '77', '78', '91', '92', '93', '94', '95']);
const CULTURAL_TYPES = new Set(['theatre', 'cinema', 'salle_spectacle', 'centre_culturel', 'mjc', 'autre']);

const OFFI_SKIP_FRAGMENTS = [
  '/contact',
  '/connexion',
  '/abonnement',
  '/carte-cadeau',
  '/conditions-',
  '/mentions-legales',
  '/newsletter',
  '/recherche',
];

const EXTERNAL_LINK_SKIP_HOSTS = [
  'offi.fr',
  'tpa.fr',
  'paris.fr',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'google.com',
  'wikipedia.org',
  'theatreinparis.com',
  'billetreduc.com',
  'fnac.com',
  'ticketmaster',
  'digitick.com',
];

/** Annuaires et billetteries — à exclure lors de la recherche du site officiel. */
const DIRECTORY_AND_AGGREGATOR_HOSTS = [
  'offi.fr',
  'tpa.fr',
  'theatreinparis.com',
  'billetreduc',
  'fnac.com',
  'ticketmaster',
  'digitick',
  'allocine.fr',
  'pagesjaunes.fr',
  'wikipedia.org',
  'facebook.com',
  'instagram.com',
  'tripadvisor',
  'sortiraparis.com',
  'lignesduspectacle',
  'reserver.com',
];

export interface DirectoryLookupResult {
  website: string | null;
  phone: string | null;
  source: string | null;
}

function isParisArea(departement?: string | null, city?: string | null): boolean {
  if (departement && PARIS_AREA_DEPARTMENTS.has(departement)) return true;
  const cityNorm = (city ?? '').toLowerCase();
  return cityNorm.includes('paris');
}

function isOffiVenuePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('offi.fr')) return false;
    const path = parsed.pathname.toLowerCase();
    if (path === '/' || path === '/theatre' || path === '/cinema') return false;
    return !OFFI_SKIP_FRAGMENTS.some((frag) => path.includes(frag));
  } catch {
    return false;
  }
}

function isTheatreInParisVenuePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('theatreinparis.com') && parsed.pathname.includes('/theatre/');
  } catch {
    return false;
  }
}

function isTpaVenuePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('tpa.fr')) return false;
    const path = parsed.pathname.toLowerCase();
    if (path === '/' || path.startsWith('/pieces-')) return false;
    return path.length > 1;
  } catch {
    return false;
  }
}

function isParisCulturePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('paris.fr') && /theatre|spectacle|culture|salle/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isLikelyOfficialTheaterSite(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (DIRECTORY_AND_AGGREGATOR_HOSTS.some((frag) => host.includes(frag))) return false;
    if (EXTERNAL_LINK_SKIP_HOSTS.some((frag) => host.includes(frag))) return false;
    return true;
  } catch {
    return false;
  }
}

function extractExternalLinks(html: string, venueName: string): string[] {
  const links: string[] = [];
  const regex = /href=["'](https?:\/\/[^"']+)["']/gi;
  let match = regex.exec(html);
  while (match !== null) {
    try {
      const parsed = new URL(match[1]);
      const host = parsed.hostname.toLowerCase();
      if (EXTERNAL_LINK_SKIP_HOSTS.some((skip) => host.includes(skip))) {
        match = regex.exec(html);
        continue;
      }
      links.push(parsed.toString());
    } catch {
      // ignore invalid URLs
    }
    match = regex.exec(html);
  }
  return [...new Set(links)];
}

function extractPhonesFromHtml(html: string): string[] {
  const matches = html.match(/0[1-9](?:[\s.\-]?\d{2}){4}/g) ?? [];
  const normalized = matches
    .map((phone) => normalizePhoneFR(phone))
    .filter((phone): phone is string => Boolean(phone));
  return [...new Set(normalized)];
}

function pickBestPhone(phones: string[]): string | null {
  if (phones.length === 0) return null;
  const parisLandline = phones.find((p) => p.startsWith('+331'));
  return parisLandline ?? phones[0];
}

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function parseDirectoryVenuePage(
  url: string,
  venueName: string,
  source: string
): Promise<DirectoryLookupResult> {
  const html = await fetchPageHtml(url);
  if (!html) return { website: null, phone: null, source: null };

  const externalLinks = extractExternalLinks(html, venueName);
  const website = pickBestWebsite(externalLinks, venueName);
  const phone = pickBestPhone(extractPhonesFromHtml(html));

  if (!website && !phone) return { website: null, phone: null, source: null };
  return { website, phone, source };
}

async function parseOffiVenuePage(url: string, venueName: string): Promise<DirectoryLookupResult> {
  return parseDirectoryVenuePage(url, venueName, 'offi.fr');
}

async function parseTheatreInParisVenuePage(url: string, venueName: string): Promise<DirectoryLookupResult> {
  const result = await parseDirectoryVenuePage(url, venueName, 'theatreinparis.com');
  return { ...result, phone: null };
}

async function parseOfficialTheaterWebsite(url: string, venueName: string): Promise<DirectoryLookupResult> {
  const html = await fetchPageHtml(url);
  if (!html) return { website: null, phone: null, source: null };

  const phone = pickBestPhone(extractPhonesFromHtml(html));
  return { website: url, phone, source: 'site-officiel' };
}

async function searchOfficialTheaterUrls(name: string, city?: string | null): Promise<string[]> {
  const cityLabel = city ?? 'Paris';
  const excludeDirs = [
    '-site:offi.fr',
    '-site:tpa.fr',
    '-site:theatreinparis.com',
    '-site:billetreduc.com',
    '-site:facebook.com',
    '-site:fnac.com',
  ].join(' ');

  const queries = [
    `"${name}" ${cityLabel} théâtre site officiel ${excludeDirs}`,
    `"${name}" ${cityLabel} theatre site officiel ${excludeDirs}`,
    `${name} ${cityLabel} théâtre contact ${excludeDirs}`,
  ];

  const urls: string[] = [];
  for (const query of queries) {
    const found = await searchDdg(query);
    urls.push(...found.filter(isLikelyOfficialTheaterSite));
    await sleep(700);
  }

  return [...new Set(urls)];
}

/**
 * Recherche directe du site officiel (hors annuaires).
 * Privilégie les domaines theatre / theater / comedie et lit la page pour le téléphone.
 */
export async function lookupOfficialTheaterWebsite(
  name: string,
  city?: string | null,
  departement?: string | null,
  typeLabel?: string
): Promise<DirectoryLookupResult> {
  if (!isParisArea(departement, city)) {
    return { website: null, phone: null, source: null };
  }
  const theaterTypes = new Set(['theatre', 'salle_spectacle', 'cinema', 'centre_culturel', 'autre']);
  if (typeLabel && !theaterTypes.has(typeLabel)) {
    return { website: null, phone: null, source: null };
  }

  const urls = await searchOfficialTheaterUrls(name, city);
  const website = pickBestWebsite(urls, name);
  if (!website) return { website: null, phone: null, source: null };

  return parseOfficialTheaterWebsite(website, name);
}

async function searchDirectoryBySite(
  name: string,
  site: string,
  cityLabel: string,
  extraTerms = ''
): Promise<string[]> {
  const query = [`site:${site}`, `"${name}"`, cityLabel, extraTerms].filter(Boolean).join(' ');
  const urls = await searchDdg(query);
  await sleep(800);
  return urls;
}

/**
 * Recherche un lieu dans L'Officiel des spectacles, TPA, Theatre in Paris et Paris.fr (IDF).
 * Ordre : Offi → TPA → Theatre in Paris → paris.fr
 * @see https://www.offi.fr/
 * @see https://www.tpa.fr/
 * @see https://www.theatreinparis.com/
 */
export async function lookupVenueInDirectories(
  name: string,
  city?: string | null,
  departement?: string | null,
  typeLabel?: string
): Promise<DirectoryLookupResult> {
  if (!isParisArea(departement, city)) {
    return { website: null, phone: null, source: null };
  }
  if (typeLabel && !CULTURAL_TYPES.has(typeLabel)) {
    return { website: null, phone: null, source: null };
  }

  const cityLabel = city ?? 'Paris';

  // 1. L'Officiel des spectacles
  for (const url of await searchDirectoryBySite(name, 'offi.fr', cityLabel)) {
    if (!isOffiVenuePage(url)) continue;
    const result = await parseOffiVenuePage(url, name);
    if (result.website || result.phone) return result;
  }

  // 2. TPA — Théâtres et Producteurs Associés
  for (const url of await searchDirectoryBySite(name, 'tpa.fr', 'Paris')) {
    if (!isTpaVenuePage(url)) continue;
    const result = await parseDirectoryVenuePage(url, name, 'tpa.fr');
    if (result.website || result.phone) return result;
  }

  // 3. Theatre in Paris
  for (const url of await searchDirectoryBySite(name, 'theatreinparis.com', 'Paris')) {
    if (!isTheatreInParisVenuePage(url)) continue;
    const result = await parseTheatreInParisVenuePage(url, name);
    if (result.website) return result;
  }

  // 4. paris.fr — théâtres municipaux
  for (const url of await searchDirectoryBySite(name, 'paris.fr', 'Paris', 'théâtre')) {
    if (!isParisCulturePage(url)) continue;
    const result = await parseDirectoryVenuePage(url, name, 'paris.fr');
    if (result.website || result.phone) return result;
  }

  return { website: null, phone: null, source: null };
}
