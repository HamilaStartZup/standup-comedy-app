import { FRENCH_DEPARTMENTS } from '../../constants/frenchDepartments';
import { getDepartmentFromPostalCode } from '../../utils/cityMapping';
import { normalizePhoneFR, sleep } from '../../utils/prospectionHelpers';
import type { ProspectedVenueType } from '../../models/ProspectedVenue';
import type { ProspectionSearchResult } from './types';
import { guessEmailFromWebsite } from './venueEnrichment';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassConfig {
  amenityTags: string[];
  namePattern?: RegExp;
}

const OVERPASS_BY_TYPE: Record<ProspectedVenueType, OverpassConfig> = {
  cinema: { amenityTags: ['cinema'] },
  theatre: { amenityTags: ['theatre', 'arts_centre'], namePattern: /théâtre|theatre/i },
  salle_spectacle: { amenityTags: ['theatre', 'arts_centre', 'events_venue'] },
  cafe_theatre: { amenityTags: ['theatre', 'arts_centre'], namePattern: /café.?théâtre|cafe.?theatre/i },
  comedy_club: {
    amenityTags: ['theatre', 'arts_centre', 'events_venue', 'bar'],
    namePattern: /comedy club|club de comédie|club d'humour/i,
  },
  centre_culturel: { amenityTags: ['arts_centre'], namePattern: /culturel|médiathèque/i },
  mjc: { amenityTags: ['community_centre'], namePattern: /mjc|maison des jeunes|maison de quartier/i },
  centre_social: { amenityTags: ['community_centre'], namePattern: /centre social|socioculturel/i },
  autre: { amenityTags: ['events_venue', 'community_centre'], namePattern: /polyvalente|fêtes|fetes/i },
};

function departmentToOverpassRef(department: string): string {
  return department;
}

/** Paris (75) : zone admin OSM incompatible avec la requête département actuelle. */
const OVERPASS_SKIP_DEPARTMENTS = new Set(['75']);

function buildOverpassQuery(department: string, amenityTags: string[]): string {
  const ref = departmentToOverpassRef(department);
  const selectors = amenityTags
    .map(
      (tag) => `(node["amenity"="${tag}"](area.d);way["amenity"="${tag}"](area.d);relation["amenity"="${tag}"](area.d);)`
    )
    .join('');

  return `[out:json][timeout:60];
area["ref:INSEE"="${ref}"]["admin_level"="6"]->.d;
(
  ${selectors}
);
out center tags;`;
}

function mapOverpassElement(
  el: OverpassElement,
  type: ProspectedVenueType,
  department: string,
  namePattern?: RegExp
): ProspectionSearchResult | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;
  if (namePattern && !namePattern.test(name)) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;

  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ') || undefined;
  const city = tags['addr:city'] ?? tags['addr:place'];
  const postalCode = tags['addr:postcode'];
  const departement =
    (postalCode ? getDepartmentFromPostalCode(postalCode) : null) ?? department;

  return {
    name,
    type,
    email: tags.email ?? tags['contact:email'] ?? null,
    phone: normalizePhoneFR(tags.phone ?? tags['contact:phone']),
    address: {
      street,
      city,
      postalCode,
      departement,
      departementName: FRENCH_DEPARTMENTS[departement],
    },
    website: tags.website ?? tags['contact:website'] ?? null,
    source: 'openstreetmap',
  };
}

async function runOverpassQuery(query: string): Promise<OverpassElement[]> {
  const endpoints = [
    process.env.OVERPASS_API_URL,
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ].filter((url, i, arr): url is string => !!url && arr.indexOf(url) === i);

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'ConnectComedyClub-Prospection/1.0',
        },
        body: new URLSearchParams({ data: query }),
      });

      if (!res.ok) {
        console.warn(`Overpass API erreur HTTP ${res.status} (${url})`);
        continue;
      }

      const data = await res.json() as { elements?: OverpassElement[] };
      return data.elements ?? [];
    } catch (err) {
      console.warn(`Overpass échec (${url}):`, err);
    }
  }

  return [];
}

export async function searchOverpassByDepartment(
  department: string,
  types: ProspectedVenueType[],
  enrichEmails: boolean
): Promise<ProspectionSearchResult[]> {
  if (OVERPASS_SKIP_DEPARTMENTS.has(department)) {
    return [];
  }

  const results: ProspectionSearchResult[] = [];
  const seen = new Set<string>();

  for (const type of types) {
    const cfg = OVERPASS_BY_TYPE[type];
    const query = buildOverpassQuery(department, cfg.amenityTags);

    try {
      const elements = await runOverpassQuery(query);
      for (const el of elements) {
        const mapped = mapOverpassElement(el, type, department, cfg.namePattern);
        if (!mapped) continue;

        const key = `${mapped.name}|${mapped.address.postalCode ?? ''}|${mapped.address.city ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (!mapped.email && enrichEmails && mapped.website) {
          mapped.email = await guessEmailFromWebsite(mapped.website);
        }

        results.push(mapped);
      }
    } catch (err) {
      console.warn(`Overpass échec ${type}/${department}:`, err);
    }

    await sleep(300);
  }

  return results;
}
