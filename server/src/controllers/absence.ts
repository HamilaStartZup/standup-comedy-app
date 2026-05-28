import { Response } from 'express';
import { AbsenceModel } from '../models/Absence';
import { EventModel } from '../models/Event';
import { UserModel } from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { Types } from 'mongoose';
import { emitAbsenceMarked, emitAbsenceCancelled } from '../services/eventEmitter';
import { createNotification } from './notification';

/**
 * Marque un participant comme absent à un évènement (protégée - organisateur seulement)
 */
export const markAbsence = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId, comedianId, reason } = req.body;
    const organizerId = req.user?.id;

    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié.' });
      return;
    }

    if (!eventId || !comedianId) {
      res.status(400).json({ message: 'eventId et comedianId sont requis.' });
      return;
    }

    // Vérifier que l'évènement existe et que l'utilisateur est l'organisateur
    const event = await EventModel.findById(eventId);
    if (!event) {
      res.status(404).json({ message: 'Évènement non trouvé.' });
      return;
    }

    if (event.organizer.toString() !== organizerId) {
      res.status(403).json({ message: 'Non autorisé. Seul l\'organisateur peut marquer les absences.' });
      return;
    }

    // Vérifier que le humoriste est bien participant à l'évènement
    const isParticipant = event.participants.some(p => p.toString() === comedianId);
    if (!isParticipant) {
      res.status(400).json({ message: 'Ce humoriste n\'est pas participant à cet évènement.' });
      return;
    }

    // Vérifier si une absence existe déjà
    const existingAbsence = await AbsenceModel.findOne({
      event: eventId,
      comedian: comedianId
    });

    if (existingAbsence) {
      // Mettre à jour l'absence existante
      existingAbsence.reason = reason || '';
      existingAbsence.markedAt = new Date();
      await existingAbsence.save();

      // Incrémenter les statistiques d'absence du humoriste
      const comedian = await UserModel.findById(comedianId);
      if (comedian) {
        if (!comedian.stats) {
          comedian.stats = {};
        }
        // Pas besoin d'incrémenter si c'était déjà marqué comme absent
      }

      res.json({
        message: 'Absence mise à jour avec succès',
        absence: existingAbsence
      });
      return;
    }

    // Créer une nouvelle absence
    const absence = new AbsenceModel({
      event: eventId,
      comedian: comedianId,
      organizer: organizerId,
      reason: reason || '',
      markedAt: new Date()
    });

    await absence.save();

    // Émettre un évènement SSE pour notifier tous les clients
    emitAbsenceMarked(eventId, comedianId, organizerId);

    // Incrémenter les statistiques d'absence du humoriste
    const comedian = await UserModel.findById(comedianId);
    if (comedian) {
      if (!comedian.stats) {
        comedian.stats = {};
      }
      comedian.stats.absences = (comedian.stats.absences || 0) + 1;
      comedian.markModified('stats');
      await comedian.save();
    }

    // Créer une notification in-app pour l'organisateur (lui-même, mais pour l'historique)
    // Note: L'organisateur marque l'absence, donc pas besoin de notification pour lui
    // Mais on pourrait notifier si un autre admin le fait

    res.status(201).json({
      message: 'Absence marquée avec succès',
      absence
    });
  } catch (error) {
    console.error('Erreur lors du marquage de l\'absence:', error);
    res.status(500).json({ message: 'Erreur lors du marquage de l\'absence' });
  }
};

/**
 * Annule/supprime une absence (protégée - organisateur seulement)
 */
export const deleteAbsence = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId, comedianId } = req.params;
    const organizerId = req.user?.id;

    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié.' });
      return;
    }

    // Vérifier que l'évènement existe et que l'utilisateur est l'organisateur
    const event = await EventModel.findById(eventId);
    if (!event) {
      res.status(404).json({ message: 'Évènement non trouvé.' });
      return;
    }

    if (event.organizer.toString() !== organizerId) {
      res.status(403).json({ message: 'Non autorisé. Seul l\'organisateur peut gérer les absences.' });
      return;
    }

    // Trouver et supprimer l'absence
    const absence = await AbsenceModel.findOneAndDelete({
      event: eventId,
      comedian: comedianId
    });

    if (!absence) {
      res.status(404).json({ message: 'Aucune absence trouvée pour ce participant.' });
      return;
    }

    // Émettre un évènement SSE pour notifier tous les clients
    emitAbsenceCancelled(eventId, comedianId, organizerId);

    // Décrémenter les statistiques d'absence du humoriste
    const comedian = await UserModel.findById(comedianId);
    if (comedian && comedian.stats && comedian.stats.absences && comedian.stats.absences > 0) {
      comedian.stats.absences -= 1;
      comedian.markModified('stats');
      await comedian.save();
    }

    res.json({ message: 'Absence annulée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de l\'absence:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'absence' });
  }
};

