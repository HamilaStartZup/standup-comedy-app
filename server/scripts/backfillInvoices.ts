import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { VenueBookingModel } from '../src/models/VenueBooking';
import { createInvoiceSnapshot, updateInvoiceRefund } from '../src/services/invoiceSnapshot';

dotenv.config();

async function backfill() {
  await mongoose.connect(process.env.DATABASE_URL!);
  console.log('Connected. Backfilling invoices...');

  const bookings = await VenueBookingModel.find({
    paymentStatus: { $in: ['paid', 'refund_pending', 'refunded'] },
  }).select('_id paymentStatus refundedAmount refundedAt');
  console.log(`Found ${bookings.length} paid booking(s) to backfill.`);

  let successCount = 0;
  let errorCount = 0;

  for (const booking of bookings) {
    try {
      await createInvoiceSnapshot(booking._id.toString());
      if (booking.paymentStatus === 'refunded' && booking.refundedAmount != null && booking.refundedAt) {
        await updateInvoiceRefund(booking._id.toString(), booking.refundedAmount, booking.refundedAt);
      }
      successCount++;
    } catch (err) {
      errorCount++;
      console.error(`[Backfill] Error processing booking ${booking._id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`Backfill complete: ${successCount} succeeded, ${errorCount} failed.`);
  await mongoose.disconnect();
}

backfill().catch((err) => { console.error(err); process.exit(1); });
