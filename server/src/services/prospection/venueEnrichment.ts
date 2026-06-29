import { extractEmailsFromHtml, isValidEmail } from '../../utils/prospectionHelpers';

const CONTACT_PATHS = [
  '',
  '/contact',
  '/contacts',
  '/nous-contacter',
  '/nous_contacter',
  '/mentions-legales',
  '/mentions-legales/',
  '/legal',
  '/infos-pratiques',
];

const BLOCKED_EMAIL_FRAGMENTS = ['example.', 'wixpress', 'sentry', 'noreply', 'no-reply', 'donotreply'];

function pickBestEmail(emails: string[]): string | null {
  const filtered = emails.filter(
    (e) => !BLOCKED_EMAIL_FRAGMENTS.some((frag) => e.includes(frag))
  );
  const professional = filtered.find((e) =>
    /^(contact|info|accueil|direction|communication|secretariat)@/i.test(e)
  );
  return professional ?? filtered[0] ?? null;
}

async function fetchPageEmails(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ConnectComedyClub-Prospection/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    return pickBestEmail(extractEmailsFromHtml(html).map((e) => e.toLowerCase()));
  } catch {
    return null;
  }
}

function buildCandidateUrls(website: string): string[] {
  const base = website.startsWith('http') ? website : `https://${website}`;
  let origin: string;
  try {
    const parsed = new URL(base);
    origin = `${parsed.protocol}//${parsed.host}`;
  } catch {
    return [base];
  }

  const urls = new Set<string>();
  for (const path of CONTACT_PATHS) {
    urls.add(path ? `${origin}${path}` : base);
  }
  return [...urls];
}

export async function enrichEmailFromWebsite(website: string | null | undefined): Promise<string | null> {
  if (!website) return null;

  for (const url of buildCandidateUrls(website)) {
    const email = await fetchPageEmails(url);
    if (email) return email;
  }
  return null;
}

export async function guessEmailFromWebsite(website: string | null | undefined): Promise<string | null> {
  const scraped = await enrichEmailFromWebsite(website);
  if (scraped || !website) return scraped;

  try {
    const domain = new URL(website.startsWith('http') ? website : `https://${website}`)
      .hostname.replace(/^www\./, '');
    const guess = `contact@${domain}`;
    if (isValidEmail(guess)) return guess;
  } catch { /* ignore */ }
  return null;
}
