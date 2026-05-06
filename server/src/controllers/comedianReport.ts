import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ComedianReportModel } from '../models/ComedianReport';
import { UserModel } from '../models/User';
import { Types } from 'mongoose';
import { sendComedianReportAccountDeactivatedEmail, sendComedianReportAccountRestrictedEmail, sendComedianReportAccountValidatedEmail } from '../services/emailService';

/**
 * POST /api/comedian-reports
 * Créer un signalement d'un humoriste (Organisateur uniquement)
 */
export const createComedianReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const reporterId = req.user?.id;
    const { comedianId, reason, description } = req.body;

    if (!reporterId) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    // Vérifier que l'utilisateur est un organisateur
    const reporter = await UserModel.findById(reporterId);
    if (!reporter || reporter.role !== 'ORGANIZER') {
      res.status(403).json({ message: 'Seuls les organisateurs peuvent signaler des humoristes' });
      return;
    }

    // Valider les données
    if (!comedianId || !Types.ObjectId.isValid(comedianId)) {
      res.status(400).json({ message: 'ID d\'humoriste invalide' });
      return;
    }

    const validReasons = ['troll', 'fake_account', 'inappropriate_content', 'spam', 'other'];
    if (!reason || !validReasons.includes(reason)) {
      res.status(400).json({ message: 'Raison de signalement invalide' });
      return;
    }

    // Vérifier que l'humoriste existe
    const comedian = await UserModel.findById(comedianId);
    if (!comedian || comedian.role !== 'COMEDIAN') {
      res.status(404).json({ message: 'Humoriste non trouvé' });
      return;
    }

    // Vérifier qu'on ne signale pas son propre compte
    if (comedianId === reporterId) {
      res.status(422).json({ message: 'Vous ne pouvez pas signaler votre propre compte' });
      return;
    }

    // Vérifier si un signalement existe déjà
    const existingReport = await ComedianReportModel.findOne({
      comedian: comedianId,
      reporter: reporterId
    });

    if (existingReport) {
      res.status(409).json({ 
        message: 'Vous avez déjà signalé cet humoriste',
        report: existingReport
      });
      return;
    }

    // Créer le signalement
    const report = await ComedianReportModel.create({
      comedian: comedianId,
      reporter: reporterId,
      reason,
      description: description || '',
      status: 'pending'
    });

    // Restreindre le compte de l'humoriste et envoyer l'email d'avertissement
    const comedianDoc = await UserModel.findById(comedianId).select('isRestricted email firstName lastName _id');
    const wasRestricted = comedianDoc?.isRestricted === true;
    await UserModel.findByIdAndUpdate(comedianId, {
      isRestricted: true,
      restrictedAt: new Date()
    });
    if (!wasRestricted && comedianDoc?.email) {
      try {
        const comedianPayload = {
          email: comedianDoc.email,
          _id: String(comedianDoc._id),
          firstName: comedianDoc.firstName,
          lastName: comedianDoc.lastName
        };
        await sendComedianReportAccountRestrictedEmail(comedianPayload);
      } catch (emailError: any) {
        console.error('Erreur lors de l\'envoi de l\'email de restriction:', emailError);
      }
    }

    res.status(201).json({
      message: 'Signalement créé avec succès',
      report
    });
  } catch (error: any) {
    console.error('Erreur lors de la création du signalement:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la création du signalement',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/comedian-reports
 * Récupérer tous les signalements (Super Admin uniquement)
 */
export const getComedianReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès refusé. Seuls les super-admins peuvent accéder à cette ressource.' });
      return;
    }

    const { status } = req.query;
    const query: any = {};
    
    if (status && ['pending', 'validated', 'rejected'].includes(status as string)) {
      query.status = status;
    }

    const reports = await ComedianReportModel.find(query)
      .populate('comedian', 'firstName lastName email role')
      .populate('reporter', 'firstName lastName email role')
      .populate('reviewedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      reports,
      count: reports.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des signalements:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des signalements' });
  }
};

/**
 * GET /api/comedian-reports/:reportId
 * Récupérer un signalement spécifique (Super Admin uniquement)
 */
