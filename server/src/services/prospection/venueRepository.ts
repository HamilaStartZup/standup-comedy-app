import { ProspectedVenueModel, type ProspectedVenueDocument } from '../../models/ProspectedVenue';
import {
  buildVenueDedupKey,
  normalizePhoneFR,
  normalizeVenueLabel,
  normalizeWebsiteHost,
  sleep,
  venueAddressesMatch,
} from '../../utils/prospectionHelpers';
import type { ProspectionSearchResult } from './types';
import { guessEmailFromWebsite } from './venueEnrichment';
import { discoverWebsiteFromWeb } from './websiteDiscoveryService';

export type UpsertProspectedVenueResult = 'new' | 'merged' | 'duplicate';

export interface EnrichVenuesContactsResult {
  websitesFound: number;
  emailsEnriched: number;
}

export interface EnrichVenuesContactsOptions {
  websiteLimit?: number;
  emailLimit?: number;
  discoverWebsites?: boolean;
}

async function tryAssignEmail(venueId: string, email: string): Promise<boolean> {
  const emailTaken = await ProspectedVenueModel.findOne({
    email,
    _id: { $ne: venueId },
  });
  if (emailTaken) return false;

  await ProspectedVenueModel.findByIdAndUpdate(venueId, { $set: { email } });
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

  const dedupKey = buildVenueDedupKey(incoming.name, incoming.address);
  if (dedupKey && existing.dedupKey !== dedupKey) {
    updates.dedupKey = dedupKey;
    changed = true;
  }

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

/** Recherche un lieu existant (email, téléphone, site, clé normalisée ou nom+ville). */
export async function findExistingProspectedVenue(
  result: ProspectionSearchResult
): Promise<ProspectedVenueDocument | null> {
  const email = result.email?.toLowerCase().trim();
  if (email) {
    const byEmail = await ProspectedVenueModel.findOne({ email });
    if (byEmail) return byEmail;
  }

  const phone = normalizePhoneFR(result.phone);
  if (phone) {
    const byPhone = await ProspectedVenueModel.findOne({ phone });
    if (byPhone) return byPhone;
  }

  const websiteHost = normalizeWebsiteHost(result.website);
  if (websiteHost) {
    const withWebsite = await ProspectedVenueModel.find({
      website: { $type: 'string', $gt: '' },
    })
      .limit(2000)
      .exec();
    const byWebsite = withWebsite.find(
      (venue) => normalizeWebsiteHost(venue.website) === websiteHost
    );
    if (byWebsite) return byWebsite;
  }

  const dedupKey = buildVenueDedupKey(result.name, result.address);
  if (dedupKey) {
    const byKey = await ProspectedVenueModel.findOne({ dedupKey });
    if (byKey) return byKey;
  }

  const normalizedName = normalizeVenueLabel(result.name);
  const dept = result.address.departement ?? '';
  if (!normalizedName) return null;

  const candidateFilter: Record<string, unknown> = {};
  if (dept) candidateFilter['address.departement'] = dept;

  const candidates = await ProspectedVenueModel.find(candidateFilter).limit(1000).exec();
  return (
    candidates.find(
      (venue) =>
        normalizeVenueLabel(venue.name) === normalizedName &&
        venueAddressesMatch(venue.address ?? {}, result.address)
    ) ?? null
  );
}

export async function upsertProspectedVenue(
  result: ProspectionSearchResult
): Promise<UpsertProspectedVenueResult> {
  const existing = await findExistingProspectedVenue(result);

  if (existing) {
    const merged = await mergeIntoExisting(existing, result);
    return merged ? 'merged' : 'duplicate';
  }

  let email = result.email ?? null;
  if (!email && result.website) {
    email = await guessEmailFromWebsite(result.website);
  }

  const dedupKey = buildVenueDedupKey(result.name, result.address);

  const doc: Record<string, unknown> = {
    name: result.name,
    type: result.type,
    address: result.address,
    source: result.source,
    emailStatus: 'non_envoye',
    emailHistory: [],
    optOut: false,
  };
  if (dedupKey) doc.dedupKey = dedupKey;
  if (email) doc.email = email;
  if (result.phone) doc.phone = normalizePhoneFR(result.phone) ?? result.phone;
  if (result.website) doc.website = result.website;

  await ProspectedVenueModel.create(doc);
  return 'new';
}

function buildDepartmentFilter(departements: string[]): Record<string, unknown> {
  if (departements.length === 0) return {};
  return { 'address.departement': { $in: departements } };
}

/** Recherche des sites web (web) puis extraction d'emails depuis les pages contact. */
export async function enrichVenuesContacts(
  departements: string[] = [],
  options: EnrichVenuesContactsOptions = {}
): Promise<EnrichVenuesContactsResult> {
  const discoverWebsites = options.discoverWebsites ?? true;
  const websiteLimit = options.websiteLimit ?? 40;
  const emailLimit = options.emailLimit ?? 80;
  const deptFilter = buildDepartmentFilter(departements);

  let websitesFound = 0;
  let emailsEnriched = 0;

  if (discoverWebsites) {
    const withoutWebsite = await ProspectedVenueModel.find({
      ...deptFilter,
      optOut: false,
      $or: [{ website: { $exists: false } }, { website: null }, { website: '' }],
    })
      .sort({ updatedAt: -1 })
      .limit(websiteLimit)
      .exec();

    for (const venue of withoutWebsite) {
      const website = await discoverWebsiteFromWeb(venue.name, venue.address?.city, venue.type);
      await sleep(1000);
      if (!website) continue;

      await ProspectedVenueModel.findByIdAndUpdate(venue._id, { $set: { website } });
      websitesFound++;

      if (!venue.email) {
        const email = await guessEmailFromWebsite(website);
        if (email && await tryAssignEmail(venue._id.toString(), email)) {
          emailsEnriched++;
        }
      }
    }
  }

  const withoutEmail = await ProspectedVenueModel.find({
    ...deptFilter,
    optOut: false,
    website: { $type: 'string', $gt: '' },
    $or: [{ email: { $exists: false } }, { email: null }, { email: '' }],
  })
    .sort({ updatedAt: -1 })
    .limit(emailLimit)
    .exec();

  for (const venue of withoutEmail) {
    if (!venue.website) continue;
    const email = await guessEmailFromWebsite(venue.website);
    if (email && await tryAssignEmail(venue._id.toString(), email)) {
      emailsEnriched++;
    }
    await sleep(300);
  }

  return { websitesFound, emailsEnriched };
}

/** @deprecated Utiliser enrichVenuesContacts */
export async function enrichVenuesMissingEmail(limit = 50): Promise<number> {
  const result = await enrichVenuesContacts([], {
    discoverWebsites: false,
    emailLimit: limit,
    websiteLimit: 0,
  });
  return result.emailsEnriched;
}
