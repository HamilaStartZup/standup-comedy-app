import { Request, Response } from 'express';
import { config } from '../config/env';
import { UserModel } from '../models/User';
import { ApplicationModel } from '../models/Application';
import { AbsenceModel } from '../models/Absence';
import { EventModel } from '../models/Event';
import { NotificationModel } from '../models/Notification';
import { PresenceAlertModel } from '../models/PresenceAlert';
import { ComedianReportModel } from '../models/ComedianReport';
import { PasswordResetRequestModel } from '../models/PasswordResetRequest';
import { VenueModel } from '../models/Venue';
import { VenueBookingModel } from '../models/VenueBooking';
import { VenueBlockedDateModel } from '../models/VenueBlockedDate';
import { SpectatorEventRatingModel } from '../models/SpectatorEventRating';
import { refundVenueBookings } from './venueBooking';

/**
 * Supprime un utilisateur et toutes ses données associées
 * Réutilisé par le cron job et potentiellement d'autres fonctions
 */
export async function deleteUserAndData(userId: string, userRole: string): Promise<{
  applications: number;
  absences: number;
  events: number;
  notifications: number;
  alerts: number;
  reports: number;
  passwordResets: number;
  ratings: number;
  venues: number;
  bookings: number;
  blockedDates: number;
}> {
  const stats = {
    applications: 0,
    absences: 0,
    events: 0,
    notifications: 0,
    alerts: 0,
    reports: 0,
    passwordResets: 0,
    ratings: 0,
    venues: 0,
    bookings: 0,
    blockedDates: 0,
  };

  if (userRole === 'COMEDIAN') {
    // Supprimer les candidatures de l'humoriste
    const deletedApplications = await ApplicationModel.deleteMany({ comedian: userId });
    stats.applications = deletedApplications.deletedCount;

    // Supprimer les absences liées à l'humoriste
    const deletedAbsences = await AbsenceModel.deleteMany({ comedian: userId });
    stats.absences = deletedAbsences.deletedCount;

    // Supprimer les alertes de présence
    const deletedAlerts = await PresenceAlertModel.deleteMany({ comedian: userId });
    stats.alerts = deletedAlerts.deletedCount;

    // Supprimer les signalements (faits par ou contre l'humoriste)
    const deletedReports = await ComedianReportModel.deleteMany({
      $or: [{ comedian: userId }, { reporter: userId }]
    });
    stats.reports = deletedReports.deletedCount;

    // Retirer l'humoriste des listes de favoris des organisateurs
    await UserModel.updateMany(
      { favoriteComedians: userId },
      { $pull: { favoriteComedians: userId } }
    );

    // Retirer l'humoriste des listes withdrawnComedians des événements
    await EventModel.updateMany(
      { withdrawnComedians: userId },
      { $pull: { withdrawnComedians: userId } }
    );

  } else if (userRole === 'ORGANIZER') {
    // Récupérer tous les événements de l'organisateur
    const organizerEvents = await EventModel.find({ organizer: userId }).select('_id');
    const eventIds = organizerEvents.map(e => e._id);

    // Supprimer les candidatures liées aux événements de l'organisateur
    const deletedApplications = await ApplicationModel.deleteMany({ event: { $in: eventIds } });
    stats.applications = deletedApplications.deletedCount;

    // Supprimer les absences liées aux événements de l'organisateur
    const deletedAbsences = await AbsenceModel.deleteMany({ event: { $in: eventIds } });
    stats.absences = deletedAbsences.deletedCount;

    // Supprimer les absences où l'organisateur est directement référencé (héritage du chemin admin)
    await AbsenceModel.deleteMany({ organizer: userId });

    // Supprimer les événements de l'organisateur
    const deletedEvents = await EventModel.deleteMany({ organizer: userId });
    stats.events = deletedEvents.deletedCount;
  } else if (userRole === 'SPECTATOR') {
    const deletedRatings = await SpectatorEventRatingModel.deleteMany({ spectator: userId });
    stats.ratings = deletedRatings.deletedCount;
  } else if (userRole === 'LIEU') {
    const ownedVenues = await VenueModel.find({ owner: userId }).select('_id');
    const venueIds = ownedVenues.map((v) => v._id);

    // Remboursements Stripe des bookings payés — ne supprime pas les documents
    for (const venueId of venueIds) {
      await refundVenueBookings(venueId.toString());
    }

    const deletedBookings = await VenueBookingModel.deleteMany({ venue: { $in: venueIds } });
    stats.bookings = deletedBookings.deletedCount;

    const deletedBlockedDates = await VenueBlockedDateModel.deleteMany({ venue: { $in: venueIds } });
    stats.blockedDates = deletedBlockedDates.deletedCount;

    const deletedVenues = await VenueModel.deleteMany({ owner: userId });
    stats.venues = deletedVenues.deletedCount;
  }

  // Supprimer les notifications de l'utilisateur (tous les rôles)
  const deletedNotifications = await NotificationModel.deleteMany({ user: userId });
  stats.notifications = deletedNotifications.deletedCount;

  // Supprimer les demandes de réinitialisation de mot de passe
  const deletedPasswordResets = await PasswordResetRequestModel.deleteMany({ userId: userId });
  stats.passwordResets = deletedPasswordResets.deletedCount;

  // Supprimer l'utilisateur
  await UserModel.findByIdAndDelete(userId);

  return stats;
}

