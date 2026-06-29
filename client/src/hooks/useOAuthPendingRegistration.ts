import { useEffect, useRef } from 'react';
import { consumeOAuthPendingRegistration, type OAuthPendingRegistration } from '../services/oauth';

/**
 * Reprend une inscription OAuth interrompue par redirection mobile (sessionStorage).
 */
export function useOAuthPendingRegistration(
  expectedUserType: string,
  onPending: (data: OAuthPendingRegistration) => void,
) {
  const onPendingRef = useRef(onPending);
  onPendingRef.current = onPending;

  useEffect(() => {
    const pending = consumeOAuthPendingRegistration(expectedUserType);
    if (pending) {
      onPendingRef.current(pending);
    }
  }, [expectedUserType]);
}
