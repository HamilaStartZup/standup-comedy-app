import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import {
  validateUnsubscribeToken,
  decodeUnsubscribeToken
} from '../utils/unsubscribeToken';
import { AuthRequest } from '../middleware/auth';

/**
 * POST /api/email/unsubscribe
 * RFC 8058 One-Click Unsubscribe
 *
 * Query params: token, userId, email
 * Body: List-Unsubscribe=One-Click (application/x-www-form-urlencoded)
 *
 * IMPORTANT: Doit répondre en < 2 secondes (exigence RFC 8058)
 */
export const handleOneClickUnsubscribe = async (
  req: Request,
  res: Response
): Promise<void> => {
  const startTime = Date.now();

  try {
    // Vérifier le body RFC 8058
    if (req.body['List-Unsubscribe'] !== 'One-Click') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Expected List-Unsubscribe=One-Click in request body'
      });
      return;
    }

    // Extraire les paramètres de l'URL
    const { token, userId, email } = req.query;

    // Validation des paramètres
    if (!token || !userId || !email ||
        typeof token !== 'string' ||
        typeof userId !== 'string' ||
        typeof email !== 'string') {
      res.status(400).json({
        error: 'Missing parameters',
        message: 'token, userId, and email query parameters are required'
      });
      return;
    }

    // Valider le token HMAC
    if (!validateUnsubscribeToken(token, userId, email)) {
      console.warn(`⚠️ Invalid unsubscribe token for ${email}`);
      res.status(400).json({
        error: 'Invalid token',
        message: 'The unsubscribe token is invalid or has expired'
      });
      return;
    }

    // Trouver l'utilisateur
    const user = await UserModel.findOne({ _id: userId, email: email.toLowerCase() });

    if (!user) {
      // Toujours renvoyer 200 OK pour ne pas leak d'infos sur les utilisateurs
      console.warn(`⚠️ Unsubscribe attempt for non-existent user: ${email}`);
      res.status(200).json({
        message: 'Unsubscribe request processed',
        subscribed: false
      });
      return;
    }

    // Désabonner l'utilisateur (idempotent)
    const wasAlreadyUnsubscribed = user.emailSubscriptions?.globalSubscribed === false;

    user.emailSubscriptions = {
      globalSubscribed: false,
      unsubscribedAt: wasAlreadyUnsubscribed ? user.emailSubscriptions.unsubscribedAt : new Date(),
      unsubscribeToken: token
    };

    await user.save();

    // Log de l'action
    const elapsed = Date.now() - startTime;
    console.log(
      `✅ ${wasAlreadyUnsubscribed ? 'Already unsubscribed' : 'Unsubscribed'}: ${email} (${elapsed}ms)`
    );

    // Réponse 200 OK (RFC 8058 - pas de redirection pour POST)
    res.status(200).json({
      message: 'You have been successfully unsubscribed from all emails',
      subscribed: false
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Error processing unsubscribe (${elapsed}ms):`, error);

    // Toujours renvoyer 200 pour ne pas leak d'erreurs
    res.status(200).json({
      message: 'Unsubscribe request processed',
      subscribed: false
    });
  }
};

/**
 * GET /api/email/unsubscribe
 * Page de confirmation HTML pour les clients email qui ne supportent pas POST
 *
 * Query params: token, userId, email
 */
export const handleUnsubscribeConfirmation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token, userId, email } = req.query;

    // Validation des paramètres
    if (!token || !userId || !email ||
        typeof token !== 'string' ||
        typeof userId !== 'string' ||
        typeof email !== 'string') {
      res.status(400).send(generateErrorPage(
        'Invalid Unsubscribe Link',
        'The unsubscribe link is missing required parameters.'
      ));
      return;
    }

    // Valider le token
    const decoded = decodeUnsubscribeToken(token, userId, email);

    if (!decoded) {
      res.status(400).send(generateErrorPage(
        'Invalid Token',
        'The unsubscribe token is invalid or has expired. Please contact support if you need assistance.'
      ));
      return;
    }

    // Désabonner l'utilisateur (même logique que POST)
    const user = await UserModel.findOne({ _id: userId, email: email.toLowerCase() });

    if (user) {
      const wasAlreadyUnsubscribed = user.emailSubscriptions?.globalSubscribed === false;

      user.emailSubscriptions = {
        globalSubscribed: false,
        unsubscribedAt: wasAlreadyUnsubscribed ? user.emailSubscriptions.unsubscribedAt : new Date(),
        unsubscribeToken: token
      };
      await user.save();

      console.log(`✅ Unsubscribed via GET: ${email}`);
    }

    // Page de confirmation HTML
    res.status(200).send(generateSuccessPage(email));

  } catch (error) {
    console.error('❌ Error in GET unsubscribe:', error);
    res.status(500).send(generateErrorPage(
      'An Error Occurred',
      'We encountered an error processing your request. Please try again later.'
    ));
  }
};

/**
 * POST /api/email/resubscribe
 * Permet à un utilisateur authentifié de se réabonner
 *
 * Requiert: JWT Bearer token
 */
export const handleResubscribe = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    const user = await UserModel.findById(req.user.id);

    if (!user) {
      res.status(404).json({
        error: 'User not found',
        message: 'User account not found'
      });
      return;
    }

    // Réabonner
    user.emailSubscriptions = {
      globalSubscribed: true,
      unsubscribedAt: undefined,
      unsubscribeToken: undefined
    };

    await user.save();

    console.log(`✅ Resubscribed: ${user.email}`);

    res.status(200).json({
      message: 'You have been successfully resubscribed to emails',
      subscribed: true
    });

  } catch (error) {
    console.error('❌ Error resubscribing:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while resubscribing'
    });
  }
};

/**
 * GET /api/email/subscription-status
 * Obtenir le statut d'abonnement de l'utilisateur authentifié
 *
 * Requiert: JWT Bearer token
 */
export const getSubscriptionStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    const user = await UserModel.findById(req.user.id).select('emailSubscriptions email');

    if (!user) {
      res.status(404).json({
        error: 'User not found',
        message: 'User account not found'
      });
      return;
    }

    res.status(200).json({
      subscribed: user.emailSubscriptions?.globalSubscribed ?? true,
      unsubscribedAt: user.emailSubscriptions?.unsubscribedAt || null,
      email: user.email
    });

  } catch (error) {
    console.error('❌ Error fetching subscription status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while fetching subscription status'
    });
  }
};

// ===== HELPER FUNCTIONS POUR HTML =====

function generateSuccessPage(email: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Désabonnement Réussi</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 12px;
        }
        .content {
            background: white;
            padding: 40px;
            border-radius: 8px;
            text-align: center;
        }
        h1 { color: #28a745; margin-top: 0; }
        p { color: #666; line-height: 1.6; font-size: 16px; }
        .email { font-weight: bold; color: #333; }
        .info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            margin-top: 20px;
            font-size: 14px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="content">
        <h1>✅ Désabonnement Réussi</h1>
        <p>Vous avez été désabonné de tous les emails de <strong>Connect Comedy Club</strong>.</p>
        <p class="email">${email}</p>
        <div class="info">
            <p><strong>Note:</strong> Vous ne recevrez plus aucun email de notre plateforme, y compris les notifications d'évènements, candidatures et mises à jour.</p>
            <p>Pour vous réabonner, connectez-vous à votre compte et mettez à jour vos préférences email.</p>
        </div>
    </div>
</body>
</html>`;
}

function generateErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
        }
        .error { color: #dc3545; }
    </style>
</head>
<body>
    <h1 class="error">${title}</h1>
    <p>${message}</p>
</body>
</html>`;
}
