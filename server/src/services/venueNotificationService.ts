/**
 * Service de notification pour les nouvelles salles
 * Envoie un email à tous les humoristes, organisateurs et lieux abonnés
 * lorsqu'une nouvelle salle est ajoutée sur la plateforme.
 */

import { sendNewVenueNotification } from './emailService';
import { UserModel } from '../models/User';
import { VenueDocument } from '../models/Venue';

/**
 * Notifie par email tous les utilisateurs (humoristes, organisateurs, lieux) abonnés
 * qu'une nouvelle salle vient d'être ajoutée sur la plateforme.
 *
 * @param venue - La salle nouvellement créée
 * @param ownerId - L'ID du propriétaire de la salle (exclu de la notification)
 * @returns Le nombre d'utilisateurs notifiés
 */
export const notifyUsersOfNewVenue = async (
  venue: VenueDocument,
  ownerId: string
): Promise<number> => {
  try {
    const owner = await UserModel.findById(ownerId).select('firstName lastName email').lean();

    const matchingUsers = await UserModel.find({
      role: { $in: ['COMEDIAN', 'ORGANIZER', 'LIEU'] },
      _id: { $ne: ownerId },
      'emailSubscriptions.globalSubscribed': { $ne: false }
    }).lean();

    if (matchingUsers.length === 0) {
      console.log('[VenueNotification] Aucun utilisateur abonné trouvé');
      return 0;
    }

    console.log(`[VenueNotification] ${matchingUsers.length} utilisateurs à notifier pour la nouvelle salle "${venue.name}"`);

    const emailResults = await Promise.allSettled(
      matchingUsers.map(user =>
        sendNewVenueNotification(
          user as any,
          venue,
          owner ? { firstName: owner.firstName, lastName: owner.lastName, email: owner.email } : undefined
        )
      )
    );

    const successCount = emailResults.filter(r => r.status === 'fulfilled').length;
    const failureCount = emailResults.filter(r => r.status === 'rejected').length;

    if (failureCount > 0) {
      console.warn(`[VenueNotification] ${failureCount} emails ont échoué sur ${matchingUsers.length}`);
    }

    console.log(`[VenueNotification] ${successCount} utilisateurs notifiés avec succès pour la salle "${venue.name}"`);

    return successCount;
  } catch (error) {
    console.error('[VenueNotification] Erreur lors de la notification:', error);
    throw error;
  }
};

/**
 * Version asynchrone qui ne bloque pas l'appelant
 * Utile pour appeler depuis un controller sans attendre la fin des envois
 *
 * @param venue - La salle nouvellement créée
 * @param ownerId - L'ID du propriétaire de la salle
 */
export const notifyUsersOfNewVenueAsync = (
  venue: VenueDocument,
  ownerId: string
): void => {
  notifyUsersOfNewVenue(venue, ownerId).catch(error => {
    console.error('[VenueNotification] Erreur asynchrone:', error);
  });
};
