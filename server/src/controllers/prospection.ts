import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { config } from '../config/env';
import { ProspectedVenueModel, syncProspectedVenueIndexes } from '../models/ProspectedVenue';
import { ProspectionRunModel } from '../models/ProspectionRun';
import {
  getProspectionConfig,
  patchProspectionConfig,
  ensureProspectionConfig,
} from '../services/prospection/prospectionConfigService';
import { executeProspectionRun, releaseStaleProspectionRuns, cancelProspectionRun } from '../services/prospection/prospectionService';
import { rescheduleProspectionCron } from '../services/prospection/prospectionCronManager';
import { enrichVenuesContacts, findExistingProspectedVenue, upsertProspectedVenue } from '../services/prospection/venueRepository';
import {
  isValidEmail,
  normalizePhoneFR,
  validateProspectionUnsubscribeToken,
  buildVenueDedupKey,
} from '../utils/prospectionHelpers';
import { FRENCH_DEPARTMENTS } from '../constants/frenchDepartments';
import { getDepartmentFromPostalCode } from '../utils/cityMapping';
import {
  PROSPECTED_VENUE_TYPES,
  type ProspectedEmailStatus,
  type ProspectedVenueType,
} from '../models/ProspectedVenue';

const EMAIL_STATUSES: ProspectedEmailStatus[] = [
  'non_envoye', 'a_contacter', 'envoye', 'echec', 'desinscrit', 'repondu',
];

const VENUE_TYPES = PROSPECTED_VENUE_TYPES;

function parseOptionalString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function buildVenuePayload(body: Record<string, unknown>) {
  const name = String(body.name ?? '').trim();
  if (!name) throw new Error('Le nom est requis');

  const type = String(body.type ?? '');
  if (!VENUE_TYPES.includes(type as ProspectedVenueType)) {
    throw new Error('Type de lieu invalide');
  }

  const email = parseOptionalString(body.email)?.toLowerCase() ?? null;
  if (email && !isValidEmail(email)) throw new Error('Email invalide');

  const phone = normalizePhoneFR(parseOptionalString(body.phone));
  const street = parseOptionalString(body.street) ?? undefined;
  const city = parseOptionalString(body.city) ?? undefined;
  const postalCode = parseOptionalString(body.postalCode) ?? undefined;
  const departementInput = parseOptionalString(body.departement) ?? '';
  const departement =
    (postalCode ? getDepartmentFromPostalCode(postalCode) : null) ?? (departementInput || undefined);
  const departementName = departement ? FRENCH_DEPARTMENTS[departement] : undefined;
  const website = parseOptionalString(body.website) ?? null;

  return {
    name,
    type: type as ProspectedVenueType,
    email,
    phone,
    website,
    address: {
      street,
      city,
      postalCode,
      departement,
      departementName,
    },
  };
}

async function assertEmailAvailable(email: string | null, excludeId?: string): Promise<void> {
  if (!email) return;
  const filter: Record<string, unknown> = { email };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await ProspectedVenueModel.findOne(filter);
  if (existing) throw new Error('Cet email est déjà utilisé par un autre lieu');
}

function assertSuperAdmin(req: AuthRequest, res: Response): boolean {
  if (req.user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ message: 'Accès refusé. Super-admins uniquement.' });
    return false;
  }
  return true;
}

export const getProspectionConfigHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;
  const doc = await getProspectionConfig();
  res.json({ config: doc, departments: FRENCH_DEPARTMENTS });
};

