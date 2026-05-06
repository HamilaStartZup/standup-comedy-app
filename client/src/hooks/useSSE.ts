import { useEffect, useRef, useState, useCallback } from 'react';

// Type pour le statut de la connexion SSE
export type SSEConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Type pour les évènements SSE
export interface SSEEvent {
  type: string;
  data: Record<string, any>;
  timestamp: string;
}

// Type pour le handler d'évènements
export type SSEEventHandler = (event: SSEEvent) => void;

/**
 * Hook personnalisé pour gérer la connexion Server-Sent Events
 *
 * L'authentification se fait via le cookie HttpOnly auth_token
 * envoyé automatiquement par le navigateur (même origine).
 *
 * @param onEvent - Callback appelé lors de la réception d'un évènement
 * @param enabled - Active/désactive la connexion SSE (par défaut: true)
 * @returns Le statut de la connexion
 */
export const useSSE = (
  onEvent?: SSEEventHandler,
  enabled: boolean = true
): SSEConnectionStatus => {
  const [status, setStatus] = useState<SSEConnectionStatus>('disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isUnmountingRef = useRef<boolean>(false);

  // Constantes de reconnexion
  const MAX_RECONNECT_DELAY = 30000; // 30 secondes max
  const INITIAL_RECONNECT_DELAY = 1000; // 1 seconde au départ

  /**
   * Calcule le délai de reconnexion avec backoff exponentiel
   */
  const getReconnectDelay = useCallback((): number => {
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current),
      MAX_RECONNECT_DELAY
    );
    return delay;
  }, []);

  /**
   * Nettoie la connexion SSE et les timeouts
   */
  const cleanup = useCallback(() => {
    console.log('🧹 [SSE] Nettoyage de la connexion');

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Connecte au flux SSE
   */
  const connect = useCallback(() => {
    // Ne pas se connecter si désactivé
    if (!enabled) {
      console.log('⏸️ [SSE] Connexion désactivée');
      setStatus('disconnected');
      return;
    }

    // Ne pas se connecter si déjà connecté
    if (eventSourceRef.current && eventSourceRef.current.readyState !== EventSource.CLOSED) {
      console.log('⏸️ [SSE] Déjà connecté');
      return;
    }

    // Ne pas se connecter si en train de démontage
    if (isUnmountingRef.current) {
      console.log('⏸️ [SSE] Composant en cours de démontage');
      return;
    }

    console.log('🔌 [SSE] Tentative de connexion...');
    setStatus('connecting');

    // Déterminer l'URL de base selon l'environnement (CRA -> process.env)
    const baseUrl = process.env.REACT_APP_API_URL ||
      (process.env.NODE_ENV === 'production'
    ? 'https://connectcomedyclub.com/api'
    : process.env.NODE_ENV === 'test'
      ? 'https://test.connectcomedyclub.com/api'
      : 'http://localhost:3001/api');

    const url = `${baseUrl}/sse/stream`;

    try {
      const eventSource = new EventSource(url, { withCredentials: true });
      eventSourceRef.current = eventSource;

      // Évènement de connexion établie
      eventSource.addEventListener('CONNECTED', (e) => {
        console.log('✅ [SSE] Connexion établie', e.data);
        setStatus('connected');
        reconnectAttemptsRef.current = 0; // Reset le compteur de tentatives
      });

      // Évènements génériques
      eventSource.addEventListener('message', (e) => {
        try {
          const event: SSEEvent = JSON.parse(e.data);
          console.log('📨 [SSE] Évènement reçu:', event.type, event.data);
          if (onEvent) {
            onEvent(event);
          }
        } catch (error) {
          console.error('❌ [SSE] Erreur de parsing:', error);
        }
      });

      // Écouter tous les types d'évènements personnalisés
      const eventTypes = [
        'EVENT_CREATED', 'EVENT_UPDATED', 'EVENT_DELETED', 'EVENT_COMPLETED',
        'APPLICATION_CREATED', 'APPLICATION_STATUS_CHANGED', 'APPLICATION_WITHDRAWN',
        'ABSENCE_MARKED', 'ABSENCE_CANCELLED',
        'FAVORITE_COMEDIAN_ADDED', 'FAVORITE_COMEDIAN_REMOVED',
        'EVENT_FAVORITE_ADDED', 'EVENT_FAVORITE_REMOVED',
        'PROFILE_UPDATED', 'USER_REGISTERED', 'PASSWORD_RESET',
        'VENUE_BOOKING_STATUS_CHANGED', 'VENUE_BOOKING_PAYMENT_UPDATED'
      ];

      eventTypes.forEach(eventType => {
        eventSource.addEventListener(eventType, (e: Event) => {
          try {
            const messageEvent = e as MessageEvent;
            const event: SSEEvent = JSON.parse(messageEvent.data);
            console.log(`📨 [SSE] ${eventType}:`, event.data);
            if (onEvent) {
              onEvent(event);
            }
          } catch (error) {
            console.error(`❌ [SSE] Erreur de parsing pour ${eventType}:`, error);
          }
        });
      });

      // Gérer les erreurs
      eventSource.onerror = (error) => {
        console.error('❌ [SSE] Erreur de connexion:', error);
        setStatus('error');
        eventSource.close();
        eventSourceRef.current = null;

        // Tentative de reconnexion automatique
        if (!isUnmountingRef.current) {
          reconnectAttemptsRef.current++;
          const delay = getReconnectDelay();
          console.log(`🔄 [SSE] Reconnexion dans ${delay}ms (tentative ${reconnectAttemptsRef.current})...`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      // Évènement d'ouverture
      eventSource.onopen = () => {
        console.log('🔓 [SSE] Connexion ouverte');
      };

    } catch (error) {
      console.error('❌ [SSE] Erreur lors de la création de EventSource:', error);
      setStatus('error');
    }
  }, [enabled, onEvent, getReconnectDelay]);

  // Effet principal : gérer la connexion
  useEffect(() => {
    isUnmountingRef.current = false;

    if (enabled) {
      connect();
    } else {
      cleanup();
      setStatus('disconnected');
    }

    // Cleanup lors du démontage
    return () => {
      isUnmountingRef.current = true;
      cleanup();
      setStatus('disconnected');
    };
  }, [enabled, connect, cleanup]);

  // Reconnecter lors du retour en ligne
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 [SSE] Connexion réseau rétablie, reconnexion...');
      reconnectAttemptsRef.current = 0; // Reset les tentatives
      cleanup();
      connect();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [connect, cleanup]);

  return status;
};
