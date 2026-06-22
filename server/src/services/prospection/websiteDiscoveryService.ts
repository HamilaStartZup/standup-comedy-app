import { sleep } from '../../utils/prospectionHelpers';

const DDG_HTML_URL = 'https://html.duckduckgo.com/html/';
const USER_AGENT = 'ConnectComedyClub-Prospection/1.0';

const BLOCKED_HOST_FRAGMENTS = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'wikipedia.org',
  'pagesjaunes.fr',
  'tripadvisor.',
  'allocine.fr',
  'lafourchette.',
  'booking.com',
  'google.com',
  'duckduckgo.com',
  'data.gouv.fr',
  'openstreetmap.org',
  'culture.gouv.fr',
  'assoce.fr',
  'helloasso.com',
];

function decodeDdgUrl(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function extractDdgResultUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /uddg=([^&"]+)/g;
  let match = regex.exec(html);
  while (match !== null) {
    const decoded = decodeDdgUrl(match[1]);
    if (decoded) urls.push(decoded);
    match = regex.exec(html);
  }
  return [...new Set(urls)];
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return BLOCKED_HOST_FRAGMENTS.some((frag) => host.includes(frag));
}

function scoreWebsiteUrl(url: string, name: string): number {
  try {
    const parsed = new URL(url);
    if (isBlockedHost(parsed.hostname)) return -1;

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const normalizedName = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');

    let score = 0;
    if (host.endsWith('.fr') || host.endsWith('.org')) score += 2;
    if (host.includes('theatre') || host.includes('theater') || host.includes('comedie') || host.includes('comedy')) {
      score += 4;
    }
    if (normalizedName.length >= 4 && host.includes(normalizedName.slice(0, Math.min(8, normalizedName.length)))) {
      score += 3;
    }
    if (host.includes('mjc')) score += 2;
    if (host.includes('cinema') || host.includes('theatre')) score += 1;
    return score;
  } catch {
    return -1;
  }
}

function pickBestWebsite(urls: string[], name: string): string | null {
  const ranked = urls
    .map((url) => ({ url, score: scoreWebsiteUrl(url, name) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.url ?? null;
}

export { pickBestWebsite };

export async function searchDdg(query: string): Promise<string[]> {
  try {
    const body = new URLSearchParams({ q: query });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(DDG_HTML_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    clearTimeout(timeout);

    if (!res.ok) return [];

    const html = await res.text();
    return extractDdgResultUrls(html);
  } catch {
    return [];
  }
}

export async function discoverWebsiteFromWeb(
  name: string,
  city?: string | null,
  typeLabel?: string
): Promise<string | null> {
  const typeHints: Record<string, string> = {
    mjc: 'MJC',
    cinema: 'cinéma',
    theatre: 'théâtre',
    salle_spectacle: 'salle spectacle',
    centre_culturel: 'centre culturel',
    centre_social: 'centre social',
  };

  const hint = typeLabel ? typeHints[typeLabel] ?? '' : '';
  const queries = [
    [name, city, hint, 'site officiel contact'].filter(Boolean).join(' ').trim(),
    [name, city, hint, 'site:offi.fr'].filter(Boolean).join(' ').trim(),
    [name, 'Paris', 'site:theatreinparis.com'].filter(Boolean).join(' ').trim(),
    [name, 'Paris', 'site:tpa.fr'].filter(Boolean).join(' ').trim(),
    [name, city, 'théâtre site officiel'].filter(Boolean).join(' ').trim(),
  ];

  try {
    const allUrls: string[] = [];
    for (const query of queries) {
      allUrls.push(...await searchDdg(query));
      await sleep(600);
    }

    const website = pickBestWebsite([...new Set(allUrls)], name);
    if (website) return website;

    await sleep(400);
    return null;
  } catch {
    return null;
  }
}
