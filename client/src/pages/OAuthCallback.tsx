import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import {
  storeOAuthTokens,
  saveOAuthPendingRegistration,
  getRegisterPathForUserType,
  redirectAfterOAuthLogin,
  translateOAuthError,
} from '../services/oauth';

/**
 * Page de retour OAuth (popup desktop ou redirection mobile).
 */
const OAuthCallback = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPopup] = useState(() => typeof window !== 'undefined' && Boolean(window.opener));

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const isPopupFlow = Boolean(window.opener);

      window.history.replaceState({}, document.title, '/auth/callback');

      const error = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');

      if (error) {
        if (isPopupFlow) {
          window.opener.postMessage(
            { type: 'oauth-callback', error, error_description: errorDescription },
            window.location.origin
          );
          setTimeout(() => window.close(), 100);
        } else {
          setStatus('error');
          setErrorMessage(translateOAuthError(errorDescription || error));
        }
        return;
      }

      const code = urlParams.get('code');

      if (!code) {
        setStatus('error');
        setErrorMessage('Aucun code d\'autorisation reçu.');
        return;
      }

      try {
        const response = await api.post('/auth/oauth/exchange', { code }, { timeout: 60_000 });

        if (response.data.pendingRegistration) {
          const { pendingCode, email, firstName, lastName, userType } = response.data;

          if (isPopupFlow) {
            window.opener.postMessage(
              { type: 'oauth-callback', pendingRegistration: true, pendingCode, email, firstName, lastName, userType },
              window.location.origin
            );
            setStatus('success');
            setTimeout(() => window.close(), 100);
          } else {
            saveOAuthPendingRegistration({ pendingCode, email, firstName, lastName, userType });
            window.location.href = getRegisterPathForUserType(userType);
          }
          return;
        }

        const { access_token, refresh_token, id_token } = response.data;
        storeOAuthTokens({ access_token, refresh_token, id_token });

        if (isPopupFlow) {
          window.opener.postMessage(
            { type: 'oauth-callback', access_token, refresh_token, id_token },
            window.location.origin
          );
          setStatus('success');
          setTimeout(() => window.close(), 100);
        } else {
          setStatus('success');
          await redirectAfterOAuthLogin();
        }
      } catch (err: unknown) {
        const axiosError = err as { response?: { data?: { error?: string } } };
        const message = axiosError.response?.data?.error || 'exchange_failed';

        if (isPopupFlow) {
          window.opener.postMessage(
            { type: 'oauth-callback', error: message },
            window.location.origin
          );
          setTimeout(() => window.close(), 100);
        } else {
          setStatus('error');
          setErrorMessage(translateOAuthError(message));
        }
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600 mx-auto mb-4" />
            <p className="text-gray-600">Authentification en cours…</p>
            <p className="text-sm text-gray-400 mt-2">
              {isPopup ? 'Cette fenêtre va se fermer automatiquement.' : 'Redirection en cours…'}
            </p>
          </>
        )}
        {status === 'success' && (
          <p className="text-green-600">Authentification réussie !</p>
        )}
        {status === 'error' && (
          <>
            <p className="text-red-600 font-medium">Erreur d'authentification</p>
            <p className="text-sm text-gray-500 mt-2">{errorMessage}</p>
            <Link
              to="/login"
              className="inline-block mt-6 text-violet-600 font-semibold hover:underline"
            >
              Retour à la connexion
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallback;
