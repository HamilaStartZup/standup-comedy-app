import api from './api';

const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 600;

const OAUTH_RETURN_CONTEXT_KEY = 'oauth_return_context';
const OAUTH_PENDING_REGISTRATION_KEY = 'oauth_pending_registration';

export interface OAuthTokens {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  pendingRegistration?: boolean;
  pendingCode?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  userType?: string;
}

export interface OAuthPendingRegistration {
  pendingCode: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  userType?: string;
}

interface OAuthReturnContext {
  returnPath: string;
  userType?: string;
  provider?: string;
}

interface OAuthStatus {
  enabled: boolean;
  provider: string;
}

/** Détecte smartphone / tablette — popup OAuth peu fiable sur ces appareils. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  return navigator.maxTouchPoints > 1 && window.innerWidth < 1024;
}

export function saveOAuthReturnContext(context: OAuthReturnContext): void {
  sessionStorage.setItem(OAUTH_RETURN_CONTEXT_KEY, JSON.stringify(context));
}

export function consumeOAuthReturnContext(): OAuthReturnContext | null {
  const raw = sessionStorage.getItem(OAUTH_RETURN_CONTEXT_KEY);
  sessionStorage.removeItem(OAUTH_RETURN_CONTEXT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OAuthReturnContext;
  } catch {
    return null;
  }
}

export function saveOAuthPendingRegistration(data: OAuthPendingRegistration): void {
  sessionStorage.setItem(OAUTH_PENDING_REGISTRATION_KEY, JSON.stringify(data));
}

export function consumeOAuthPendingRegistration(expectedUserType: string): OAuthPendingRegistration | null {
  const raw = sessionStorage.getItem(OAUTH_PENDING_REGISTRATION_KEY);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as OAuthPendingRegistration;
    if (pending.userType && pending.userType !== expectedUserType) {
      return null;
    }
    sessionStorage.removeItem(OAUTH_PENDING_REGISTRATION_KEY);
    return pending;
  } catch {
    return null;
  }
}

export function getRegisterPathForUserType(userType?: string): string {
  if (userType === 'SPECTATOR') return '/register/spectateur';
  if (userType === 'ORGANIZER') return '/register/organisateur';
  return '/register';
}

export function getPathForRole(role: string): string {
  if (role === 'ORGANIZER' || role === 'SUPER_ADMIN') return '/dashboard';
  if (role === 'COMEDIAN') return '/profile/comedian';
  if (role === 'SPECTATOR') return '/spectateur';
  if (role === 'LIEU') return '/my-venues-management';
  return '/';
}

const POST_LOGIN_REDIRECT_WHITELIST = new Set(['/aides', '/aides/accueil']);

function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  const pathOnly = path.split('?')[0];
  if (!pathOnly || pathOnly.includes('..')) return false;
  return POST_LOGIN_REDIRECT_WHITELIST.has(pathOnly);
}

/** Après OAuth pleine page : redirige selon le rôle ou le chemin de retour. */
export async function redirectAfterOAuthLogin(): Promise<void> {
  const context = consumeOAuthReturnContext();
  try {
    const response = await api.get<{ role: string }>('/profile/me');
    if (context?.returnPath && isSafeReturnPath(context.returnPath)) {
      window.location.href = context.returnPath;
      return;
    }
    window.location.href = getPathForRole(response.data.role);
  } catch {
    window.location.href = '/login';
  }
}

/**
 * Check if OAuth/Keycloak is enabled on the server
 */
export const checkOAuthStatus = async (): Promise<OAuthStatus> => {
  try {
    const response = await api.get('/auth/oauth/status');
    return response.data;
  } catch (error) {
    return { enabled: false, provider: '' };
  }
};

async function fetchAuthorizationUrl(provider?: string, userType?: string): Promise<string> {
  const params: Record<string, string> = {};
  if (provider) params.provider = provider;
  if (userType) params.userType = userType;
  const response = await api.get('/auth/oauth/authorize', {
    params: Object.keys(params).length > 0 ? params : undefined,
    timeout: 30_000,
  });
  return response.data.authorizationUrl;
}

/**
 * Redirection pleine page (mobile) — la page actuelle est quittée.
 */
async function loginWithKeycloakRedirect(provider?: string, userType?: string): Promise<never> {
  saveOAuthReturnContext({
    returnPath: `${window.location.pathname}${window.location.search}`,
    userType,
    provider,
  });
  const authorizationUrl = await fetchAuthorizationUrl(provider, userType);
  window.location.href = authorizationUrl;
  return new Promise(() => {
    /* navigation en cours */
  });
}

/**
 * Popup OAuth (desktop).
 */
