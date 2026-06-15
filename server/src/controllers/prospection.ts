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
import { executeProspectionRun } from '../services/prospection/prospectionService';
import { rescheduleProspectionCron } from '../services/prospection/prospectionCronManager';
import { enrichVenuesContacts } from '../services/prospection/venueRepository';
import { validateProspectionUnsubscribeToken } from '../utils/prospectionHelpers';
import { FRENCH_DEPARTMENTS } from '../constants/frenchDepartments';

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

  const updated = await patchProspectionConfig({ ...req.body, updatedBy });
  await rescheduleProspectionCron();
  res.json({ config: updated });
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

export const listProspectedVenuesHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (req.query.departement) filter['address.departement'] = req.query.departement;
  if (req.query.type) filter.type = req.query.type;
  if (req.query.emailStatus) filter.emailStatus = req.query.emailStatus;
  if (req.query.search) {
    const q = String(req.query.search);
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { 'address.city': { $regex: q, $options: 'i' } },
    ];
  }

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

export const enrichProspectionVenuesHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  const limit = Math.min(Math.max(Number(req.body?.limit) || 30, 1), 100);
  const departements = Array.isArray(req.body?.departements)
    ? (req.body.departements as string[])
    : [];

  try {
    const result = await enrichVenuesContacts(departements, {
      discoverWebsites: true,
      websiteLimit: limit,
      emailLimit: limit,
    });
    res.json({
      message: `${result.websitesFound} site(s) trouvé(s), ${result.emailsEnriched} email(s) enrichi(s)`,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    res.status(500).json({ message });
  }
};

export const initProspectionModule = async (): Promise<void> => {
  await ensureProspectionConfig();
  await syncProspectedVenueIndexes();
  await rescheduleProspectionCron();
};
