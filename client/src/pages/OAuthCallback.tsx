import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * OAuth Callback Page
 * This page is loaded in the popup after Keycloak authentication
 * It exchanges a temporary code for tokens via POST (secure)
 */
const OAuthCallback = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);

      // Nettoyer l'URL immédiatement
      window.history.replaceState({}, document.title, '/auth/callback');

      // Check for errors
      const error = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');

      if (error) {
        if (window.opener) {
          window.opener.postMessage(
            { type: 'oauth-callback', error, error_description: errorDescription },
            window.location.origin
          );
          setTimeout(() => window.close(), 100);
        } else {
          setStatus('error');
          setErrorMessage(errorDescription || error);
        }
        return;
      }

      // Get temp code from URL
      const code = urlParams.get('code');

      if (!code) {
        setStatus('error');
        setErrorMessage('No authorization code received');
        return;
      }

      try {
        // Échanger le code contre les tokens (login) ou les infos d'inscription (inscription)
        const response = await api.post('/auth/oauth/exchange', { code });

        if (response.data.pendingRegistration) {
          // Flux inscription : renvoi les infos au parent pour afficher le formulaire
          const { pendingCode, email, firstName, lastName, userType } = response.data;
          if (window.opener) {
            window.opener.postMessage(
              { type: 'oauth-callback', pendingRegistration: true, pendingCode, email, firstName, lastName, userType },
              window.location.origin
            );
            setStatus('success');
            setTimeout(() => window.close(), 100);
          } else {
            window.location.href = '/login';
          }
          return;
        }

        // Flux connexion normal : cookie HttpOnly posé par le serveur lors du /exchange
        const { access_token, refresh_token, id_token } = response.data;

        if (window.opener) {
          window.opener.postMessage(
            { type: 'oauth-callback', access_token, refresh_token, id_token },
            window.location.origin
          );
          setStatus('success');
          setTimeout(() => window.close(), 100);
        } else {
          window.location.href = '/login';
        }
      } catch (err: unknown) {
        setStatus('error');
        const axiosError = err as { response?: { data?: { error?: string } } };
        setErrorMessage(axiosError.response?.data?.error || 'Failed to complete authentication');
        if (window.opener) {
          window.opener.postMessage(
            { type: 'oauth-callback', error: 'exchange_failed' },
            window.location.origin
          );
        }
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Authentification en cours...</p>
            <p className="text-sm text-gray-400 mt-2">Cette fenetre va se fermer automatiquement</p>
          </>
        )}
        {status === 'success' && (
          <p className="text-green-600">Authentification reussie !</p>
        )}
        {status === 'error' && (
          <>
            <p className="text-red-600">Erreur d'authentification</p>
            <p className="text-sm text-gray-500 mt-2">{errorMessage}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