/**
 * POST /api/users/jobs/cleanup-deactivated
 * Cron job pour supprimer les comptes désactivés depuis plus de 30 jours
 * Conformité RGPD - Limitation de la conservation des données
 */
export const cleanupDeactivatedAccountsCron = async (req: Request, res: Response): Promise<void> => {
  try {
    // --- SÉCURITÉ: Vérifier l'authentification du cron ---
    const cronKey = req.header('X-CRON-KEY');
    if (!cronKey || cronKey !== config.cron.secret) {
      console.error('❌ Tentative d\'accès non autorisée à l\'endpoint cron cleanup-deactivated');
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    console.log('🧹 [CRON] Démarrage du nettoyage des comptes désactivés...');

    // Calculer la date limite (30 jours avant maintenant)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Trouver les utilisateurs désactivés depuis plus de 30 jours
    // Note: isActive: false signifie que le compte est désactivé
    const usersToDelete = await UserModel.find({
      isActive: false,
      deactivatedAt: { $lte: thirtyDaysAgo }
    }).select('_id email role deactivatedAt');

    if (usersToDelete.length === 0) {
      console.log('✅ [CRON] Aucun compte désactivé à supprimer');
      res.json({
        message: 'Aucun compte désactivé à supprimer',
        deletedCount: 0,
        timestamp: new Date().toISOString()
      });
      return;
    }

    console.log(`📋 [CRON] ${usersToDelete.length} compte(s) à supprimer:`);

    let totalDeleted = 0;
    const deletedUsers: Array<{
      email: string;
      role: string;
      deactivatedAt: Date;
      stats: any;
    }> = [];

    for (const user of usersToDelete) {
      try {
        console.log(`  🗑️ Suppression de ${user.email} (${user.role}) - désactivé le ${user.deactivatedAt}`);

        const stats = await deleteUserAndData(user._id.toString(), user.role);

        deletedUsers.push({
          email: user.email,
          role: user.role,
          deactivatedAt: user.deactivatedAt!,
          stats
        });

        totalDeleted++;
        console.log(`    ✅ Compte supprimé avec succès`);
      } catch (error) {
        console.error(`    ❌ Erreur lors de la suppression de ${user.email}:`, error);
      }
    }

    console.log(`✅ [CRON] Nettoyage terminé: ${totalDeleted}/${usersToDelete.length} compte(s) supprimé(s)`);

    res.json({
      message: `${totalDeleted} compte(s) supprimé(s) avec succès`,
      deletedCount: totalDeleted,
      totalFound: usersToDelete.length,
      deletedUsers: deletedUsers.map(u => ({
        email: u.email,
        role: u.role,
        deactivatedAt: u.deactivatedAt
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ [CRON] Erreur lors du nettoyage des comptes désactivés:', error.message);
    res.status(500).json({
      message: 'Erreur lors du nettoyage des comptes désactivés',
      error: error.message
    });
  }
};
