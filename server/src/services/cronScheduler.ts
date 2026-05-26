import cron from 'node-cron';
import { config } from '../config/env';
import axios from 'axios';

// Type pour les jobs cron
interface CronJob {
  name: string;
  schedule: string;
  endpoint: string;
  enabled: boolean;
}

/**
 * Service de scheduling automatique des cron jobs
 * Utilise node-cron pour déclencher les jobs à intervalles réguliers
 */

// Configuration des crons en fonction de l'environnement
const cronJobs: CronJob[] = [
  {
    name: 'Rappels aux comédiens',
    schedule: config.cron.comedianReminderSchedule,
    endpoint: '/api/email/jobs/reminders',
    enabled: config.cron.enabled
  },
  {
    name: 'Relances aux organisateurs',
    schedule: config.cron.organizerReminderSchedule,
    endpoint: '/api/email/jobs/organizer-reminders',
    enabled: config.cron.enabled
  },
  {
    name: 'Relances humoristes (événements incomplets J-2 et J-1)',
    schedule: config.cron.organizerReminderSchedule,
    endpoint: '/api/email/jobs/incomplete-event-reminders',
    enabled: config.cron.enabled
  },
  {
    name: 'Marquage évènements terminés',
    schedule: config.cron.markCompletedSchedule,
    endpoint: '/api/events/jobs/mark-completed',
    enabled: config.cron.enabled
  },
  {
    name: 'Vérification scores de présence',
    schedule: config.cron.presenceAlertSchedule,
    endpoint: '/api/presence-alerts/jobs/check',
    enabled: config.cron.enabled
  },
  {
    name: 'Nettoyage comptes désactivés (RGPD 30j)',
    schedule: config.cron.accountCleanupSchedule,
    endpoint: '/api/users/jobs/cleanup-deactivated',
    enabled: config.cron.enabled
  },
  {
    name: 'Récap quotidien spectateurs (événements dans le rayon)',
    schedule: config.cron.dailySpectatorRecapSchedule,
    endpoint: '/api/email/jobs/daily-spectator-recap',
    enabled: config.cron.enabled
  },
  {
    name: 'Expiration réservations impayées (72h)',
    schedule: config.cron.paymentTimeoutSchedule,
    endpoint: '/api/venues/jobs/check-payment-timeouts',
    enabled: config.cron.enabled
  }
];

/**
 * Initialise les cron jobs
 * À appeler au démarrage du serveur
 *
 * Comportement:
 * 1. Exécute immédiatement chaque cron job
 * 2. Puis les planifie pour s'exécuter à intervalles réguliers
 */
export const initializeCronJobs = (): void => {
  console.log('🔔 Initialisation des cron jobs...\n');

  cronJobs.forEach((job) => {
    if (!job.enabled) {
      console.log(`⏸️ Cron "${job.name}" désactivé`);
      return;
    }

    try {
      // 1️⃣ Exécution immédiate au démarrage
      console.log(`⚡ Exécution immédiate du cron: ${job.name}`);
      triggerCronJob(job).catch(error => {
        console.error(`❌ Erreur lors de l'exécution immédiate de "${job.name}":`, error);
      });

      // 2️⃣ Planification des exécutions futures
      cron.schedule(job.schedule, async () => {
        await triggerCronJob(job);
      });

      console.log(`✅ Cron "${job.name}" activé - Prochaine exécution: ${job.schedule}\n`);
    } catch (error) {
      console.error(`❌ Erreur lors de l'activation du cron "${job.name}":`, error);
    }
  });

  console.log('✅ Cron jobs initialisés avec succès\n');
};

/**
 * Déclenche un cron job en faisant une requête HTTP vers l'endpoint
 */
async function triggerCronJob(job: CronJob): Promise<void> {
  try {
    const baseUrl = `http://localhost:${config.port}`;
    const url = `${baseUrl}${job.endpoint}`;

    console.log(`📧 Exécution du cron: ${job.name} (${new Date().toISOString()})`);

    const response = await axios.post(url, {}, {
      headers: {
        'X-CRON-KEY': config.cron.secret,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 secondes
    });

    console.log(`✅ ${job.name} - Résultat:`, response.data);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`❌ Erreur lors de l'exécution du cron "${job.name}":`, error.message);
    } else {
      console.error(`❌ Erreur lors de l'exécution du cron "${job.name}":`, error);
    }
  }
}

/**
 * Arrête tous les cron jobs
 * À appeler lors de l'arrêt du serveur
 */
export const stopCronJobs = (): void => {
  cron.getTasks().forEach(task => {
    task.stop();
  });
  console.log('⏹️ Tous les cron jobs ont été arrêtés');
};

export default {
  initializeCronJobs,
  stopCronJobs
};