export const patchProspectionConfigHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;
  const updatedBy = 'Super Administrateur';

  try {
    const updated = await patchProspectionConfig({ ...req.body, updatedBy });
    await rescheduleProspectionCron();
    res.json({ config: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(400).json({ message });
  }
};

export const runProspectionHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  const isCron = req.headers['x-cron-key'] === config.cron.secret
    || req.headers.authorization === `Bearer ${config.cron.secret}`;

  if (!isCron && !assertSuperAdmin(req, res)) return;

  try {
    const runId = await executeProspectionRun({
      trigger: isCron ? 'cron' : 'manuel',
      departements: req.body?.departements,
      types: req.body?.types,
      maxEmails: req.body?.maxEmails,
      dryRun: req.body?.dryRun,
    });
    res.status(202).json({ runId, message: 'Prospection démarrée' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    const status = message.includes('déjà en cours') ? 409 : 500;
    res.status(status).json({ message });
  }
};

export const getProspectionRunHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;
  const run = await ProspectionRunModel.findById(req.params.id);
  if (!run) {
    res.status(404).json({ message: 'Run introuvable' });
    return;
  }
  res.json({ run });
};

export const listProspectionRunsHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const runs = await ProspectionRunModel.find().sort({ startedAt: -1 }).limit(limit);
  res.json({ runs });
};

export const clearProspectionRunsHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  const running = await ProspectionRunModel.countDocuments({ status: 'running' });
  if (running > 0) {
    res.status(409).json({ message: 'Impossible d’effacer l’historique pendant une prospection en cours.' });
    return;
  }

  const result = await ProspectionRunModel.deleteMany({});
  res.json({
    message: 'Historique des exécutions effacé.',
    deletedCount: result.deletedCount ?? 0,
  });
};

export const listProspectedVenuesHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const andClauses: Record<string, unknown>[] = [];

  if (req.query.departement) andClauses.push({ 'address.departement': req.query.departement });
  if (req.query.type) andClauses.push({ type: req.query.type });
  if (req.query.emailStatus) andClauses.push({ emailStatus: req.query.emailStatus });

  if (req.query.hasEmail === 'true') {
    andClauses.push({ email: { $type: 'string', $gt: '' } });
  } else if (req.query.hasEmail === 'false') {
    andClauses.push({
      $or: [{ email: { $exists: false } }, { email: null }, { email: '' }],
    });
  }

  if (req.query.hasPhone === 'true') {
    andClauses.push({ phone: { $type: 'string', $gt: '' } });
  } else if (req.query.hasPhone === 'false') {
    andClauses.push({
      $or: [{ phone: { $exists: false } }, { phone: null }, { phone: '' }],
    });
  }

  if (req.query.hasAnyContact === 'true') {
    andClauses.push({
      $or: [
        { email: { $type: 'string', $gt: '' } },
        { phone: { $type: 'string', $gt: '' } },
      ],
    });
  }

  if (req.query.search) {
    const q = String(req.query.search);
    andClauses.push({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { 'address.city': { $regex: q, $options: 'i' } },
      ],
    });
  }

  const filter: Record<string, unknown> =
    andClauses.length === 0
      ? {}
      : andClauses.length === 1
        ? andClauses[0]
        : { $and: andClauses };

  const [venues, total] = await Promise.all([
    ProspectedVenueModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    ProspectedVenueModel.countDocuments(filter),
  ]);

  res.json({
    venues,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
};

export const prospectionUnsubscribeHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  const { token, venueId, email } = req.query as { token?: string; venueId?: string; email?: string };
  if (!token || !venueId || !email) {
    res.status(400).send('Lien invalide');
    return;
  }

  if (!validateProspectionUnsubscribeToken(token, venueId, email)) {
    res.status(400).send('Lien invalide ou expiré');
    return;
  }

  await ProspectedVenueModel.findByIdAndUpdate(venueId, {
    $set: { optOut: true, emailStatus: 'desinscrit' },
  });

  res.send(`
    <!DOCTYPE html>
    <html lang="fr"><body style="font-family:sans-serif;text-align:center;padding:48px;">
      <h2>Désinscription confirmée</h2>
      <p>Vous ne recevrez plus d'emails de prospection de Connect Comedy Club.</p>
    </body></html>
  `);
};

