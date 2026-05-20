import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  getActiveLateCancellationAlerts,
  acknowledgeLateCancellationAlert,
  getComedianLateCancellationHistory
} from '../services/lateCancellationAlertService';
import { emitLateCancellationAlertAcknowledged } from '../services/eventEmitter';
import { UserModel } from '../models/User';

const getSuperAdminIds = async (): Promise<string[]> => {
  const admins = await UserModel.find({ role: 'SUPER_ADMIN', isActive: true })
    .select('_id')
    .lean();
  return admins.map(a => (a._id as any).toString());
};

/**
 * GET /api/late-cancellation-alerts
 * Récupérer la liste des alertes d'annulation tardive (Super Admin)
 */
export const getLateCancellationAlerts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    // Vérifier que l'utilisateur est un Super Admin
    if (userRole !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès réservé aux Super Admin' });
      return;
    }

    const { isActive } = req.query;

    let alerts;
    if (isActive === 'true') {
      alerts = await getActiveLateCancellationAlerts();
    } else {
      // Récupérer toutes les alertes
      const { LateCancellationAlertModel } = await import('../models/LateCancellationAlert');
      alerts = await LateCancellationAlertModel.find()
        .populate('comedian', 'firstName lastName email')
        .populate('event', 'title date location')
        .populate('acknowledgedBy', 'firstName lastName')
        .sort({ alertSentAt: -1 });
    }

    res.status(200).json({
      alerts,
      total: alerts.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des alertes d\'annulation tardive:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des alertes' });
  }
};

/**
 * POST /api/late-cancellation-alerts/:alertId/acknowledge
 * Acquitter une alerte d'annulation tardive (Super Admin)
 */
export const acknowledgeAlert = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { alertId } = req.params;

    if (!userId) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    // Vérifier que l'utilisateur est un Super Admin
    if (userRole !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès réservé aux Super Admin' });
      return;
    }

    const success = await acknowledgeLateCancellationAlert(alertId, userId);

    if (!success) {
      res.status(404).json({ message: 'Alerte non trouvée' });
      return;
    }

    getSuperAdminIds().then(adminIds => {
      if (adminIds.length > 0) emitLateCancellationAlertAcknowledged(alertId, adminIds);
    }).catch(() => {});

    res.status(200).json({
      message: 'Alerte acquittée avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de l\'acquittement de l\'alerte:', error);
    res.status(500).json({ message: 'Erreur lors de l\'acquittement de l\'alerte' });
  }
};

/**
 * GET /api/late-cancellation-alerts/comedian/:comedianId
 * Récupérer l'historique des annulations tardives d'un humoriste (Super Admin)
 */
export const getComedianHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { comedianId } = req.params;

    if (!userId) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    // Vérifier que l'utilisateur est un Super Admin
    if (userRole !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès réservé aux Super Admin' });
      return;
    }

    const history = await getComedianLateCancellationHistory(comedianId);

    res.status(200).json({
      history,
      total: history.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique' });
  }
};
