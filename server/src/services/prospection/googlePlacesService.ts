import { getDepartmentFromPostalCode } from '../../utils/cityMapping';
import { FRENCH_DEPARTMENTS } from '../../constants/frenchDepartments';
import { sleep, normalizePhoneFR } from '../../utils/prospectionHelpers';
import type { ProspectedVenueType } from '../../models/ProspectedVenue';
import type { ProspectionSearchResult } from './types';
import { guessEmailFromWebsite } from './venueEnrichment';

const TYPE_SEARCH_CONFIG: Record<ProspectedVenueType, { query: string; nameFilter?: RegExp }> = {
  theatre: { query: 'théâtre' },
  cinema: { query: 'cinéma' },
  salle_spectacle: { query: 'salle de spectacle' },
  cafe_theatre: { query: 'café-théâtre', nameFilter: /café.?théâtre|cafe.?theatre/i },
  comedy_club: { query: 'comedy club club de comédie', nameFilter: /comedy club|club de comédie|club d'humour/i },
  mjc: { query: 'MJC maison des jeunes et de la culture', nameFilter: /mjc|maison des jeunes/i },
  centre_culturel: { query: 'centre culturel' },
  centre_social: { query: 'centre social', nameFilter: /centre social|social/i },
  autre: { query: 'salle polyvalente' },
};

async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<{ website?: string; phone?: string }> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website,formatted_phone_number&key=${apiKey}&language=fr`;
  const res = await fetch(url);
  if (!res.ok) return {};
  const data = await res.json() as { result?: { website?: string; formatted_phone_number?: string } };
  return {
    website: data.result?.website,
    phone: normalizePhoneFR(data.result?.formatted_phone_number),
  };
}

export async function searchGooglePlacesByDepartment(
  department: string,
  types: ProspectedVenueType[],
  apiKey: string,
  enrichEmails: boolean
): Promise<ProspectionSearchResult[]> {
  const results: ProspectionSearchResult[] = [];

  for (const type of types) {
    const cfg = TYPE_SEARCH_CONFIG[type];
    if (!cfg) {
      console.warn(`Google Places: type "${type}" non configuré — ignoré`);
      continue;
    }

    const deptName = FRENCH_DEPARTMENTS[department] ?? department;
    const query = encodeURIComponent(`${cfg.query} ${deptName} France`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}&language=fr&region=fr`;

    const res = await fetch(url);
    if (!res.ok) continue;

    const data = await res.json() as {
      results?: Array<{ name: string; formatted_address?: string; place_id: string }>;
      status?: string;
    };

    if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
      console.warn(`Google Places ${data.status} — source ignorée pour ce run`);
      return results;
    }

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn(`Google Places status ${data.status} pour ${type} / ${department}`);
      continue;
    }

    for (const place of data.results ?? []) {
      if (cfg.nameFilter && !cfg.nameFilter.test(place.name)) continue;

      const addressParts = (place.formatted_address ?? '').split(',').map((s) => s.trim());
      const postalMatch = (place.formatted_address ?? '').match(/\b(\d{5})\b/);
      const postalCode = postalMatch?.[1];
      const departement = postalCode ? getDepartmentFromPostalCode(postalCode) ?? department : department;

      const details = await fetchPlaceDetails(place.place_id, apiKey);
      await sleep(1000);

      const website = details.website ?? null;
      const email = enrichEmails ? await guessEmailFromWebsite(website) : null;

      results.push({
        name: place.name,
        type,
        email,
        phone: details.phone ?? null,
        address: {
          street: addressParts[0],
          city: addressParts.length > 1 ? addressParts[addressParts.length - 2] : undefined,
          postalCode,
          departement: departement ?? department,
          departementName: FRENCH_DEPARTMENTS[departement ?? department],
        },
        website,
        source: 'google_places',
      });
    }

    await sleep(1000);
  }

  return results;
}
