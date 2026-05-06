import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { sseManager } from '../services/sseManager';
import { config } from '../config/env';

const router = Router();

/**
 * Endpoint SSE pour établir une connexion de streaming d'évènements
 * GET /api/sse/stream
 * Authentification via cookie HttpOnly auth_token
 */
router.get('/stream', async (req: Request, res: Response) => {
  try {
    // Récupérer le token depuis le cookie HttpOnly (cookie-parser augmente req avec .cookies)
    const token = req.cookies?.auth_token as string | undefined;

    if (!token) {
      return res.status(401).json({
        message: 'Token requis pour la connexion SSE'
      });
    }

    // Vérifier et décoder le JWT
    let decoded: any;
    try {
      if (!config.jwt.secret) {
        throw new Error('JWT secret non configuré');
      }
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (error) {
      return res.status(401).json({
        message: 'Token invalide ou expiré'
      });
    }

    const userId = decoded.id;

    if (!userId) {
      return res.status(401).json({
        message: 'Token invalide'
      });
    }

    // Configurer les headers pour SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Pour nginx

    // Désactiver la compression pour SSE
    res.setHeader('Content-Encoding', 'none');

    // Générer un ID unique pour ce client
    const clientId = uuidv4();

    console.log(`🔌 Nouvelle connexion SSE: Client ${clientId}, Utilisateur ${userId}`);

    // Ajouter le client au SSEManager
    const added = sseManager.addClient(clientId, userId, res);

    if (!added) {
      return res.status(503).json({
        message: 'Impossible d\'établir la connexion SSE. Limite de connexions atteinte.'
      });
    }

    // Gérer la déconnexion du client
    req.on('close', () => {
      console.log(`🔌 Déconnexion SSE: Client ${clientId}`);
      sseManager.removeClient(clientId);
    });

    // Gérer les erreurs
    res.on('error', (error) => {
      console.error(`❌ Erreur SSE pour client ${clientId}:`, error);
      sseManager.removeClient(clientId);
    });

    // La connexion reste ouverte jusqu'à ce que le client se déconnecte
    // Le SSEManager gère les évènements et heartbeats
  } catch (error) {
    console.error('❌ Erreur lors de l\'établissement de la connexion SSE:', error);
    res.status(500).json({
      message: 'Erreur lors de l\'établissement de la connexion SSE'
    });
  }
});

/**
 * Endpoint pour obtenir les statistiques SSE (pour debug/monitoring)
 * GET /api/sse/stats
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = sseManager.getStats();
    res.json({
      success: true,
      stats: {
        ...stats,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des stats SSE:', error);
    res.status(500).json({
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

export default router;
