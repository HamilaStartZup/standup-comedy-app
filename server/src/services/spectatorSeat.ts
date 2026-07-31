import mongoose from 'mongoose';
import { EventModel } from '../models/Event';

export type SeatClaimFailure = 'not_found' | 'cancelled' | 'already_registered' | 'withdrawn' | 'full';
export type SeatClaimResult = { ok: true } | { ok: false; reason: SeatClaimFailure };

/**
 * Réservation atomique d'une place spectateur : un seul findOneAndUpdate filtré sur
 * capacité + doublon + désinscription, pour éviter le check-then-act en cas de concurrence.
 */
export async function claimSpectatorSeat(eventId: string, userId: string): Promise<SeatClaimResult> {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const claimed = await EventModel.findOneAndUpdate(
    {
      _id: eventId,
      status: { $ne: 'cancelled' },
      spectatorRegistrations: { $ne: userObjectId },
      withdrawnSpectators: { $ne: userObjectId },
      $expr: {
        $or: [
          { $eq: [{ $ifNull: ['$maxSpectators', null] }, null] },
          { $lt: [{ $size: { $ifNull: ['$spectatorRegistrations', []] } }, '$maxSpectators'] },
        ],
      },
    },
    { $addToSet: { spectatorRegistrations: userObjectId } },
    { new: true }
  );

  if (claimed) {
    return { ok: true };
  }

  const event = await EventModel.findById(eventId);
  if (!event) {
    return { ok: false, reason: 'not_found' };
  }
  if (event.status?.toLowerCase() === 'cancelled') {
    return { ok: false, reason: 'cancelled' };
  }
  const withdrawnSpectators = event.withdrawnSpectators || [];
  if (withdrawnSpectators.some((id) => id.toString() === userId)) {
    return { ok: false, reason: 'withdrawn' };
  }
  const spectatorRegistrations = event.spectatorRegistrations || [];
  if (spectatorRegistrations.some((id) => id.toString() === userId)) {
    return { ok: false, reason: 'already_registered' };
  }
  return { ok: false, reason: 'full' };
}
