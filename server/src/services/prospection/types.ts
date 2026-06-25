import type { ProspectedVenueType, ProspectedVenueSource } from '../../models/ProspectedVenue';

export interface ProspectionSearchResult {
  name: string;
  type: ProspectedVenueType;
  email?: string | null;
  phone?: string | null;
  address: {
    street?: string;
    city?: string;
    postalCode?: string;
    departement?: string;
    departementName?: string;
  };
  website?: string | null;
  source: ProspectedVenueSource;
}

export type ProspectionSearchProvider = 'bpe' | 'overpass' | 'data_gouv' | 'scraping' | 'google';

export function getEnabledSearchProviders(): ProspectionSearchProvider[] {
  const raw = process.env.PROSPECTION_SEARCH_SOURCES ?? 'bpe,data_gouv';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ProspectionSearchProvider =>
      s === 'bpe' ||
      s === 'overpass' ||
      s === 'data_gouv' ||
      s === 'scraping' ||
      s === 'google'
    );
}
