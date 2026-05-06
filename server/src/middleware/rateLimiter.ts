import { Request, Response, NextFunction } from 'express';

/**
 * Rate limiter simple en mémoire
 * Pour production: remplacer par express-rate-limit avec Redis
 */
class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Nettoyage automatique toutes les heures
    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];

    // Filtrer les requêtes dans la fenêtre temporelle
    const validRequests = userRequests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    // Vérifier le quota
    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Ajouter la nouvelle requête
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    return true;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(
        t => now - t < this.windowMs
      );
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }

  reset(identifier: string) {
    this.requests.delete(identifier);
  }
}

// Instance globale: 20 requêtes par heure par IP
const unsubscribeLimiter = new InMemoryRateLimiter(
  60 * 60 * 1000, // 1 heure
  20 // 20 requêtes max
);

// Instance OAuth: 10 requêtes par minute par IP
const oauthLimiter = new InMemoryRateLimiter(
  60 * 1000, // 1 minute
  10 // 10 requêtes max
);

/**
 * Middleware de rate limiting pour les endpoints de désabonnement
 * Limite: 20 requêtes par IP par heure
 */
export const unsubscribeRateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Identifier par IP — req.ip respecte le trust proxy d'Express
  // Ne jamais utiliser x-forwarded-for brut (forgeable par l'attaquant)
  const identifier = req.ip || req.socket.remoteAddress || 'unknown';

  if (!unsubscribeLimiter.isAllowed(identifier)) {
    console.warn(`⚠️ Rate limit exceeded for IP: ${identifier}`);

    return res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: 3600 // 1 heure en secondes
    });
  }

  next();
};

/**
 * Middleware de rate limiting pour les endpoints OAuth
 * Limite: 10 requêtes par IP par minute
 */
export const oauthRateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const identifier = req.ip || req.socket.remoteAddress || 'unknown';

  if (!oauthLimiter.isAllowed(identifier)) {
    console.warn(`⚠️ OAuth rate limit exceeded for IP: ${identifier}`);

    return res.status(429).json({
      error: 'too_many_requests',
      message: 'Trop de tentatives. Veuillez réessayer dans une minute.',
      retryAfter: 60
    });
  }

  next();
};

// Export pour tests
export { unsubscribeLimiter, oauthLimiter };
