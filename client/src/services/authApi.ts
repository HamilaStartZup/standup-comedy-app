import axios from 'axios';
import api from './api';

/** Délai généreux pour connexions mobiles lentes (ex. Afrique, 3G/4G instable). */
export const AUTH_REQUEST_TIMEOUT_MS = 90_000;

const AUTH_RETRY_DELAY_MS = 3_000;

function isRetryableNetworkError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return !error.response && error.code !== 'ERR_CANCELED';
}

async function withNetworkRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isRetryableNetworkError(error)) {
      await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAY_MS));
      return fn();
    }
    throw error;
  }
}

export async function registerUser(data: unknown) {
  return withNetworkRetry(() =>
    api.post('/auth/register', data, { timeout: AUTH_REQUEST_TIMEOUT_MS })
  );
}

export async function loginUser(data: unknown) {
  return withNetworkRetry(() =>
    api.post('/auth/login', data, { timeout: AUTH_REQUEST_TIMEOUT_MS })
  );
}

/** Réveille le serveur avant une inscription (évite cold start sur connexions lentes). */
export async function warmupAuthServer(): Promise<void> {
  try {
    const apiBase = api.defaults.baseURL?.replace(/\/api\/?$/, '');
    if (!apiBase) return;
    await axios.get(`${apiBase}/health`, { timeout: 15_000 });
  } catch {
    // Non bloquant — l'inscription peut quand même réussir
  }
}
