// Charger les variables d'environnement AVANT tout le reste
import dotenv from 'dotenv';
dotenv.config();

import { config, validateConfig } from './config/env';
import { connectDatabase } from './config/database';
import { initializeCronJobs, stopCronJobs } from './services/cronScheduler';
import { app } from './app';
import { sseManager } from './services/sseManager';

const startServer = async () => {
  try {
    validateConfig();
    await connectDatabase();
    initializeCronJobs();

    const server = app.listen(config.port, () => {
      console.log(`🚀 Serveur démarré sur le port ${config.port} en mode ${config.nodeEnv}`);
      console.log(`📊 Niveau de log: ${config.logLevel}`);
      console.log(`🌐 CORS origin: ${config.cors.origin}`);
    });

    process.on('SIGTERM', () => {
      console.log('\n⏹️ Signal SIGTERM reçu, arrêt du serveur...');
      stopCronJobs();
      sseManager.shutdown();
      server.close(() => {
        console.log('✅ Serveur arrêté');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\n⏹️ Signal SIGINT reçu, arrêt du serveur...');
      stopCronJobs();
      sseManager.shutdown();
      server.close(() => {
        console.log('✅ Serveur arrêté');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('❌ Échec du démarrage du serveur:', error);
    process.exit(1);
  }
};

startServer();
