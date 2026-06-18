import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  isProspectionImapConfigured,
  listProspectionInboxMessages,
  markInboxMessageAsReplied,
  syncProspectionInbox,
} from '../services/prospection/prospectionInboxService';
import { config } from '../config/env';

function assertSuperAdmin(req: AuthRequest, res: Response): boolean {
  if (req.user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ message: 'Accès refusé. Super-admins uniquement.' });
    return false;
  }
  return true;
}

export const getProspectionInboxStatusHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  res.json({
    configured: isProspectionImapConfigured(),
    webmailUrl: config.prospection.webmailUrl,
    imapUser: config.prospection.imap.user || null,
  });
};

export const listProspectionInboxHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const unhandledOnly = req.query.unhandledOnly === 'true';

  const result = await listProspectionInboxMessages({ page, limit, unhandledOnly });
  res.json(result);
};

export const syncProspectionInboxHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  try {
    const stats = await syncProspectionInbox();
    res.json({
      message: `${stats.imported} nouveau(x) message(s) importé(s)`,
      ...stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur synchronisation';
    res.status(500).json({ message });
  }
};

export const markProspectionInboxRepliedHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  if (!assertSuperAdmin(req, res)) return;

  try {
    const result = await markInboxMessageAsReplied(req.params.id);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    const status = message.includes('introuvable') ? 404 : 400;
    res.status(status).json({ message });
  }
};
