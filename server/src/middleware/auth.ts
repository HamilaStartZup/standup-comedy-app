import { Request, Response, NextFunction } from 'express';
import jwt, { TokenExpiredError } from 'jsonwebtoken';
import { config } from '../config/env';
import { UserModel } from '../models/User';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Accept token from HttpOnly cookie (OAuth) or Authorization Bearer header (email/password)
    const cookieToken = (req as any).cookies?.auth_token as string | undefined;
    const authHeader = req.headers.authorization;

    let token: string | undefined;

    if (cookieToken) {
      token = cookieToken;
    } else if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer' && parts[1]) {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        message: 'Credentials missing or invalid'
      });
    }

    if (!config.jwt.secret) {
      throw new Error('JWT_SECRET is not defined');
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as {
        id: string;
        email: string;
        role: string;
      };

      // Verifier si le compte est actif
      const user = await UserModel.findById(decoded.id).select('isActive');
      if (user && user.isActive === false) {
        return res.status(403).json({
          message: 'Votre compte a ete desactive. Veuillez contacter le support.'
        });
      }

      req.user = decoded;
      next();
    } catch (jwtError) {
      // AUTH_011: Token expired
      if (jwtError instanceof TokenExpiredError) {
        return res.status(401).json({
          message: 'Token has expired'
        });
      }

      // AUTH_009: Invalid token
      return res.status(401).json({
        message: 'Invalid or malformed token'
      });
    }
  } catch (error) {
    // AUTH_009: Invalid token (fallback for unexpected errors)
    return res.status(401).json({
      message: 'Invalid or malformed token'
    });
  }
};

/**
 * Middleware to check user permissions/authorization (AUTH_010)
 */
export const authorizeRoles = (...allowedRoles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = (req as any).user?.role;

      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          message: 'Unauthorized'
        });
      }

      next();
    } catch (error) {
      return res.status(403).json({
        message: 'Unauthorized'
      });
    }
  };
}; 