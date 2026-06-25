import { useCallback, useRef, useState } from 'react';

const SLOW_CONNECTION_DELAY_MS = 5_000;

export const SLOW_CONNECTION_MESSAGE =
  'Connexion lente détectée — la création du compte peut prendre un peu plus de temps. Ne fermez pas cette page.';

/**
 * Empêche le double-submit (fréquent sur mobile) et signale les connexions lentes.
 */
export function useRegisterSubmitGuard() {
  const lockRef = useRef(false);
  const [slowConnection, setSlowConnection] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const runSubmit = useCallback(async (fn: () => Promise<void>) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setIsLocked(true);
    const slowTimer = setTimeout(() => setSlowConnection(true), SLOW_CONNECTION_DELAY_MS);
    try {
      await fn();
    } finally {
      clearTimeout(slowTimer);
      setSlowConnection(false);
      lockRef.current = false;
      setIsLocked(false);
    }
  }, []);

  return { runSubmit, slowConnection, isLocked };
}
