import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { NotificationModel, NotificationDocument } from '../models/Notification';
import { Types } from 'mongoose';

/**
 * GET /api/notifications
 * Récupérer toutes les notifications de l'utilisateur connecté
 */
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    const { read, limit } = req.query;
    const query: any = { user: userId };

    // Filtrer par statut de lecture si fourni
    if (read !== undefined) {
      query.read = read === 'true';
    }

    const notifications = await NotificationModel.find(query)
      .populate('relatedEvent', 'title date')
      .populate('relatedApplication', 'status')
      .populate('relatedUser', 'firstName lastName')
      .populate('relatedVenue', 'name')
      .sort({ createdAt: -1 })
      .limit(limit ? (isNaN(parseInt(limit as string, 10)) ? 50 : Math.max(1, parseInt(limit as string, 10))) : 50);

    const unreadCount = await NotificationModel.countDocuments({ user: userId, read: false });

    res.status(200).json({
      notifications,
      unreadCount,
      total: notifications.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des notifications:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des notifications' });
  }
};

/**
 * PATCH /api/notifications/:notificationId/read
 * Marquer une notification comme lue
 */
export const markNotificationAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { notificationId } = req.params;

    if (!userId) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    const notification = await NotificationModel.findById(notificationId);

    if (!notification) {
      res.status(404).json({ message: 'Notification non trouvée' });
      return;
    }

    // Vérifier que la notification appartient à l'utilisateur
    if (notification.user.toString() !== userId) {
      res.status(403).json({ message: 'Accès refusé' });
      return;
    }

    notification.read = true;
    notification.readAt = new Date();
    await notification.save();

    res.status(200).json({
      message: 'Notification marquée comme lue',
      notification
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la notification:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la notification' });
  }
};

/**
 * PATCH /api/notifications/read-all
 * Marquer toutes les notifications comme lues
 */
export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    const result = await NotificationModel.updateMany(
      { user: userId, read: false },
      { read: true, readAt: new Date() }
    );

    res.status(200).json({
      message: 'Toutes les notifications ont été marquées comme lues',
      updatedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des notifications:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour des notifications' });
  }
};

/**
 * DELETE /api/notifications/:notificationId
 * Supprimer une notification
 */
export const deleteNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { notificationId } = req.params;

    if (!userId) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    const notification = await NotificationModel.findById(notificationId);

    if (!notification) {
      res.status(404).json({ message: 'Notification non trouvée' });
      return;
    }

    // Vérifier que la notification appartient à l'utilisateur
    if (notification.user.toString() !== userId) {
      res.status(403).json({ message: 'Accès refusé' });
      return;
    }

    await notification.deleteOne();

    res.status(204).send();
  } catch (error) {
    console.error('Erreur lors de la suppression de la notification:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de la notification' });
  }
};

/**
 * Fonction utilitaire pour créer une notification
 */
export const createNotification = async (
  userId: string,
  type: NotificationDocument['type'],
  title: string,
  message: string,
  relatedEventId?: string,
  relatedApplicationId?: string,
  relatedUserId?: string,
  relatedVenueId?: string
): Promise<void> => {
  try {
    await NotificationModel.create({
      user: new Types.ObjectId(userId),
      type,
      title,
      message,
      relatedEvent: relatedEventId ? new Types.ObjectId(relatedEventId) : undefined,
      relatedApplication: relatedApplicationId ? new Types.ObjectId(relatedApplicationId) : undefined,
      relatedUser: relatedUserId ? new Types.ObjectId(relatedUserId) : undefined,
      relatedVenue: relatedVenueId ? new Types.ObjectId(relatedVenueId) : undefined,
      read: false
    });
  } catch (error) {
    console.error('Erreur lors de la création de la notification:', { userId, type }, error);
    // Ne pas faire échouer l'opération principale si la notification échoue
  }
};