/**
 * Récupère les absences d'un évènement (protégée - organisateur seulement)
 */
export const getEventAbsences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const organizerId = req.user?.id;

    if (!organizerId) {
      res.status(401).json({ message: 'Utilisateur non authentifié.' });
      return;
    }

    // Vérifier que l'évènement existe et que l'utilisateur est l'organisateur
    const event = await EventModel.findById(eventId);
    if (!event) {
      res.status(404).json({ message: 'Évènement non trouvé.' });
      return;
    }

    if (event.organizer.toString() !== organizerId) {
      res.status(403).json({ message: 'Non autorisé.' });
      return;
    }

    const absences = await AbsenceModel.find({ event: eventId })
      .populate('comedian', 'firstName lastName email')
      .populate('organizer', 'firstName lastName')
      .sort({ markedAt: -1 });

    res.json(absences);
  } catch (error) {
    console.error('Erreur lors de la récupération des absences:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des absences' });
  }
};

/**
 * Récupère les absences d'un humoriste avec filtrage par rôle
 */
export const getComedianAbsences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { comedianId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({ message: 'Utilisateur non authentifié.' });
      return;
    }

    // SUPER_ADMIN a accès à tout
    if (userRole === 'SUPER_ADMIN') {
      const absences = await AbsenceModel.find({ comedian: comedianId })
        .populate('event', 'title date location')
        .populate('organizer', 'firstName lastName')
        .sort({ markedAt: -1 });
      res.json(absences);
      return;
    }

    // Le humoriste lui-même peut voir ses absences
    if (comedianId === userId) {
      const absences = await AbsenceModel.find({ comedian: comedianId })
        .populate('event', 'title date location')
        .populate('organizer', 'firstName lastName')
        .sort({ markedAt: -1 });
      res.json(absences);
      return;
    }

    // L'organisateur peut voir les absences d'un humoriste s'il est organisateur d'un évènement où ce humoriste est participant
    if (userRole === 'ORGANIZER') {
      // Vérifier si l'organisateur a des évènements où ce humoriste est participant
      const eventsWithComedian = await EventModel.find({
        organizer: userId,
        participants: comedianId
      });

      if (eventsWithComedian.length > 0) {
        // Récupérer les absences pour ces évènements spécifiques
        const eventIds = eventsWithComedian.map(event => event._id);
        const absences = await AbsenceModel.find({
          comedian: comedianId,
          event: { $in: eventIds }
        })
          .populate('event', 'title date location')
          .populate('organizer', 'firstName lastName')
          .sort({ markedAt: -1 });

        res.json(absences);
        return;
      }
    }

    res.status(403).json({ message: 'Non autorisé.' });
  } catch (error) {
    console.error('Erreur lors de la récupération des absences:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des absences' });
  }
};

/**
 * Synchronise les compteurs d'absences de tous les humoristes (SUPER_ADMIN uniquement)
 */
export const syncAbsences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Récupérer tous les humoristes
    const comedians = await UserModel.find({ role: 'COMEDIAN' });

    let updated = 0;
    for (const comedian of comedians) {
      const absCount = await AbsenceModel.countDocuments({ comedian: comedian._id });
      console.log(`SYNC: ${comedian.email} - absences trouvées: ${absCount}`);
      await UserModel.updateOne(
        { _id: comedian._id },
        { $set: { 'stats.absences': absCount } }
      );
      updated++;
    }

    res.json({ message: `Synchronisation terminée pour ${updated} humoristes.` });
  } catch (error) {
    console.error('Erreur lors de la synchronisation des absences:', error);
    res.status(500).json({ message: 'Erreur lors de la synchronisation des absences' });
  }
};