export const createProspectedVenueHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  try {
    const payload = buildVenuePayload(req.body ?? {});
    const searchResult = { ...payload, source: 'manuel' as const };

    const status = await upsertProspectedVenue(searchResult);
    const venue = await findExistingProspectedVenue(searchResult);

    if (status === 'duplicate') {
      res.status(409).json({ message: 'Ce lieu existe déjà dans la base de prospection', venue });
      return;
    }

    if (status === 'merged') {
      res.status(200).json({ venue, message: 'Lieu existant complété avec les nouvelles informations' });
      return;
    }

    res.status(201).json({ venue });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    const status = message.includes('déjà utilisé') || message.includes('duplicate key') ? 409 : 400;
    res.status(status).json({ message });
  }
};

export const updateProspectedVenueHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  try {
    const payload = buildVenuePayload(req.body ?? {});
    await assertEmailAvailable(payload.email, req.params.id);

    const dedupKey = buildVenueDedupKey(payload.name, payload.address);
    if (dedupKey) {
      const conflict = await ProspectedVenueModel.findOne({
        dedupKey,
        _id: { $ne: req.params.id },
      });
      if (conflict) {
        res.status(409).json({ message: 'Un lieu identique existe déjà (même nom et localisation)' });
        return;
      }
    }

    const $set: Record<string, unknown> = {
      name: payload.name,
      type: payload.type,
      address: payload.address,
    };
    if (dedupKey) $set.dedupKey = dedupKey;
    const $unset: Record<string, string> = {};

    if (payload.email) $set.email = payload.email;
    else $unset.email = '';

    if (payload.phone) $set.phone = payload.phone;
    else $unset.phone = '';

    if (payload.website) $set.website = payload.website;
    else $unset.website = '';

    if (req.body.emailStatus !== undefined) {
      const status = String(req.body.emailStatus) as ProspectedEmailStatus;
      if (!EMAIL_STATUSES.includes(status)) {
        res.status(400).json({ message: 'Statut email invalide' });
        return;
      }
      $set.emailStatus = status;
      $set.optOut = status === 'desinscrit';
    }

    const venue = await ProspectedVenueModel.findByIdAndUpdate(
      req.params.id,
      { $set, ...(Object.keys($unset).length > 0 ? { $unset } : {}) },
      { new: true, runValidators: true }
    );

    if (!venue) {
      res.status(404).json({ message: 'Lieu introuvable' });
      return;
    }

    res.json({ venue });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    const status = message.includes('déjà utilisé') ? 409 : 400;
    res.status(status).json({ message });
  }
};

export const deleteProspectedVenueHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  const result = await ProspectedVenueModel.findByIdAndDelete(req.params.id);
  if (!result) {
    res.status(404).json({ message: 'Lieu introuvable' });
    return;
  }

  res.json({ message: 'Lieu supprimé' });
};

export const enrichProspectionVenuesHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  const limit = Math.min(Math.max(Number(req.body?.limit) || 5, 1), 100);
  const departements = Array.isArray(req.body?.departements)
    ? (req.body.departements as string[])
    : [];

  try {
    console.log(
      `📧 Recherche emails — départements: ${departements.length ? departements.join(', ') : 'tous'}, limite: ${limit}`
    );
    const result = await enrichVenuesContacts(departements, { emailLimit: limit });
    const message =
      result.venuesProcessed === 0
        ? 'Aucun lieu sans email dans ce périmètre.'
        : `${result.venuesProcessed} lieu(x) analysé(s), ${result.emailsEnriched} email(s) trouvé(s).`;
    console.log(`📧 Recherche emails terminée — ${message}`);
    res.json({
      message,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ message });
  }
};

export const cancelProspectionRunHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  const cancelled = await cancelProspectionRun(req.params.id);
  if (!cancelled) {
    res.status(404).json({ message: 'Exécution introuvable ou déjà terminée' });
    return;
  }

  res.json({ message: 'Prospection interrompue' });
};

export const initProspectionModule = async (): Promise<void> => {
  await ensureProspectionConfig();
  await syncProspectedVenueIndexes();
  const released = await releaseStaleProspectionRuns({ onStartup: true });
  if (released > 0) {
    console.log(`📧 ${released} exécution(s) de prospection interrompue(s) au démarrage`);
  }
  await rescheduleProspectionCron();
};
