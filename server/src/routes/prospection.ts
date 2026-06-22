import express from 'express';
import {
  getProspectionConfigHandler,
  patchProspectionConfigHandler,
  runProspectionHandler,
  getProspectionRunHandler,
  listProspectionRunsHandler,
  clearProspectionRunsHandler,
  cancelProspectionRunHandler,
  listProspectedVenuesHandler,
  createProspectedVenueHandler,
  updateProspectedVenueHandler,
  deleteProspectedVenueHandler,
  enrichProspectionVenuesHandler,
  prospectionUnsubscribeHandler,
} from '../controllers/prospection';
import {
  getProspectionInboxStatusHandler,
  listProspectionInboxHandler,
  syncProspectionInboxHandler,
  markProspectionInboxRepliedHandler,
} from '../controllers/prospectionInbox';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.get('/unsubscribe', prospectionUnsubscribeHandler);

router.get('/config', authMiddleware, getProspectionConfigHandler);
router.patch('/config', authMiddleware, patchProspectionConfigHandler);
router.post('/run', authMiddleware, runProspectionHandler);
router.post('/jobs/run', runProspectionHandler);
router.get('/runs', authMiddleware, listProspectionRunsHandler);
router.delete('/runs', authMiddleware, clearProspectionRunsHandler);
router.post('/runs/:id/cancel', authMiddleware, cancelProspectionRunHandler);
router.get('/runs/:id', authMiddleware, getProspectionRunHandler);
router.get('/venues', authMiddleware, listProspectedVenuesHandler);
router.post('/venues', authMiddleware, createProspectedVenueHandler);
router.patch('/venues/:id', authMiddleware, updateProspectedVenueHandler);
router.delete('/venues/:id', authMiddleware, deleteProspectedVenueHandler);
router.post('/enrich', authMiddleware, enrichProspectionVenuesHandler);
router.get('/inbox/status', authMiddleware, getProspectionInboxStatusHandler);
router.get('/inbox', authMiddleware, listProspectionInboxHandler);
router.post('/inbox/sync', authMiddleware, syncProspectionInboxHandler);
router.post('/inbox/:id/mark-replied', authMiddleware, markProspectionInboxRepliedHandler);

export default router;
