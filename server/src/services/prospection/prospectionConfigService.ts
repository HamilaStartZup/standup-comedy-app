import { ProspectionConfigModel, type ProspectionConfigDocument } from '../../models/ProspectionConfig';
import { buildCronExpression } from '../../utils/prospectionHelpers';
import { config } from '../../config/env';

const DEFAULT_CONFIG = {
  mode: 'manuel' as const,
  cron: {
    expression: process.env.PROSPECTION_CRON_SCHEDULE || '0 9 * * 1,4',
    timezone: 'Europe/Paris',
    joursActifs: [1, 4],
    heureEnvoi: '09:00',
    prochainRun: null,
  },
  cibles: {
    departements: ['75', '78', '91', '92', '93', '94', '95', '77'],
    types: ['theatre', 'cinema', 'salle_spectacle', 'mjc', 'centre_culturel', 'centre_social'] as const,
  },
  envoi: {
    maxEmailsParRun: 50,
    delaiEntreEnvois: 3,
    dryRunParDefaut: false,
  },
  updatedBy: 'Système',
};

export async function ensureProspectionConfig(): Promise<ProspectionConfigDocument> {
  let doc = await ProspectionConfigModel.findOne();
  if (!doc) {
    const expression = buildCronExpression(
      DEFAULT_CONFIG.cron.joursActifs,
      DEFAULT_CONFIG.cron.heureEnvoi
    );
    doc = await ProspectionConfigModel.create({
      ...DEFAULT_CONFIG,
      cron: { ...DEFAULT_CONFIG.cron, expression },
    });
  }
  return doc;
}

export async function getProspectionConfig(): Promise<ProspectionConfigDocument> {
  return ensureProspectionConfig();
}

export async function patchProspectionConfig(
  patch: Partial<{
    mode: 'auto' | 'manuel';
    cron: Partial<ProspectionConfigDocument['cron']>;
    cibles: Partial<ProspectionConfigDocument['cibles']>;
    envoi: Partial<ProspectionConfigDocument['envoi']>;
    updatedBy: string;
  }>
): Promise<ProspectionConfigDocument> {
  const current = await ensureProspectionConfig();

  if (patch.mode !== undefined) current.mode = patch.mode;
  if (patch.cibles) {
    if (patch.cibles.departements !== undefined) current.cibles.departements = patch.cibles.departements;
    if (patch.cibles.types !== undefined) current.cibles.types = patch.cibles.types as typeof current.cibles.types;
  }
  if (patch.envoi) {
    if (patch.envoi.maxEmailsParRun !== undefined) current.envoi.maxEmailsParRun = patch.envoi.maxEmailsParRun;
    if (patch.envoi.delaiEntreEnvois !== undefined) current.envoi.delaiEntreEnvois = patch.envoi.delaiEntreEnvois;
    if (patch.envoi.dryRunParDefaut !== undefined) current.envoi.dryRunParDefaut = patch.envoi.dryRunParDefaut;
  }
  if (patch.cron) {
    if (patch.cron.joursActifs !== undefined) current.cron.joursActifs = patch.cron.joursActifs;
    if (patch.cron.heureEnvoi !== undefined) current.cron.heureEnvoi = patch.cron.heureEnvoi;
    if (patch.cron.timezone !== undefined) current.cron.timezone = patch.cron.timezone;
  }
  if (patch.updatedBy) current.updatedBy = patch.updatedBy;

  current.cron.expression = buildCronExpression(current.cron.joursActifs, current.cron.heureEnvoi);

  const next = new Date();
  next.setDate(next.getDate() + 1);
  const [h, m] = current.cron.heureEnvoi.split(':').map(Number);
  next.setHours(h, m, 0, 0);
  current.cron.prochainRun = next;

  await current.save();
  return current;
}

export function isEmailsDisabled(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.DISABLE_EMAILS === 'true';
}

export function getSendGridFrom(): string {
  return process.env.SENDGRID_FROM || config.email.smtpUser || 'contact@connectcomedyclub.com';
}
