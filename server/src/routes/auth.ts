import { Router } from 'express';
import {
  register,
  login,
  logoutClassic,
  reactivateAccount,
  getProfile,
  getAllUsers,
  forgotPassword,
  resetPassword,
  getPasswordResetRequests,
  adminResetPassword,
  deactivateUser,
  reactivateUser,
  deleteUser,
  upgradeToOrganizer,
  switchToLieu,
  switchToOrganizer,
} from '../controllers/auth';
import { authMiddleware, authorizeRoles } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { registerSchema, loginSchema, upgradeToOrganizerSchema } from '../validation/schemas';

const router = Router();

// Routes publiques
router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/reactivate', validate(loginSchema), reactivateAccount);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout', logoutClassic);

// Routes protégées
router.get('/profile', authMiddleware, getProfile);
router.get('/users', authMiddleware, authorizeRoles('SUPER_ADMIN'), getAllUsers);

// Routes Super Admin pour gestion des réinitialisations
router.get('/admin/password-reset-requests', authMiddleware, authorizeRoles('SUPER_ADMIN'), getPasswordResetRequests);
router.post('/admin/reset-password', authMiddleware, authorizeRoles('SUPER_ADMIN'), adminResetPassword);

// Routes Super Admin pour desactiver/reactiver/supprimer des comptes
router.patch('/users/:userId/deactivate', authMiddleware, authorizeRoles('SUPER_ADMIN'), deactivateUser);
router.patch('/users/:userId/reactivate', authMiddleware, authorizeRoles('SUPER_ADMIN'), reactivateUser);
router.delete('/users/:userId', authMiddleware, authorizeRoles('SUPER_ADMIN'), deleteUser);

router.post('/upgrade-to-organizer', authMiddleware, validate(upgradeToOrganizerSchema), upgradeToOrganizer);
router.post('/switch-to-lieu', authMiddleware, authorizeRoles('ORGANIZER'), switchToLieu);
router.post('/switch-to-organizer', authMiddleware, authorizeRoles('LIEU'), switchToOrganizer);

export default router; 