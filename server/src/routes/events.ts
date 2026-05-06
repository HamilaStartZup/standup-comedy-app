import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../middleware/validation';
import { createEventSchema, updateEventSchema } from '../validation/schemas';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  getEventStats,
  createEvent,
  updateEvent,
  getEventsList,
  getEvents,
  getEventById,
  deleteEvent,
  getOrganizerEvents,
  notifyHumorists,
  inviteComedian,
  processCompletedEvents,
  resetParticipations,
  markEventsAsCompletedCron,
  registerSpectator,
  unregisterSpectator,
  uploadEventImage,
} from '../controllers/event';
import { getRatingForm, submitRatings, getRatingStatus, getEventRatingsSummary } from '../controllers/spectatorRating';

const uploadsEventsDir = path.join(process.cwd(), 'uploads', 'events');
if (!fs.existsSync(uploadsEventsDir)) {
  fs.mkdirSync(uploadsEventsDir, { recursive: true });
}

const uploadEventImageMulter = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsEventsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const safe = /^\.(jpe?g|png|gif)$/i.test(ext) ? ext : '.jpg';
      cb(null, `${uuidv4()}${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/gif'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non accepté. Utilisez JPG, PNG ou GIF.'));
    }
  },
});

const router = express.Router();

// ============================================================================
// ASYNC HANDLER WRAPPER
// ============================================================================
const asyncHandler = (fn: (req: Request | AuthRequest, res: Response) => Promise<any>) => {
  return (req: Request | AuthRequest, res: Response, next: NextFunction) => {
    console.log('🔀 AsyncHandler appelé pour:', req.method, req.path);
    Promise.resolve(fn(req, res))
      .catch((error) => {
        console.error('❌ AsyncHandler caught error:', error);
        next(error);
      });
  };
};

// ============================================================================
// EVENT STATISTICS & MANAGEMENT ROUTES
// ============================================================================

// GET /api/events/stats - Récupérer les statistiques d'évènements
router.get('/stats', authMiddleware, asyncHandler(getEventStats));

// ============================================================================
// EVENT CRUD ROUTES
// ============================================================================

// POST /api/events/upload-image - Upload photo de l'événement (organisateur, JPG/PNG/GIF max 5MB)
router.post('/upload-image', authMiddleware, (req, res, next) => {
  uploadEventImageMulter.single('image')(req, res, (err: any) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (max 5MB).' : (err.message || 'Erreur upload.');
      return res.status(400).json({ message: msg });
    }
    next();
  });
}, asyncHandler(uploadEventImage));

// POST /api/events - Créer un nouvel évènement
router.post('/', authMiddleware, validate(createEventSchema), asyncHandler(createEvent));

// GET /api/events - Récupérer tous les évènements (avec filtrage par rôle)
router.get('/', authMiddleware, asyncHandler(getEventsList));

// GET /api/events/user/my-events - Récupérer les évènements de l'organisateur connecté
router.get('/user/my-events', authMiddleware, asyncHandler(getOrganizerEvents));

// POST /api/events/:eventId/spectator-register - Inscription spectateur
router.post('/:eventId/spectator-register', authMiddleware, asyncHandler(registerSpectator));
// DELETE /api/events/:eventId/spectator-register - Désinscription spectateur
router.delete('/:eventId/spectator-register', authMiddleware, asyncHandler(unregisterSpectator));

// GET /api/events/:eventId/rating-form - Formulaire de notation (spectateur, événement passé)
router.get('/:eventId/rating-form', authMiddleware, asyncHandler(getRatingForm));
// POST /api/events/:eventId/ratings - Envoyer les notes (spectateur)
router.post('/:eventId/ratings', authMiddleware, asyncHandler(submitRatings));
// GET /api/events/:eventId/rating-status - Savoir si déjà noté
router.get('/:eventId/rating-status', authMiddleware, asyncHandler(getRatingStatus));
// GET /api/events/:eventId/ratings-summary - Résumé des notes (organisateur)
router.get('/:eventId/ratings-summary', authMiddleware, asyncHandler(getEventRatingsSummary));

// GET /api/events/:eventId - Récupérer un évènement par son ID
router.get('/:eventId', asyncHandler(getEventById));

// PUT /api/events/:eventId - Mettre à jour un évènement
router.put('/:eventId', authMiddleware, validate(updateEventSchema), asyncHandler(updateEvent));

// DELETE /api/events/:eventId - Supprimer un évènement
router.delete('/:eventId', authMiddleware, asyncHandler(deleteEvent));

// ============================================================================
// ADMINISTRATIVE & NOTIFICATION ROUTES
// ============================================================================

// POST /api/events/:id/notify - Envoyer des notifications manuelles aux humoristes
router.post('/:id/notify', authMiddleware, asyncHandler(notifyHumorists));

// POST /api/events/:eventId/invite-comedian/:comedianId - Inviter un humoriste spécifique à postuler pour un événement
router.post('/:eventId/invite-comedian/:comedianId', authMiddleware, asyncHandler(inviteComedian));

// POST /api/events/process-completed-events - Traiter automatiquement les évènements terminés (SUPER_ADMIN uniquement)
router.post('/process-completed-events', authMiddleware, asyncHandler(processCompletedEvents));

// POST /api/events/reset-participations - Réinitialiser les participations (SUPER_ADMIN uniquement)
router.post('/reset-participations', authMiddleware, asyncHandler(resetParticipations));

// ============================================================================
// CRON JOB ROUTES
// ============================================================================

// POST /api/events/jobs/mark-completed - Cron job pour marquer les évènements passés comme completed
router.post('/jobs/mark-completed', asyncHandler(markEventsAsCompletedCron));

export default router;
