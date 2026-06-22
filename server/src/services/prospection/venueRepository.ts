import { ProspectedVenueModel, type ProspectedVenueDocument } from '../../models/ProspectedVenue';
import { sleep } from '../../utils/prospectionHelpers';
import type { ProspectionSearchResult } from './types';
import { guessEmailFromWebsite } from './venueEnrichment';
import { discoverVenueContacts } from './venueDiscoveryService';

export type UpsertProspectedVenueResult = 'new' | 'merged' | 'duplicate';

export interface EnrichVenuesContactsResult {
  websitesFound: number;
  emailsEnriched: number;
  phonesEnriched: number;
  venuesProcessed: number;
}

export interface EnrichVenuesContactsOptions {
  emailLimit?: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDedupFilter(result: ProspectionSearchResult): Record<string, unknown> {
  if (result.email) {
    return { email: result.email };
  }

  const filter: Record<string, unknown> = {
    name: { $regex: new RegExp(`^${escapeRegex(result.name.trim())}$`, 'i') },
    'address.departement': result.address.departement ?? '',
  };

  if (result.address.postalCode) {
    filter['address.postalCode'] = result.address.postalCode;
  } else if (result.address.city) {
    filter['address.city'] = { $regex: new RegExp(`^${escapeRegex(result.address.city.trim())}$`, 'i') };
  }

  return filter;
}

async function tryAssignEmail(
  venueId: string,
  email: string,
  attemptedAt: Date = new Date()
): Promise<boolean> {
  const emailTaken = await ProspectedVenueModel.findOne({
    email,
    _id: { $ne: venueId },
  });
  if (emailTaken) return false;

  await ProspectedVenueModel.findByIdAndUpdate(venueId, {
    $set: { email, emailEnrichAttemptedAt: attemptedAt },
  });
  return true;
}

async function enrichMissingEmail(
  venue: ProspectedVenueDocument,
  website?: string | null
): Promise<string | null> {
  const targetWebsite = website ?? venue.website;
  if (!targetWebsite || venue.email) return venue.email ?? null;
  return guessEmailFromWebsite(targetWebsite);
}

async function mergeIntoExisting(
  existing: ProspectedVenueDocument,
  incoming: ProspectionSearchResult
): Promise<boolean> {
  const updates: Record<string, unknown> = {};
  let changed = false;

  if (!existing.phone && incoming.phone) {
    updates.phone = incoming.phone;
    changed = true;
  }

  if (!existing.website && incoming.website) {
    updates.website = incoming.website;
    changed = true;
  }

  const websiteForEnrichment = (incoming.website ?? existing.website) as string | undefined;
  if (!existing.email) {
    const email = incoming.email ?? await enrichMissingEmail(existing, websiteForEnrichment);
    if (email) {
      const assigned = await tryAssignEmail(existing._id.toString(), email);
      if (assigned) {
        updates.email = email;
        changed = true;
      }
    }
  }

  if (!changed) return false;

  await ProspectedVenueModel.findByIdAndUpdate(existing._id, { $set: updates });
  return true;
}

export async function upsertProspectedVenue(
  result: ProspectionSearchResult
): Promise<UpsertProspectedVenueResult> {
  const existing = await ProspectedVenueModel.findOne(buildDedupFilter(result));

  if (existing) {
    const merged = await mergeIntoExisting(existing, result);
    return merged ? 'merged' : 'duplicate';
  }

  let email = result.email ?? null;
  if (!email && result.website) {
    email = await guessEmailFromWebsite(result.website);
  }

  const doc: Record<string, unknown> = {
    name: result.name,
    type: result.type,
    address: result.address,
    source: result.source,
    emailStatus: 'non_envoye',
    emailHistory: [],
    optOut: false,
  };
  if (email) doc.email = email;
  if (result.phone) doc.phone = result.phone;
  if (result.website) doc.website = result.website;

  await ProspectedVenueModel.create(doc);
  return 'new';
}

function buildDepartmentFilter(departements: string[]): Record<string, unknown> {
  if (departements.length === 0) return {};
  return { 'address.departement': { $in: departements } };
}

interface VenueEmailLookupResult {
  email: string | null;
  websiteToSave: string | null;
  phoneToSave: string | null;
}

async function findEmailForVenue(venue: ProspectedVenueDocument): Promise<VenueEmailLookupResult> {
  if (venue.website) {
    const email = await guessEmailFromWebsite(venue.website);
    if (email) {
      return { email, websiteToSave: null, phoneToSave: null };
    }
  }

  const discovered = await discoverVenueContacts(
    venue.name,
    venue.address?.city,
    venue.type,
    venue.address?.departement
  );

  const websiteToSave = discovered.website && !venue.website ? discovered.website : null;
  const phoneToSave = discovered.phone && !venue.phone ? discovered.phone : null;
  const website = discovered.website ?? venue.website ?? null;

  if (!website) {
    return { email: null, websiteToSave, phoneToSave };
  }

  const email = await guessEmailFromWebsite(website);
  return { email, websiteToSave, phoneToSave };
}

/** Recherche d'emails pour les lieux sans email (site web optionnel en base). */
export async function enrichVenuesContacts(
  departements: string[] = [],
  options: EnrichVenuesContactsOptions = {}
): Promise<EnrichVenuesContactsResult> {
  const emailLimit = options.emailLimit ?? 80;
  const deptFilter = buildDepartmentFilter(departements);

  let websitesFound = 0;
  let emailsEnriched = 0;
  let phonesEnriched = 0;
  let venuesProcessed = 0;

  const withoutEmail = await ProspectedVenueModel.find({
    ...deptFilter,
    optOut: false,
    $or: [{ email: { $exists: false } }, { email: null }, { email: '' }],
  })
    .sort({ emailEnrichAttemptedAt: 1, updatedAt: -1 })
    .limit(emailLimit)
    .exec();

  for (const venue of withoutEmail) {
    venuesProcessed++;
    const attemptedAt = new Date();
    const { email, websiteToSave, phoneToSave } = await findEmailForVenue(venue);

    const sideUpdates: Record<string, string> = {};
    if (websiteToSave) {
      sideUpdates.website = websiteToSave;
      websitesFound++;
    }
    if (phoneToSave) {
      sideUpdates.phone = phoneToSave;
      phonesEnriched++;
    }

    if (email && await tryAssignEmail(venue._id.toString(), email, attemptedAt)) {
      emailsEnriched++;
      if (Object.keys(sideUpdates).length > 0) {
        await ProspectedVenueModel.findByIdAndUpdate(venue._id, { $set: sideUpdates });
      }
    } else {
      await ProspectedVenueModel.findByIdAndUpdate(venue._id, {
        $set: { emailEnrichAttemptedAt: attemptedAt, ...sideUpdates },
      });
    }

    await sleep(500);
  }

  return { websitesFound, emailsEnriched, phonesEnriched, venuesProcessed };
}

/** @deprecated Utiliser enrichVenuesContacts */
export async function enrichVenuesMissingEmail(limit = 50): Promise<number> {
  const result = await enrichVenuesContacts([], { emailLimit: limit });
  return result.emailsEnriched;
}
