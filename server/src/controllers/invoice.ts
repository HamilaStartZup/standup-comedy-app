import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { InvoiceModel } from '../models/Invoice';

/**
 * GET /api/invoices/mine — factures où l'utilisateur est acheteur ou vendeur.
 * Lit uniquement des clés non populées (buyerUserId/sellerOwnerId) : reste accessible
 * même après suppression du booking/venue/compte de l'autre partie.
 */
export const myInvoices = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ message: 'Non authentifié' });
      return;
    }

    const invoices = await InvoiceModel.find({
      $or: [{ buyerUserId: userId }, { sellerOwnerId: userId }],
    })
      .select('-stripePaymentIntentId -stripeSessionId -buyerUserId -sellerOwnerId')
      .sort({ issuedAt: -1 });

    res.status(200).json({ invoices });
  } catch (error) {
    console.error('Erreur myInvoices:', error);
    res.status(500).json({ message: 'Erreur interne du serveur' });
  }
};
