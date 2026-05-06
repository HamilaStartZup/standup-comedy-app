import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { EventModel } from '../models/Event';
import { SpectatorEventRatingModel } from '../models/SpectatorEventRating';
import { UserModel } from '../models/User';

/**
 * GET /api/events/:eventId/rating-form
 * Retourne l'événement (titre, date), la liste des humoristes participants et une éventuelle notation existante.
 * Réservé aux spectateurs inscrits à cet événement (passé).
 */
const getEventEndDateTime = (event: any): Date => {
  const eventDate = new Date(event.date);
  if (event.endTime) {
    const [hours, minutes] = String(event.endTime).split(':').map((v) => parseInt(v, 10) || 0);
    return new Date(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate(),
      hours,
      minutes,
      0,
      0
    );
  }
  return new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate(),
    23,
    59,
    59,
    999
  );
};

const isRatingWindowClosed = (event: any, now: Date = new Date()): boolean => {
  const endDateTime = getEventEndDateTime(event);
  const windowEnd = new Date(endDateTime.getTime() + 72 * 60 * 60 * 1000);
  return now > windowEnd;
};

export const getRatingForm = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || userRole !== 'SPECTATOR') {
      res.status(403).json({ message: 'Réservé aux spectateurs' });
      return;
    }
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'ID d\'événement invalide' });
      return;
    }

    const event = await EventModel.findById(eventId)
      .select('title date status spectatorRegistrations participants endTime')
      .populate('participants', 'firstName lastName avatarUrl');

    if (!event) {
      res.status(404).json({ message: 'Événement non trouvé' });
      return;
    }

    const isRegistered = (event.spectatorRegistrations || []).some(
      (id: any) => (id && id.toString ? id.toString() : id) === userId
    );
    if (!isRegistered) {
      res.status(403).json({ message: 'Vous n\'étiez pas inscrit à cet événement' });
      return;
    }

    const eventDate = new Date(event.date);
    if (eventDate >= new Date()) {
      res.status(422).json({ message: 'Vous ne pouvez noter qu\'un événement passé' });
      return;
    }

    if (event.status?.toLowerCase() === 'cancelled') {
      res.status(422).json({ message: 'Cet événement est annulé' });
      return;
    }

    if (isRatingWindowClosed(event)) {
      res.status(422).json({ message: 'La fenêtre de notation (72h après la fin de l\'événement) est dépassée.' });
      return;
    }

    const participants = (event.participants || []).map((p: any) => ({
      _id: p._id?.toString?.() || p.toString?.(),
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      avatarUrl: p.avatarUrl ?? null,
    }));

    const existing = await SpectatorEventRatingModel.findOne({
      event: eventId,
      spectator: userId,
    }).lean();

    res.status(200).json({
      event: {
        _id: event._id.toString(),
        title: event.title,
        date: event.date,
      },
      participants,
      existingRating: existing
        ? {
            eventRating: existing.eventRating,
            comedianRatings: (existing.comedianRatings || []).map((r: any) => ({
              comedianId: r.comedian?.toString?.() || r.comedian,
              rating: r.rating,
            })),
          }
        : null,
    });
  } catch (error) {
    console.error('getRatingForm error:', error);
    res.status(500).json({ message: 'Erreur lors du chargement du formulaire de notation' });
  }
};

/**
 * POST /api/events/:eventId/ratings
 * Body: { eventRating: number (1-5), comedianRatings: [{ comedianId: string, rating: number (1-5) }] }
 * Enregistre ou met à jour la notation du spectateur pour l'événement et les humoristes.
 */