export const getComedianReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès refusé. Seuls les super-admins peuvent accéder à cette ressource.' });
      return;
    }

    const { reportId } = req.params;

    const report = await ComedianReportModel.findById(reportId)
      .populate('comedian', 'firstName lastName email role')
      .populate('reporter', 'firstName lastName email role')
      .populate('reviewedBy', 'firstName lastName email');

    if (!report) {
      res.status(404).json({ message: 'Signalement non trouvé' });
      return;
    }

    res.status(200).json({ report });
  } catch (error) {
    console.error('Erreur lors de la récupération du signalement:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du signalement' });
  }
};

/**
 * PATCH /api/comedian-reports/:reportId
 * Mettre à jour le statut d'un signalement (Super Admin uniquement)
 */
export const updateComedianReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Accès refusé. Seuls les super-admins peuvent modifier les signalements.' });
      return;
    }

    const { reportId } = req.params;
    const { status } = req.body;

    const report = await ComedianReportModel.findById(reportId);

    if (!report) {
      res.status(404).json({ message: 'Signalement non trouvé' });
      return;
    }

    // Valider le statut
    const validStatuses = ['pending', 'validated', 'rejected'];
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ message: 'Statut invalide' });
      return;
    }

    // Mettre à jour le signalement
    if (status) {
      report.status = status as any;
      
      // Si le statut change vers validated ou rejected, enregistrer qui a examiné
      if (status !== 'pending' && !report.reviewedAt) {
        report.reviewedBy = new Types.ObjectId(req.user.id);
        report.reviewedAt = new Date();
      }
    }

    await report.save();

    // Envoyer l'email au compte signalé selon le statut
    if (status === 'validated' || status === 'rejected') {
      const comedianDoc = await UserModel.findById(report.comedian).select('email firstName lastName _id');
      if (comedianDoc?.email) {
        const comedianPayload = {
          email: comedianDoc.email,
          _id: String(comedianDoc._id),
          firstName: comedianDoc.firstName,
          lastName: comedianDoc.lastName
        };
        try {
          if (status === 'validated') {
            // Désactiver le compte définitivement
            await UserModel.findByIdAndUpdate(report.comedian, {
              isActive: false,
              isRestricted: false,
              restrictedAt: null,
              deactivatedAt: new Date(),
              deactivatedBy: req.user.id,
              deactivationReason: 'Report validé par l\'équipe'
            });
            await sendComedianReportAccountDeactivatedEmail(comedianPayload);
          } else {
            // Signalement rejeté : redonner accès si aucun autre signalement en attente
            const pendingCount = await ComedianReportModel.countDocuments({
              comedian: report.comedian,
              status: 'pending'
            });
            if (pendingCount === 0) {
              await UserModel.findByIdAndUpdate(report.comedian, {
                isRestricted: false,
                restrictedAt: null
              });
              await sendComedianReportAccountValidatedEmail(comedianPayload);
            }
          }
        } catch (emailError: any) {
          console.error('Erreur lors de l\'envoi de l\'email au compte signalé:', emailError);
          // Ne pas faire échouer la mise à jour du signalement
        }
      }
    }

    const updatedReport = await ComedianReportModel.findById(reportId)
      .populate('comedian', 'firstName lastName email role')
      .populate('reporter', 'firstName lastName email role')
      .populate('reviewedBy', 'firstName lastName email');

    res.status(200).json({
      message: 'Signalement mis à jour avec succès',
      report: updatedReport
    });
  } catch (error: any) {
    console.error('Erreur lors de la mise à jour du signalement:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la mise à jour du signalement',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * GET /api/comedian-reports/comedian/:comedianId
 * Vérifier si un humoriste a déjà été signalé par l'organisateur actuel
 */
export const checkComedianReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const reporterId = req.user?.id;
    const { comedianId } = req.params;

    if (!reporterId) {
      res.status(401).json({ message: 'Non autorisé' });
      return;
    }

    if (!comedianId || !Types.ObjectId.isValid(comedianId)) {
      res.status(400).json({ message: 'ID d\'humoriste invalide' });
      return;
    }

    const report = await ComedianReportModel.findOne({
      comedian: comedianId,
      reporter: reporterId
    });

    res.status(200).json({
      hasReported: !!report,
      report: report || null
    });
  } catch (error) {
    console.error('Erreur lors de la vérification du signalement:', error);
    res.status(500).json({ message: 'Erreur lors de la vérification du signalement' });
  }
};

