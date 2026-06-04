import express from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  createCheckoutSession,
  confirmRegistrationAfterPayment,
  createVenueBookingCheckoutSession,
  confirmVenueBookingPayment,
  createVenueGroupCheckoutSession,
  confirmVenueGroupPayment,
  confirmVenueRefund,
} from '../controllers/stripe';

const router = express.Router();

router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  await createCheckoutSession(req as any, res);
});

router.get('/confirm-registration', authMiddleware, async (req, res) => {
  await confirmRegistrationAfterPayment(req as any, res);
});

router.post('/create-venue-checkout', authMiddleware, async (req, res) => {
  await createVenueBookingCheckoutSession(req as any, res);
});

router.get('/confirm-venue-payment', authMiddleware, async (req, res) => {
  await confirmVenueBookingPayment(req as any, res);
});

router.post('/create-venue-group-checkout', authMiddleware, async (req, res) => {
  await createVenueGroupCheckoutSession(req as any, res);
});

router.get('/confirm-venue-group-payment', authMiddleware, async (req, res) => {
  await confirmVenueGroupPayment(req as any, res);
});

router.get('/confirm-venue-refund', authMiddleware, async (req, res) => {
  await confirmVenueRefund(req as any, res);
});

export default router;
