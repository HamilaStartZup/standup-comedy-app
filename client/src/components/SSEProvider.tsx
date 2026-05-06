import React, { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSSE, type SSEConnectionStatus } from '../hooks/useSSE';
import { createSSEEventHandler } from '../services/sseEventHandler';
import { useAuth } from '../contexts/AuthContext';

interface SSEProviderProps {
  children: React.ReactNode;
  showConnectionStatus?: boolean; // Afficher un indicateur de statut (optionnel)
}

/**
 * Provider SSE qui initialise la connexion Server-Sent Events
 * et gère les évènements en temps réel
 *
 * Ce composant doit être placé après AuthProvider et QueryClientProvider
 * dans l'arborescence des composants.
 */
export const SSEProvider: React.FC<SSEProviderProps> = ({
  children,
  showConnectionStatus = false
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Créer le handler d'évènements avec le queryClient
  const eventHandler = useMemo(
    () => createSSEEventHandler(queryClient),
    [queryClient]
  );

  // Désactiver SSE sur les pages publiques (login, register, forgot-password, etc.)
  const currentPath = window.location.pathname;
  const isPublicPage = ['/login', '/register', '/register/spectateur', '/organisateur', '/forgot-password', '/reset-password', '/'].includes(currentPath);
  const shouldEnableSSE = !!user && !isPublicPage;

  // Établir la connexion SSE uniquement si nécessaire
  // Le cookie HttpOnly auth_token est envoyé automatiquement par le navigateur
  const status = useSSE(eventHandler, shouldEnableSSE);

  return (
    <>
      {children}
      {showConnectionStatus && <SSEStatusIndicator status={status} />}
    </>
  );
};

/**
 * Indicateur visuel du statut de la connexion SSE (optionnel)
 */
interface SSEStatusIndicatorProps {
  status: SSEConnectionStatus;
}

const SSEStatusIndicator: React.FC<SSEStatusIndicatorProps> = ({ status }) => {
  if (status === 'connected' || status === 'disconnected') {
    // Ne pas afficher d'indicateur si tout va bien ou si non connecté normalement
    return null;
  }

  const getStatusInfo = () => {
    switch (status) {
      case 'connecting':
        return {
          text: 'Connexion en temps réel...',
          color: 'bg-yellow-500',
          icon: '🔄'
        };
      case 'error':
        return {
          text: 'Erreur de connexion temps réel',
          color: 'bg-red-500',
          icon: '⚠️'
        };
      default:
        return null;
    }
  };

  const statusInfo = getStatusInfo();
  if (!statusInfo) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className={`${statusInfo.color} text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2`}>
        <span>{statusInfo.icon}</span>
        <span className="text-sm font-medium">{statusInfo.text}</span>
      </div>
    </div>
  );
};
