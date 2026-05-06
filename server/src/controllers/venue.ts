import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth';
import { VenueModel } from '../models/Venue';
import { VenueBookingModel } from '../models/VenueBooking';
import { VenueBlockedDateModel } from '../models/VenueBlockedDate';
import { refundVenueBookings } from './venueBooking';
import { updateVenueSchema } from '../validation/schemas';
import { getDepartmentFromPostalCode } from '../utils/cityMapping';
import { DEPARTMENT_TO_REGION, getDepartmentsByRegion, normalizeDepartment } from '../utils/geographicMatching';
// ─── CRUD Venues ─────────────────────────────────────────────────────────────

export const createVenue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const venue = await VenueModel.create({ ...req.body, owner: ownerId });
    res.status(201).json({ venue });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({ message: Object.values(error.errors).map((e) => e.message).join(', ') });
      return;
    }
    console.error('Erreur createVenue:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

export const listVenues = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { city, venueType, minCapacity, region, department, page = '1', limit = '20' } = req.query as Record<string, string>;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      res.status(400).json({ message: 'page doit être un entier valide (≥ 1)' });
      return;
    }
    if (isNaN(limitNum) || limitNum < 1) {
      res.status(400).json({ message: 'limit doit être un entier valide (≥ 1)' });
      return;
    }
    const safeLimit = Math.min(limitNum, 50);

    const filter: Record<string, unknown> = { isActive: true };
    if (req.query.owner === 'me' && req.user?.id) {
      filter.owner = req.user.id;
    } else if (req.user?.role === 'LIEU') {
      filter.owner = req.user.id;
    }
    if (venueType) filter.venueType = venueType;
    if (minCapacity) {
      const capacityNum = parseInt(minCapacity, 10);
      if (isNaN(capacityNum)) {
        res.status(400).json({ message: 'minCapacity doit être un entier valide' });
        return;
      }
      filter.capacity = { $gte: capacityNum };
    }
    if (city) {
      const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.city = new RegExp(escaped, 'i');
    }
    if (region) {
      const depts = getDepartmentsByRegion(region);
      if (depts.length === 0) {
        res.status(400).json({ message: `Région "${region}" inconnue` });
        return;
      }
      filter.department = { $in: depts };
    }
    if (department) {
      const normalizedDept = normalizeDepartment(department);
      filter.department = normalizedDept;
    }

    const skip = (pageNum - 1) * safeLimit;
    const collation = { locale: 'fr', strength: 1 };

    const [venues, total] = await Promise.all([
      VenueModel.find(filter)
        .collation(collation)
        .populate('owner', 'firstName lastName organizerProfile.companyName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),
      VenueModel.countDocuments(filter).collation(collation),
    ]);

    res.status(200).json({ venues, total, page: pageNum, limit: safeLimit });
  } catch (error) {
    console.error('Erreur listVenues:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

export const listMyVenues = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const { page = '1', limit = '20' } = req.query as Record<string, string>;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > 1000) {
      res.status(400).json({ message: 'page doit être un entier valide (≥ 1, ≤ 1000)' });
      return;
    }
    if (isNaN(limitNum) || limitNum < 1) {
      res.status(400).json({ message: 'limit doit être un entier valide' });
      return;
    }
    const safeLimit = Math.min(limitNum, 50);

    const filter: Record<string, unknown> = { owner: ownerId, isDeleted: { $ne: true } };

    const skip = (pageNum - 1) * safeLimit;
    const collation = { locale: 'fr', strength: 1 };

    const [venues, total] = await Promise.all([
      VenueModel.find(filter)
        .collation(collation)
        .populate('owner', 'firstName lastName organizerProfile.companyName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),
      VenueModel.countDocuments(filter).collation(collation),
    ]);

    res.status(200).json({ venues, total, page: pageNum, limit: safeLimit });
  } catch (error) {
    console.error('Erreur listMyVenues:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

export const getVenue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { venueId } = req.params;
    const userId = req.user?.id;

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    const populateFields = userId ? 'firstName lastName organizerProfile.companyName' : 'firstName lastName organizerProfile.companyName';
    let venue = await VenueModel.findById(venueId).populate('owner', populateFields);
    if (!venue || venue.isDeleted) {
      res.status(404).json({ message: 'Salle introuvable' });
      return;
    }

    // Si l'user est le propriétaire, exposer l'email
    if (userId && venue.owner?.toString() === userId) {
      venue = await VenueModel.findById(venueId).populate('owner', 'firstName lastName organizerProfile.companyName email');
    } else if (userId) {
      // Sinon, vérifier s'il a un booking ACCEPTED
      const hasAcceptedBooking = await VenueBookingModel.exists({
        venue: venueId,
        requester: userId,
        status: 'ACCEPTED',
      });
      if (hasAcceptedBooking) {
        venue = await VenueModel.findById(venueId).populate('owner', 'firstName lastName organizerProfile.companyName email');
      }
    }

    // Récupérer les réservations ACCEPTED pour le calendrier de disponibilité
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const acceptedBookings = await VenueBookingModel.find({
      venue: venueId,
      status: 'ACCEPTED',
      requestedDate: { $gte: todayMidnight },
    }).select('requestedDate startTime endTime');

    res.status(200).json({ venue, acceptedBookings });
  } catch (error) {
    console.error('Erreur getVenue:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

export const updateVenue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    const { venueId } = req.params;

    if (!ownerId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    const validatedBody = updateVenueSchema.parse(req.body);
    const updateData: Record<string, unknown> = { ...validatedBody };
    if (validatedBody.postalCode) {
      const dept = getDepartmentFromPostalCode(validatedBody.postalCode);
      updateData.department = dept ?? undefined;
      updateData.region = dept ? (DEPARTMENT_TO_REGION[dept] ?? undefined) : undefined;
    }
    const updated = await VenueModel.findOneAndUpdate(
      { _id: venueId, owner: ownerId, isDeleted: { $ne: true } },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updated) {
      const exists = await VenueModel.exists({ _id: venueId, isDeleted: { $ne: true } });
      res.status(exists ? 403 : 404).json({ message: exists ? 'Non autorisé à modifier cette salle' : 'Salle introuvable' });
      return;
    }
    res.status(200).json({ venue: updated });
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({ message: Object.values(error.errors).map((e) => e.message).join(', ') });
      return;
    }
    console.error('Erreur updateVenue:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};

export const deleteVenue = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const ownerId = req.user?.id;
    const { venueId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(venueId)) {
      res.status(400).json({ message: 'ID de salle invalide' });
      return;
    }

    const venue = await VenueModel.findById(venueId);
    if (!venue || venue.isDeleted) {
      res.status(404).json({ message: 'Salle introuvable' });
      return;
    }

    if (venue.owner.toString() !== ownerId) {
      res.status(403).json({ message: 'Non autorisé à supprimer cette salle' });
      return;
    }

    // Soft delete first: mark venue as deleted so no new bookings can be created
    // while refunds are in progress. Bookings are preserved so requesters can
    // still see them in "mes réservations".
    await VenueModel.findByIdAndUpdate(venueId, { isDeleted: true, isActive: false });
    // Blocked dates are cleaned up as they serve no purpose without an active venue.
    await VenueBlockedDateModel.deleteMany({ venue: venueId });
    // Rembourser tous les bookings payés après suppression (salle déjà invisible)
    await refundVenueBookings(venueId);
    res.status(204).send();
  } catch (error) {
    console.error('Erreur deleteVenue:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};
