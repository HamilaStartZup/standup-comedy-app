import type { CookieOptions } from 'express';
import { config } from '../config/env';

export const getAuthCookieOptions = (): CookieOptions => {
  const isProduction = config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
  };
};

export const AUTH_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;
