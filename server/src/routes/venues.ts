import express, { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authMiddleware, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  createVenueSchema,
  updateVenueSchema,
  createBookingSchema,
  createBookingBatchSchema,
  updateBookingStatusSchema,
  cancelBookingByOwnerSchema,
  blockDateSchema,
  updateBookingGroupStatusSchema,
} from '../validation/schemas';
import { createVenue, listVenues, listMyVenues, getVenue, updateVenue, deleteVenue } from '../controllers/venue';
import { createBooking, createBookingBatch, listVenueBookings, myBookings, updateBookingStatus, updateBookingGroupStatus, cancelBooking, cancelBookingByOwner, blockDate, listBlockedDates, unblockDate, takenSlots, checkPaymentTimeouts, getRefundEstimate, getMyVenueBookings, fullDates } from '../controllers/venueBooking';

const router = express.Router();

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => unknown) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const validateVenueId = asyncHandler((req: Request, res: Response, next: NextFunction) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.venueId)) {
    return res.status(400).json({ message: 'ID de salle invalide' });
  }
  next();
});

const validateBookingId = asyncHandler((req: Request, res: Response, next: NextFunction) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.bookingId)) {
    return res.status(400).json({ message: 'ID de réservation invalide' });
  }
  next();
});

// ── Venues ───────────────────────────────────────────────────────────────────

router.post('/', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validate(createVenueSchema), asyncHandler(createVenue));
router.get('/', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), asyncHandler(listVenues));
router.get('/mine', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), asyncHandler(listMyVenues));
router.get('/bookings/mine', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), asyncHandler(myBookings));
router.get('/:venueId', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), validateVenueId, asyncHandler(getVenue));
router.put('/:venueId', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validateVenueId, validate(updateVenueSchema), asyncHandler(updateVenue));
router.delete('/:venueId', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validateVenueId, asyncHandler(deleteVenue));

// ── Bookings ─────────────────────────────────────────────────────────────────
router.get('/:venueId/my-bookings', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), validateVenueId, asyncHandler(getMyVenueBookings));
router.post('/:venueId/bookings', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), validateVenueId, validate(createBookingSchema), asyncHandler(createBooking));
router.post('/:venueId/bookings/batch', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), validateVenueId, validate(createBookingBatchSchema), asyncHandler(createBookingBatch));
router.get('/:venueId/bookings', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validateVenueId, asyncHandler(listVenueBookings));
router.patch('/bookings/:bookingId', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validateBookingId, validate(updateBookingStatusSchema), asyncHandler(updateBookingStatus));
router.patch('/bookings/group/:bookingGroupId', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validate(updateBookingGroupStatusSchema), asyncHandler(updateBookingGroupStatus));
router.delete('/bookings/:bookingId', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), validateBookingId, asyncHandler(cancelBooking));
// Annulation d'une réservation ACCEPTED par le propriétaire
router.patch('/bookings/:bookingId/cancel', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validateBookingId, validate(cancelBookingByOwnerSchema), asyncHandler(cancelBookingByOwner));
// Estimation du remboursement avant annulation (lecture seule)
router.get('/bookings/:bookingId/refund-estimate', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validateBookingId, asyncHandler(getRefundEstimate));

router.get('/:venueId/taken-slots', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), validateVenueId, asyncHandler(takenSlots));
router.get('/:venueId/full-dates', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), validateVenueId, asyncHandler(fullDates));

// ── Dates bloquées ────────────────────────────────────────────────────────────
router.post('/:venueId/blocked-dates', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validateVenueId, validate(blockDateSchema), asyncHandler(blockDate));
router.get('/:venueId/blocked-dates', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU', 'COMEDIAN'), validateVenueId, asyncHandler(listBlockedDates));
router.delete('/:venueId/blocked-dates/:blockedDateId', authMiddleware, authorizeRoles('ORGANIZER', 'LIEU'), validateVenueId, asyncHandler(unblockDate));

// ── Cron jobs ────────────────────────────────────────────────────────────────────
router.post('/jobs/check-payment-timeouts', asyncHandler(checkPaymentTimeouts));

export default router;
