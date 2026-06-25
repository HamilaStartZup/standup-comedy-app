import type { ProspectedVenueType } from '../../models/ProspectedVenue';
import { sleep } from '../../utils/prospectionHelpers';
import { searchBasilicByDepartment } from './basilicOpenDataService';
import { searchBpeByDepartment } from './bpeOpenDataService';
import { searchGooglePlacesByDepartment } from './googlePlacesService';
import { searchOverpassByDepartment } from './overpassSearchService';
import { getEnabledSearchProviders } from './types';
import { upsertProspectedVenue, enrichVenuesContacts } from './venueRepository';

export async function searchProspectionTargets(
  departements: string[],
  types: ProspectedVenueType[],
  options?: { enrichEmails?: boolean }
): Promise<{
  found: number;
  new: number;
  merged: number;
  duplicates: number;
  websitesFound: number;
  emailsEnriched: number;
  sources: string[];
}> {
  const providers = getEnabledSearchProviders();
  const enrichEmails = options?.enrichEmails ?? true;
  const usedSources: string[] = [];

  let found = 0;
  let newCount = 0;
  let mergedCount = 0;
  let duplicates = 0;

  const allDepts = departements.length > 0 ? departements : ['75'];

  for (const dept of allDepts) {
    const batchResults: Awaited<ReturnType<typeof searchBpeByDepartment>> = [];

    if (providers.includes('bpe')) {
      usedSources.push('insee_bpe');
      const t0 = Date.now();
      const bpeResults = await searchBpeByDepartment(dept, types, enrichEmails);
      console.log(`📧 BPE ${dept} — ${bpeResults.length} résultat(s) en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      batchResults.push(...bpeResults);
    }

    if (providers.includes('data_gouv')) {
      usedSources.push('data_gouv');
      const t0 = Date.now();
      const basilicResults = await searchBasilicByDepartment(dept, types);
      console.log(`📧 Basilic ${dept} — ${basilicResults.length} résultat(s) en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      batchResults.push(...basilicResults);
    }

    if (providers.includes('overpass')) {
      usedSources.push('openstreetmap');
      const t0 = Date.now();
      const osmResults = await searchOverpassByDepartment(dept, types, enrichEmails);
      console.log(`📧 Overpass ${dept} — ${osmResults.length} résultat(s) en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      batchResults.push(...osmResults);
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (providers.includes('google') && apiKey) {
      usedSources.push('google_places');
      const t0 = Date.now();
      const googleResults = await searchGooglePlacesByDepartment(dept, types, apiKey, enrichEmails);
      console.log(`📧 Google Places ${dept} — ${googleResults.length} résultat(s) en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      batchResults.push(...googleResults);
    } else if (providers.includes('google') && !apiKey) {
      console.warn('⚠️ Google Places activé mais GOOGLE_PLACES_API_KEY absente — ignoré');
    }

    found += batchResults.length;
    const tUpsert = Date.now();
    for (const r of batchResults) {
      const status = await upsertProspectedVenue(r, { enrichEmail: enrichEmails });
      if (status === 'new') newCount++;
      else if (status === 'merged') mergedCount++;
      else duplicates++;
    }
    console.log(
      `📧 Import ${dept} — ${batchResults.length} lieux, upsert en ${((Date.now() - tUpsert) / 1000).toFixed(1)}s`
    );

    await sleep(200);
  }

  let websitesFound = 0;
  let emailsEnriched = 0;
  if (enrichEmails) {
    const enrichResult = await enrichVenuesContacts(allDepts, { emailLimit: 80 });
    websitesFound = enrichResult.websitesFound;
    emailsEnriched = enrichResult.emailsEnriched;
  }

  if (found === 0 && providers.length === 0) {
    console.warn('⚠️ Aucune source de prospection activée (PROSPECTION_SEARCH_SOURCES)');
  }

  return {
    found,
    new: newCount,
    merged: mergedCount,
    duplicates,
    websitesFound,
    emailsEnriched,
    sources: [...new Set(usedSources)],
  };
}

// Réexport pour compatibilité
export { upsertProspectedVenue, enrichVenuesContacts } from './venueRepository';
