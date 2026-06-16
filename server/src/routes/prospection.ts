import express from 'express';
import {
  getProspectionConfigHandler,
  patchProspectionConfigHandler,
  runProspectionHandler,
  getProspectionRunHandler,
  listProspectionRunsHandler,
  clearProspectionRunsHandler,
  listProspectedVenuesHandler,
  enrichProspectionVenuesHandler,
  prospectionUnsubscribeHandler,
} from '../controllers/prospection';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.get('/unsubscribe', prospectionUnsubscribeHandler);

router.get('/config', authMiddleware, getProspectionConfigHandler);
router.patch('/config', authMiddleware, patchProspectionConfigHandler);
router.post('/run', authMiddleware, runProspectionHandler);
router.post('/jobs/run', runProspectionHandler);
router.get('/runs', authMiddleware, listProspectionRunsHandler);
router.delete('/runs', authMiddleware, clearProspectionRunsHandler);
router.get('/runs/:id', authMiddleware, getProspectionRunHandler);
router.get('/venues', authMiddleware, listProspectedVenuesHandler);
router.post('/enrich', authMiddleware, enrichProspectionVenuesHandler);

export default router;
