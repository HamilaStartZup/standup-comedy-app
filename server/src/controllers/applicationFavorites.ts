import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { UserModel } from '../models/User';
import { ApplicationModel } from '../models/Application';
import { EventModel } from '../models/Event';
import { Types } from 'mongoose';
import { emitApplicationFavoriteAdded, emitApplicationFavoriteRemoved } from '../services/eventEmitter';

/**
 * Ajoute une candidature aux favoris de l'organisateur
 */
export const addApplicationFavorite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.body;
    const organizerId = req.user?.id;

    if (!organizerId) {
      res.status(401).json({
        message: 'Non autorisé'
      });
      return;
    }

    // Valider l'ID de la candidature
    if (!applicationId || !Types.ObjectId.isValid(applicationId)) {
      res.status(400).json({
        message: 'ID de candidature invalide'
      });
      return;
    }

    const applicationObjectId = new Types.ObjectId(applicationId);
    const organizerObjectId = new Types.ObjectId(organizerId);

    // Vérifier que l'organisateur existe et est bien un ORGANIZER
    const organizer = await UserModel.findById(organizerObjectId);
    if (!organizer || organizer.role !== 'ORGANIZER') {
      res.status(403).json({
        message: 'Seuls les organisateurs peuvent ajouter des candidatures aux favoris'
      });
      return;
    }

    // Vérifier que la candidature existe
    const application = await ApplicationModel.findById(applicationObjectId)
      .populate('event', 'organizer');
    
    if (!application) {
      res.status(404).json({
        message: 'Candidature non trouvée'
      });
      return;
    }

    // Vérifier que l'organisateur est bien propriétaire de l'événement de la candidature
    const event = await EventModel.findById(application.event);
    if (!event) {
      res.status(404).json({
        message: 'Événement de la candidature non trouvé'
      });
      return;
    }

    const eventOrganizerId = event.organizer.toString();
    if (eventOrganizerId !== organizerId) {
      res.status(403).json({
        message: 'Vous n\'êtes pas autorisé à ajouter cette candidature aux favoris'
      });
      return;
    }

    // Vérifier si la candidature est déjà dans les favoris
    const alreadyFavorite = organizer.favoriteApplications?.some(
      id => id.toString() === applicationObjectId.toString()
    );

    if (alreadyFavorite) {
      res.status(409).json({
        message: 'Cette candidature est déjà dans vos favoris'
      });
      return;
    }

    // Ajouter la candidature aux favoris en utilisant $addToSet pour éviter les problèmes de validation
    console.log(`⭐ [FAVORIS_APP] Ajout de la candidature ${applicationId} aux favoris de l'organisateur ${organizerId}`);
    
    const updatedOrganizer = await UserModel.findByIdAndUpdate(
      organizerObjectId,
      { $addToSet: { favoriteApplications: applicationObjectId } },
      { new: true, runValidators: false } // Ne pas valider les autres champs comme numberOfScenes
    );

    if (!updatedOrganizer) {
      console.error(`❌ [FAVORIS_APP] Organisateur ${organizerId} non trouvé après mise à jour`);
      res.status(404).json({
        message: 'Organisateur non trouvé après mise à jour'
      });
      return;
    }

    // Vérifier que le favori a bien été ajouté
    const favoriteCount = updatedOrganizer.favoriteApplications?.length || 0;
    const isNowFavorite = updatedOrganizer.favoriteApplications?.some(
      id => id.toString() === applicationObjectId.toString()
    );
    
    console.log(`✅ [FAVORIS_APP] Favori ajouté - Total favoris: ${favoriteCount}, Est favori: ${isNowFavorite}`);

    // Émettre un évènement SSE pour notifier tous les clients
    emitApplicationFavoriteAdded(organizerId, applicationId);

    res.status(201).json({
      message: 'Candidature ajoutée aux favoris avec succès',
      favoriteApplications: updatedOrganizer.favoriteApplications || []
    });
  } catch (error: any) {
    console.error('❌ [FAVORIS_APP] Erreur lors de l\'ajout aux favoris:', error);
    console.error('❌ [FAVORIS_APP] Détails de l\'erreur:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      errors: error?.errors
    });
    res.status(500).json({ 
      message: 'Erreur lors de l\'ajout aux favoris',
      error: error?.message || 'Erreur inconnue'
    });
  }
};

/**
 * Retire une candidature des favoris de l'organisateur
 */
