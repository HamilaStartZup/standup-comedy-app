import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { PresenceAlertModel } from '../models/PresenceAlert';
import { checkAndCreatePresenceAlerts, calculatePresenceScore } from '../services/presenceAlertService';
import { emitPresenceAlertAcknowledged } from '../services/eventEmitter';
import { getSuperAdminIds } from '../utils/superAdminCache';
import Logger from '../utils/logger';

/**
 * GET /api/presence-alerts
 * Récupère toutes les alertes de présence active (Super Admin uniquement)
 */
export const getPresenceAlerts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès refusé. Seuls les super-admins peuvent accéder à cette ressource.' });
      return;
    }

    const alerts = await PresenceAlertModel.find({ isActive: true })
      .populate('comedian', 'firstName lastName email')
      .populate('acknowledgedBy', 'firstName lastName email')
      .sort({ alertSentAt: -1 });

    res.status(200).json({
      alerts,
      count: alerts.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des alertes:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des alertes' });
  }
};

/**
 * GET /api/presence-alerts/:comedianId
 * Récupère le score de présence d'un humoriste spécifique (Super Admin uniquement)
 */
export const getComedianPresenceScore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès refusé. Seuls les super-admins peuvent accéder à cette ressource.' });
      return;
    }

    const { comedianId } = req.params;
    const result = await calculatePresenceScore(comedianId);

    if (!result) {
      res.status(404).json({ message: 'Score de présence non disponible (pas assez de données)' });
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Erreur lors de la récupération du score de présence:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du score de présence' });
  }
};

/**
 * POST /api/presence-alerts/:alertId/acknowledge
 * Marque une alerte comme prise en compte (Super Admin uniquement)
 */
export const acknowledgePresenceAlert = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès refusé. Seuls les super-admins peuvent accéder à cette ressource.' });
      return;
    }

    const { alertId } = req.params;
    const alert = await PresenceAlertModel.findById(alertId);

    if (!alert) {
      res.status(404).json({ message: 'Alerte non trouvée' });
      return;
    }

    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = req.user.id as any;
    await alert.save();

    getSuperAdminIds().then(adminIds => {
      if (adminIds.length > 0) emitPresenceAlertAcknowledged(alertId, adminIds);
    }).catch(err => Logger.error('Erreur alerte superAdmin', { err: String(err) }));

    res.status(200).json({
      message: 'Alerte marquée comme prise en compte',
      alert
    });
  } catch (error) {
    console.error('Erreur lors de la prise en compte de l\'alerte:', error);
    res.status(500).json({ message: 'Erreur lors de la prise en compte de l\'alerte' });
  }
};

/**
 * POST /api/presence-alerts/check
 * Déclenche manuellement la vérification des scores de présence (Super Admin uniquement)
 */
export const triggerPresenceCheck = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès refusé. Seuls les super-admins peuvent accéder à cette ressource.' });
      return;
    }

    const alertsCreated = await checkAndCreatePresenceAlerts();

    res.status(200).json({
      message: `Vérification terminée. ${alertsCreated} nouvelle(s) alerte(s) créée(s).`
    });
  } catch (error) {
    console.error('Erreur lors de la vérification des scores de présence:', error);
    res.status(500).json({ message: 'Erreur lors de la vérification des scores de présence' });
  }
};

/**
 * POST /api/presence-alerts/jobs/check
 * Endpoint pour le cron job (protégé par CRON_SECRET)
 */
export const cronCheckPresenceAlerts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Vérifier le secret du cron
    const cronSecret = req.headers['x-cron-key'];
    const { config } = await import('../config/env');
    
    if (cronSecret !== config.cron.secret) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    console.log('🔄 Déclenchement automatique de la vérification des scores de présence...');
    const alertsCreated = await checkAndCreatePresenceAlerts();

    res.status(200).json({
      message: `Vérification automatique terminée. ${alertsCreated} nouvelle(s) alerte(s) créée(s).`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erreur lors de la vérification automatique:', error);
    res.status(500).json({ message: 'Erreur lors de la vérification automatique' });
  }
};

