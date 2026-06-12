import express, { Response } from 'express';
import { validate } from '../middleware/validation';
import { createApplicationSchema, updateApplicationStatusSchema } from '../validation/schemas';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  createApplication,
  updateApplicationStatus,
  getComedianApplications,
  checkApplicationExists,
  getAllApplications,
  getApplicationById,
  confirmParticipation,
  deleteApplication,
  respondToEventUpdate
} from '../controllers/application';

const router = express.Router();

// ============================================================================
// PUBLIC ROUTES (sans authentification)
// ============================================================================

/**
 * GET /respond-update
 * Gère la réponse d'un humoriste après mise à jour d'évènement (via lien email)
 * Query params: token (JWT), action ('keep' | 'withdraw')
 */
router.get('/respond-update', respondToEventUpdate);

// ============================================================================
// PROTECTED ROUTES (authentification requise)
// ============================================================================

/**
 * POST /
 * Crée une nouvelle candidature
 * Body: { eventId, performanceDetails?, message? }
 */
router.post('/', authMiddleware, validate(createApplicationSchema), createApplication);

/**
 * GET /check/:eventId/:comedianId
 * Vérifie si une candidature existe déjà
 * Params: eventId, comedianId
 * Response: { hasApplied: boolean }
 */
router.get('/check/:eventId/:comedianId', authMiddleware, checkApplicationExists);

/**
 * GET /
 * Récupère toutes les candidatures visibles par l'utilisateur
 * Filtre selon le rôle (Super Admin, Comédien, Organisateur)
 * Query params: status? (filter), eventId? (filter)
 */
router.get('/', authMiddleware, getAllApplications);

/**
 * GET /:applicationId
 * Récupère une candidature spécifique
 * Params: applicationId
 */
router.get('/:applicationId', authMiddleware, getApplicationById);

/**
 * PUT /:applicationId/status
 * Met à jour le statut d'une candidature (réservé aux organisateurs)
 * Params: applicationId
 * Body: { status, organizerMessage? }
 */
router.put('/:applicationId/status', authMiddleware, validate(updateApplicationStatusSchema), updateApplicationStatus);

/**
 * PATCH /:applicationId/confirm
 * Confirme la participation d'un comédien
 * Params: applicationId
 */
router.patch('/:applicationId/confirm', authMiddleware, confirmParticipation);

/**
 * DELETE /:applicationId
 * Supprime une candidature (comédien ou organisateur)
 * Params: applicationId
 */
router.delete('/:applicationId', authMiddleware, deleteApplication);

/**
 * GET /comedian (Legacy - kept for backwards compatibility)
 * Récupère les candidatures d'un comédien
 * Accessible uniquement par des humoristes
 */
router.get('/comedian', authMiddleware, getComedianApplications);

export default router;
