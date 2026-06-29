import { ProspectionRunModel } from '../../models/ProspectionRun';
import type { ProspectedVenueType } from '../../models/ProspectedVenue';
import { getProspectionConfig } from './prospectionConfigService';
import { searchProspectionTargets } from './searchService';
import { sendProspectionBatch } from './emailProspectionService';

export interface RunProspectionOptions {
  trigger: 'manuel' | 'cron';
  departements?: string[];
  types?: ProspectedVenueType[];
  maxEmails?: number;
  dryRun?: boolean;
}

export async function hasRunningProspectionRun(): Promise<boolean> {
  const running = await ProspectionRunModel.findOne({ status: 'running' });
  return !!running;
}

export async function executeProspectionRun(options: RunProspectionOptions): Promise<string> {
  if (await hasRunningProspectionRun()) {
    throw new Error('Une prospection est déjà en cours');
  }

  const config = await getProspectionConfig();
  const departements = options.departements ?? config.cibles.departements;
  const types = (options.types ?? config.cibles.types) as ProspectedVenueType[];
  const maxEmails = options.maxEmails ?? config.envoi.maxEmailsParRun;
  const dryRun = options.dryRun ?? (options.trigger === 'cron' ? config.envoi.dryRunParDefaut : false);

  const run = await ProspectionRunModel.create({
    trigger: options.trigger,
    filtres: { departements, types, maxEmails, dryRun },
    stats: { found: 0, new: 0, merged: 0, duplicates: 0, websitesFound: 0, emailsEnriched: 0, emailsSent: 0, emailsFailed: 0 },
    status: 'running',
  });

  setImmediate(async () => {
    try {
      const searchStats = await searchProspectionTargets(departements, types);
      const emailStats = await sendProspectionBatch(
        departements,
        types,
        maxEmails,
        dryRun,
        config.envoi.delaiEntreEnvois
      );

      await ProspectionRunModel.findByIdAndUpdate(run._id, {
        $set: {
          status: 'done',
          finishedAt: new Date(),
          stats: {
            found: searchStats.found,
            new: searchStats.new,
            merged: searchStats.merged,
            duplicates: searchStats.duplicates,
            websitesFound: searchStats.websitesFound,
            emailsEnriched: searchStats.emailsEnriched,
            emailsSent: emailStats.emailsSent,
            emailsFailed: emailStats.emailsFailed,
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      await ProspectionRunModel.findByIdAndUpdate(run._id, {
        $set: { status: 'error', finishedAt: new Date(), error: message },
      });
    }
  });

  return run._id.toString();
}