export const removeApplicationFavorite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const organizerId = req.user?.id;

    if (!organizerId) {
      res.status(401).json({
        message: 'Non autorisé'
      });
      return;
    }

    // Valider l'ID de la candidature
    if (!Types.ObjectId.isValid(applicationId)) {
      res.status(400).json({
        message: 'ID de candidature invalide'
      });
      return;
    }

    const applicationObjectId = new Types.ObjectId(applicationId);
    const organizerObjectId = new Types.ObjectId(organizerId);

    // Récupérer l'organisateur
    const organizer = await UserModel.findById(organizerObjectId);
    if (!organizer || organizer.role !== 'ORGANIZER') {
      res.status(403).json({
        message: 'Seuls les organisateurs peuvent gérer leurs favoris'
      });
      return;
    }

    // Vérifier si la candidature est dans les favoris
    const favoriteIndex = organizer.favoriteApplications?.findIndex(
      id => id.toString() === applicationObjectId.toString()
    );

    if (favoriteIndex === undefined || favoriteIndex === -1) {
      res.status(404).json({
        message: 'Cette candidature n\'est pas dans vos favoris'
      });
      return;
    }

    // Retirer la candidature des favoris en utilisant $pull pour éviter les problèmes de validation
    console.log(`⭐ [FAVORIS_APP] Retrait de la candidature ${applicationId} des favoris de l'organisateur ${organizerId}`);
    
    const updatedOrganizer = await UserModel.findByIdAndUpdate(
      organizerObjectId,
      { $pull: { favoriteApplications: applicationObjectId } },
      { new: true, runValidators: false } // Ne pas valider les autres champs comme numberOfScenes
    );

    if (!updatedOrganizer) {
      console.error(`❌ [FAVORIS_APP] Organisateur ${organizerId} non trouvé après mise à jour`);
      res.status(404).json({
        message: 'Organisateur non trouvé après mise à jour'
      });
      return;
    }

    // Vérifier que le favori a bien été retiré
    const favoriteCount = updatedOrganizer.favoriteApplications?.length || 0;
    const isStillFavorite = updatedOrganizer.favoriteApplications?.some(
      id => id.toString() === applicationObjectId.toString()
    );
    
    console.log(`✅ [FAVORIS_APP] Favori retiré - Total favoris: ${favoriteCount}, Est encore favori: ${isStillFavorite}`);

    // Émettre un évènement SSE pour notifier tous les clients
    emitApplicationFavoriteRemoved(organizerId, applicationId);

    res.status(204).send();
  } catch (error: any) {
    console.error('❌ [FAVORIS_APP] Erreur lors du retrait des favoris:', error);
    console.error('❌ [FAVORIS_APP] Détails de l\'erreur:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      errors: error?.errors
    });
    res.status(500).json({ 
      message: 'Erreur lors du retrait des favoris',
      error: error?.message || 'Erreur inconnue'
    });
  }
};

/**
 * Récupère la liste des candidatures favorites de l'organisateur
 */
export const getApplicationFavorites = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const organizerId = req.user?.id;

    if (!organizerId) {
      res.status(401).json({
        message: 'Non autorisé'
      });
      return;
    }

    // Récupérer l'organisateur avec les favoris populés
    const organizer = await UserModel.findById(organizerId)
      .populate({
        path: 'favoriteApplications',
        select: '+performanceDetails +message +organizerMessage',
        populate: [
          {
            path: 'event',
            select: 'title date startTime endTime organizer location updatedAt modifiedByOrganizer status requirements participants',
            populate: {
              path: 'organizer',
              select: 'firstName lastName email'
            }
          },
          {
            path: 'comedian',
            select: 'firstName lastName email phone avatarUrl profile'
          }
        ]
      });

    if (!organizer || organizer.role !== 'ORGANIZER') {
      res.status(403).json({
        message: 'Seuls les organisateurs peuvent consulter leurs favoris'
      });
      return;
    }

    // Filtrer les favoris pour supprimer les références null (candidatures supprimées)
    const transformedFavorites = (organizer.favoriteApplications || [])
      .filter((application: any) => application !== null)
      .map((application: any) => {
        const applicationObj = application.toObject ? application.toObject() : application;
        return applicationObj;
      });

    res.json({
      favorites: transformedFavorites
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des favoris:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des favoris' });
  }
};

/**
 * Vérifie si une candidature est dans les favoris de l'organisateur
 */
export const checkIsApplicationFavorite = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { applicationId } = req.params;
    const organizerId = req.user?.id;

    if (!organizerId) {
      res.status(401).json({
        message: 'Non autorisé'
      });
      return;
    }

    // Valider l'ID de la candidature
    if (!Types.ObjectId.isValid(applicationId)) {
      res.status(400).json({
        message: 'ID de candidature invalide'
      });
      return;
    }

    const applicationObjectId = new Types.ObjectId(applicationId);
    const organizerObjectId = new Types.ObjectId(organizerId);

    // Récupérer l'organisateur
    const organizer = await UserModel.findById(organizerObjectId);
    if (!organizer || organizer.role !== 'ORGANIZER') {
      res.status(403).json({
        message: 'Seuls les organisateurs peuvent consulter leurs favoris'
      });
      return;
    }

    // Vérifier si la candidature est dans les favoris
    const isFavorite = organizer.favoriteApplications?.some(
      id => id.toString() === applicationObjectId.toString()
    ) || false;

    res.json({ isFavorite });
  } catch (error) {
    console.error('Erreur lors de la vérification du favori:', error);
    res.status(500).json({ message: 'Erreur lors de la vérification du favori' });
  }
};

