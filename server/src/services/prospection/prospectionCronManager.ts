import cron, { type ScheduledTask } from 'node-cron';
import { config } from '../../config/env';
import { getProspectionConfig } from './prospectionConfigService';
import { executeProspectionRun } from './prospectionService';
import { sendProspectionFollowUpBatch } from './emailProspectionService';

let currentTask: ScheduledTask | null = null;
let followUpTask: ScheduledTask | null = null;

export async function rescheduleProspectionCron(): Promise<void> {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  if (followUpTask) {
    followUpTask.stop();
    followUpTask = null;
  }

  if (!config.cron.enabled) {
    console.log('⏸️ Cron prospection désactivé (ENABLE_CRONS=false)');
    return;
  }

  const prospectionConfig = await getProspectionConfig();
  if (prospectionConfig.mode !== 'auto') {
    console.log('⏸️ Cron prospection en pause (mode manuel)');
    return;
  }

  const expression = prospectionConfig.cron.expression;
  if (!cron.validate(expression)) {
    console.error(`❌ Expression cron prospection invalide: ${expression}`);
    return;
  }

  currentTask = cron.schedule(
    expression,
    async () => {
      try {
        const fresh = await getProspectionConfig();
        if (fresh.mode !== 'auto') return;
        if (fresh.envoi.dryRunParDefaut) {
          console.log('🔍 Prospection cron — dry run global, exécution sans envoi');
        }
        await executeProspectionRun({ trigger: 'cron', dryRun: fresh.envoi.dryRunParDefaut });
      } catch (err) {
        console.error('❌ Erreur cron prospection:', err);
      }
    },
    { timezone: prospectionConfig.cron.timezone }
  );

  console.log(`✅ Cron prospection planifié: ${expression} (${prospectionConfig.cron.timezone})`);

  // Relance J+3: vérifie chaque heure les contacts envoyés il y a >= 72h
  followUpTask = cron.schedule(
    '0 * * * *',
    async () => {
      try {
        const fresh = await getProspectionConfig();
        if (fresh.mode !== 'auto') return;
        if (!fresh.envoi.relance72hActive) return;

        const stats = await sendProspectionFollowUpBatch(fresh.envoi.delaiEntreEnvois);
        if (stats.followUpsSent > 0 || stats.followUpsFailed > 0) {
          console.log(
            `📨 Relances prospection 72h — envoyées: ${stats.followUpsSent}, échecs: ${stats.followUpsFailed}`
          );
        }
      } catch (err) {
        console.error('❌ Erreur cron relance prospection 72h:', err);
      }
    },
    { timezone: prospectionConfig.cron.timezone }
  );
  console.log(`✅ Cron relance prospection planifié: 0 * * * * (${prospectionConfig.cron.timezone})`);
}

export function stopProspectionCron(): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  if (followUpTask) {
    followUpTask.stop();
    followUpTask = null;
  }
}
