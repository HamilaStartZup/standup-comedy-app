import express from 'express';
import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { sendEmail, testEmailConfig, testEmailSend, sendRemindersCron, sendOrganizerRemindersCron, sendMobilityRemindersForIncompleteEventsCron, dailySpectatorRecapCron } from '../controllers/email';
import {
  handleOneClickUnsubscribe,
  handleUnsubscribeConfirmation,
  handleResubscribe,
  getSubscriptionStatus,
  updateNotificationPreferences
} from '../controllers/unsubscribe';
import { unsubscribeRateLimiter } from '../middleware/rateLimiter';
import { authMiddleware, authorizeRoles } from '../middleware/auth';

const router = express.Router();

// ============================================================================
// CONFIGURATION DU TRANSPORTEUR D'EMAILS
// ============================================================================

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: config.email.smtpUser,
    pass: config.email.smtpPass,
  },
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 10000
} as any);

// ============================================================================
// ROUTES POUR L'EMAIL
// ============================================================================

/**
 * POST /send
 * Envoie un email (protégée)
 * Body: { to, subject, text }
 */
router.post('/send', authMiddleware, authorizeRoles('SUPER_ADMIN'), (req, res) => sendEmail(req, res, transporter));

/**
 * GET /test-config
 * Teste la configuration email
 */
router.get('/test-config', authMiddleware, authorizeRoles('SUPER_ADMIN'), testEmailConfig);

/**
 * POST /test-send
 * Envoie un email de test
 * Body: { testEmail }
 */
router.post('/test-send', authMiddleware, authorizeRoles('SUPER_ADMIN'), testEmailSend);

/**
 * POST /jobs/reminders
 * Cron job pour envoyer les rappels d'évènements (J-3, J-1, -2h)
 * Header: X-CRON-KEY (authentification)
 */
router.post('/jobs/reminders', sendRemindersCron);

/**
 * POST /jobs/organizer-reminders
 * Cron job pour envoyer les relances automatiques aux organisateurs
 * Délais: J-10, J-7, J-5, J-3, J-2, J-1
 * Header: X-CRON-KEY (authentification)
 */
router.post('/jobs/organizer-reminders', sendOrganizerRemindersCron);

/**
 * POST /jobs/incomplete-event-reminders
 * Cron job pour relancer les humoristes correspondant à la zone de mobilité
 * des événements incomplets (à J-2 et J-1)
 * Header: X-CRON-KEY (authentification)
 */
router.post('/jobs/incomplete-event-reminders', sendMobilityRemindersForIncompleteEventsCron);

/**
 * POST /jobs/daily-spectator-recap
 * Cron job : récapitulatif quotidien pour les spectateurs (max 1 email/jour)
 * Header: X-CRON-KEY (authentification)
 */
router.post('/jobs/daily-spectator-recap', dailySpectatorRecapCron);

// ============================================================================
// RFC 8058 - ONE-CLICK UNSUBSCRIBE ROUTES
// ============================================================================

/**
 * POST /unsubscribe
 * RFC 8058 One-Click Unsubscribe (pas d'authentification JWT)
 * Query: token, userId, email
 * Body: List-Unsubscribe=One-Click
 */
router.post('/unsubscribe', unsubscribeRateLimiter, handleOneClickUnsubscribe);

/**
 * GET /unsubscribe
 * Page de confirmation HTML (pas d'authentification JWT)
 * Query: token, userId, email
 */
router.get('/unsubscribe', unsubscribeRateLimiter, handleUnsubscribeConfirmation);

/**
 * POST /resubscribe
 * Réabonnement (authentification JWT requise)
 */
router.post('/resubscribe', authMiddleware, handleResubscribe);

/**
 * GET /subscription-status
 * Statut d'abonnement (authentification JWT requise)
 */
router.get('/subscription-status', authMiddleware, getSubscriptionStatus);

/**
 * PUT /notification-preferences
 * Active/désactive la réception de tous les évènements, même hors zone de mobilité
 * (authentification JWT requise)
 */
router.put('/notification-preferences', authMiddleware, updateNotificationPreferences);

export default router;
