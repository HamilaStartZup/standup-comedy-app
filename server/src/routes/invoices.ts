import express from 'express';
import { authMiddleware } from '../middleware/auth';
import { myInvoices } from '../controllers/invoice';

const router = express.Router();

router.get('/mine', authMiddleware, myInvoices);

export default router;