function loginWithKeycloakPopup(provider?: string, userType?: string): Promise<OAuthTokens> {
  return new Promise(async (resolve, reject) => {
    try {
      const authorizationUrl = await fetchAuthorizationUrl(provider, userType);

      const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
      const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;

      const popup = window.open(
        authorizationUrl,
        'keycloak-login',
        `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        reject(new Error('Popup blocked. Please allow popups for this site.'));
        return;
      }

      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data.type === 'oauth-callback') {
          window.removeEventListener('message', messageHandler);
          clearInterval(checkPopupClosed);

          if (event.data.error) {
            reject(new Error(event.data.error_description || event.data.error));
          } else if (event.data.pendingRegistration) {
            resolve({
              pendingRegistration: true,
              pendingCode: event.data.pendingCode,
              email: event.data.email,
              firstName: event.data.firstName,
              lastName: event.data.lastName,
              userType: event.data.userType,
            });
          } else {
            resolve({
              access_token: event.data.access_token,
              refresh_token: event.data.refresh_token,
              id_token: event.data.id_token,
            });
          }

          popup.close();
        }
      };

      window.addEventListener('message', messageHandler);

      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed);
          window.removeEventListener('message', messageHandler);
          reject(new Error('Login cancelled'));
        }
      }, 500);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * OAuth Keycloak — popup sur desktop, redirection pleine page sur mobile.
 */
export const loginWithKeycloak = (provider?: string, userType?: string): Promise<OAuthTokens> => {
  if (isMobileDevice()) {
    return loginWithKeycloakRedirect(provider, userType);
  }
  return loginWithKeycloakPopup(provider, userType);
};

/**
 * Refresh the access token using refresh token
 */
export const refreshToken = async (refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> => {
  const response = await api.post('/auth/oauth/refresh', {
    refresh_token: refreshToken,
  });
  return response.data;
};

/**
 * Get logout URL from server
 */
export const getLogoutUrl = async (idToken?: string): Promise<string> => {
  const response = await api.post('/auth/oauth/logout', {
    id_token: idToken,
  });
  return response.data.logoutUrl;
};

/**
 * Logout from Keycloak (opens logout URL in new tab or redirects)
 */
export const logoutFromKeycloak = async (idToken?: string, redirect = false): Promise<void> => {
  try {
    const logoutUrl = await getLogoutUrl(idToken);

    if (redirect) {
      window.location.href = logoutUrl;
      return;
    }

    await new Promise<void>((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = logoutUrl;

      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        resolve();
      };

      iframe.onload = cleanup;
      iframe.onerror = cleanup;
      setTimeout(cleanup, 3000);

      document.body.appendChild(iframe);
    });
  } catch (error) {
    console.error('Keycloak logout error:', error);
  }
};

let _inMemoryAccessToken: string | undefined;
let _inMemoryRefreshToken: string | undefined;
let _inMemoryIdToken: string | undefined;

export const storeOAuthTokens = (tokens: OAuthTokens): void => {
  if (tokens.access_token) {
    _inMemoryAccessToken = tokens.access_token;
  }

  if (tokens.refresh_token) {
    _inMemoryRefreshToken = tokens.refresh_token;
  }

  if (tokens.id_token) {
    _inMemoryIdToken = tokens.id_token;
  }
};

export const clearOAuthTokens = (): void => {
  _inMemoryAccessToken = undefined;
  _inMemoryRefreshToken = undefined;
  _inMemoryIdToken = undefined;
};

export const getStoredOAuthTokens = (): Partial<OAuthTokens> => {
  return {
    access_token: _inMemoryAccessToken,
    refresh_token: _inMemoryRefreshToken,
    id_token: _inMemoryIdToken,
  };
};

/**
 * Translate OAuth error messages to French
 */
export const translateOAuthError = (error: string): string => {
  const errorMessages: Record<string, string> = {
    'account_not_found': 'Aucun compte trouvé avec cet email. Veuillez d\'abord créer un compte.',
    'account_mismatch': 'Ce compte est déjà lié à un autre identifiant. Contactez le support.',
    'invalid_state': 'Session expirée. Veuillez réessayer.',
    'userinfo_failed': 'Impossible de récupérer vos informations. Veuillez réessayer.',
    'token_exchange_failed': 'Erreur d\'authentification. Veuillez réessayer.',
    'too_many_requests': 'Trop de tentatives. Veuillez réessayer dans une minute.',
    'Login cancelled': 'Connexion annulée.',
    'Popup blocked': 'Popup bloquée. Veuillez autoriser les popups pour ce site.',
    'No token received': 'Aucun token reçu. Veuillez réessayer.',
    'exchange_failed': 'Erreur lors de la finalisation de la connexion. Veuillez réessayer.',
    'auth_failed': 'Une erreur est survenue lors de l\'authentification. Veuillez réessayer.',
  };

  if (errorMessages[error]) {
    return errorMessages[error];
  }

  for (const [key, message] of Object.entries(errorMessages)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return message;
    }
  }

  return error || 'Une erreur est survenue lors de la connexion.';
};
