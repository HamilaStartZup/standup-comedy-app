import { lookupOfficialTheaterWebsite, lookupVenueInDirectories } from './directoryLookupService';
import { discoverWebsiteFromWeb } from './websiteDiscoveryService';

export interface DiscoveredVenueContacts {
  website: string | null;
  phone: string | null;
  source: string | null;
}

/** Annuaires → site officiel direct → recherche web générique (secours). */
export async function discoverVenueContacts(
  name: string,
  city?: string | null,
  typeLabel?: string,
  departement?: string | null
): Promise<DiscoveredVenueContacts> {
  const fromDirectories = await lookupVenueInDirectories(name, city, departement, typeLabel);
  if (fromDirectories.website || fromDirectories.phone) {
    return fromDirectories;
  }

  const fromOfficialSite = await lookupOfficialTheaterWebsite(name, city, departement, typeLabel);
  if (fromOfficialSite.website || fromOfficialSite.phone) {
    return fromOfficialSite;
  }

  const website = await discoverWebsiteFromWeb(name, city, typeLabel);
  return { website, phone: null, source: website ? 'web' : null };
}