export const submitRatings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const { eventRating, comedianRatings } = req.body;

    if (!userId || userRole !== 'SPECTATOR') {
      res.status(403).json({ message: 'Réservé aux spectateurs' });
      return;
    }
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'ID d\'événement invalide' });
      return;
    }

    const numEventRating = typeof eventRating === 'string' ? parseInt(eventRating, 10) : Number(eventRating);
    if (!Number.isInteger(numEventRating) || numEventRating < 1 || numEventRating > 5) {
      res.status(400).json({ message: 'La note de l\'événement doit être entre 1 et 5' });
      return;
    }

    const event = await EventModel.findById(eventId)
      .select('title date status spectatorRegistrations participants endTime');
    if (!event) {
      res.status(404).json({ message: 'Événement non trouvé' });
      return;
    }

    const isRegistered = (event.spectatorRegistrations || []).some(
      (id: any) => (id && id.toString ? id.toString() : id) === userId
    );
    if (!isRegistered) {
      res.status(403).json({ message: 'Vous n\'étiez pas inscrit à cet événement' });
      return;
    }

    const eventDate = new Date(event.date);
    if (eventDate >= new Date()) {
      res.status(422).json({ message: 'Vous ne pouvez noter qu\'un événement passé' });
      return;
    }

    if (isRatingWindowClosed(event)) {
      res.status(422).json({ message: 'La fenêtre de notation (72h après la fin de l\'événement) est dépassée.' });
      return;
    }

    const participantIds = new Set(
      (event.participants || []).map((id: any) => (id && id.toString ? id.toString() : id).toString())
    );

    const comedianRatingsArray = Array.isArray(comedianRatings) ? comedianRatings : [];
    const validatedComedianRatings: { comedian: mongoose.Types.ObjectId; rating: number }[] = [];
    for (const item of comedianRatingsArray) {
      const cid = item.comedianId ?? item.comedian;
      if (!cid || !participantIds.has(String(cid))) continue;
      const r = typeof item.rating === 'string' ? parseInt(item.rating, 10) : Number(item.rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) continue;
      validatedComedianRatings.push({
        comedian: new mongoose.Types.ObjectId(cid),
        rating: r,
      });
    }

    await SpectatorEventRatingModel.findOneAndUpdate(
      { event: eventId, spectator: userId },
      {
        eventRating: numEventRating,
        comedianRatings: validatedComedianRatings,
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.status(201).json({ message: 'Merci, votre notation a bien été enregistrée.' });
  } catch (error) {
    console.error('submitRatings error:', error);
    res.status(500).json({ message: 'Erreur lors de l\'enregistrement de la notation' });
  }
};

/**
 * GET /api/events/:eventId/rating-status
 * Indique si le spectateur a déjà noté cet événement (pour afficher "Noter" vs "Déjà noté").
 */
export const getRatingStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'ID d\'événement invalide' });
      return;
    }

    const event = await EventModel.findById(eventId)
      .select('date status endTime spectatorRegistrations');

    if (!event) {
      res.status(404).json({ message: 'Événement non trouvé' });
      return;
    }

    const isRegistered = (event.spectatorRegistrations || []).some(
      (id: any) => (id && id.toString ? id.toString() : id) === userId
    );
    if (!isRegistered) {
      res.status(403).json({ message: 'Vous n\'étiez pas inscrit à cet événement' });
      return;
    }

    const existing = await SpectatorEventRatingModel.findOne({
      event: eventId,
      spectator: userId,
    }).select('eventRating').lean();

    const windowClosed = isRatingWindowClosed(event);

    res.status(200).json({
      alreadyRated: !!existing,
      ratingWindowClosed: windowClosed,
      eventRating: existing?.eventRating ?? null,
    });
  } catch (error) {
    console.error('getRatingStatus error:', error);
    res.status(500).json({ message: 'Erreur' });
  }
};

/**
 * GET /api/events/:eventId/ratings-summary
 * Résumé des notes pour un événement (organisateur de l'événement uniquement).
 */
export const getEventRatingsSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      res.status(400).json({ message: 'ID d\'événement invalide' });
      return;
    }

    const event = await EventModel.findById(eventId)
      .select('title organizer participants')
      .populate('participants', 'firstName lastName');

    if (!event) {
      res.status(404).json({ message: 'Événement non trouvé' });
      return;
    }

    const organizerId = (event.organizer as any)?.toString?.() ?? event.organizer;
    if (organizerId !== userId && userRole !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Seul l\'organisateur de cet événement peut consulter les notes.' });
      return;
    }

    const ratings = await SpectatorEventRatingModel.find({ event: eventId }).lean();

    const totalRatings = ratings.length;
    const sumEventRating = ratings.reduce((acc, r) => acc + (r.eventRating || 0), 0);
    const averageEventRating = totalRatings > 0 ? Math.round((sumEventRating / totalRatings) * 10) / 10 : null;

    const comedianSums: Record<string, { sum: number; count: number }> = {};
    for (const r of ratings) {
      for (const cr of r.comedianRatings || []) {
        const cid = (cr.comedian && (cr.comedian as any).toString?.()) || String(cr.comedian);
        if (!comedianSums[cid]) comedianSums[cid] = { sum: 0, count: 0 };
        comedianSums[cid].sum += cr.rating || 0;
        comedianSums[cid].count += 1;
      }
    }

    const participants = (event.participants || []) as any[];
    const comedianRatings = participants.map((p: any) => {
      const cid = p._id?.toString?.() || p.toString?.();
      const agg = comedianSums[cid];
      const averageRating = agg && agg.count > 0 ? Math.round((agg.sum / agg.count) * 10) / 10 : null;
      return {
        comedianId: cid,
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? '',
        averageRating,
        ratingCount: agg?.count ?? 0,
      };
    });

    res.status(200).json({
      eventTitle: event.title,
      averageEventRating,
      totalRatings,
      comedianRatings,
    });
  } catch (error) {
    console.error('getEventRatingsSummary error:', error);
    res.status(500).json({ message: 'Erreur lors du chargement des notes' });
  }
};
