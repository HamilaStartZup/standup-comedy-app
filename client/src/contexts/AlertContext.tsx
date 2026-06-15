import React, { createContext, useState, useCallback, useRef, useContext } from 'react';
import AlertContainer from '../components/AlertContainer';

// Types d'alertes correspondant au CustomAlert existant
type AlertType = 'success' | 'error' | 'warning' | 'info';

// Mode d'affichage: toast (non-bloquant) vs modal (bloquant)
type AlertMode = 'toast' | 'modal';

interface Alert {
  id: string;
  message: string;
  type: AlertType;
  mode: AlertMode;
  autoDismiss: boolean;
  duration: number;
}

interface AlertOptions {
  type?: AlertType;
  mode?: AlertMode;
  autoDismiss?: boolean;
  duration?: number;
}

interface AlertContextType {
  alerts: Alert[];
  showAlert: (message: string, options?: AlertOptions) => string;
  showSuccess: (message: string, options?: Omit<AlertOptions, 'type'>) => string;
  showError: (message: string, options?: Omit<AlertOptions, 'type'>) => string;
  showWarning: (message: string, options?: Omit<AlertOptions, 'type'>) => string;
  showInfo: (message: string, options?: Omit<AlertOptions, 'type'>) => string;
  dismissAlert: (id: string) => void;
  dismissAll: () => void;
}

// Valeurs par défaut
const DEFAULT_OPTIONS: Required<Omit<AlertOptions, 'type'>> & { type: AlertType } = {
  type: 'info',
  mode: 'toast',
  autoDismiss: true,
  duration: 4000,
};

// Comportements par défaut selon le type
const TYPE_DEFAULTS: Record<AlertType, Partial<AlertOptions>> = {
  success: { autoDismiss: true, duration: 3000 },
  error: { autoDismiss: false },
  warning: { autoDismiss: true, duration: 5000 },
  info: { autoDismiss: true, duration: 4000 },
};

export const AlertContext = createContext<AlertContextType | undefined>(undefined);

interface AlertProviderProps {
  children: React.ReactNode;
}

export const AlertProvider: React.FC<AlertProviderProps> = ({ children }) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const generateId = (): string => `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const dismissAlert = useCallback((id: string) => {
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current.clear();
    setAlerts([]);
  }, []);

  const showAlert = useCallback((message: string, options: AlertOptions = {}): string => {
    const id = generateId();
    const type = options.type || DEFAULT_OPTIONS.type;
    const typeDefaults = TYPE_DEFAULTS[type];

    const alert: Alert = {
      id,
      message,
      type,
      mode: options.mode ?? typeDefaults.mode ?? DEFAULT_OPTIONS.mode,
      autoDismiss: options.autoDismiss ?? typeDefaults.autoDismiss ?? DEFAULT_OPTIONS.autoDismiss,
      duration: options.duration ?? typeDefaults.duration ?? DEFAULT_OPTIONS.duration,
    };

    setAlerts(prev => {
      // Limiter à 5 alertes maximum (FIFO)
      const newAlerts = [...prev, alert];
      if (newAlerts.length > 5) {
        const removedAlert = newAlerts.shift();
        if (removedAlert) {
          const timeout = timeoutRefs.current.get(removedAlert.id);
          if (timeout) {
            clearTimeout(timeout);
            timeoutRefs.current.delete(removedAlert.id);
          }
        }
      }
      return newAlerts;
    });

    if (alert.autoDismiss) {
      const timeout = setTimeout(() => {
        dismissAlert(id);
      }, alert.duration);
      timeoutRefs.current.set(id, timeout);
    }

    return id;
  }, [dismissAlert]);

  const showSuccess = useCallback(
    (message: string, options?: Omit<AlertOptions, 'type'>) =>
      showAlert(message, { ...options, type: 'success' }),
    [showAlert]
  );

  const showError = useCallback(
    (message: string, options?: Omit<AlertOptions, 'type'>) =>
      showAlert(message, { ...options, type: 'error' }),
    [showAlert]
  );

  const showWarning = useCallback(
    (message: string, options?: Omit<AlertOptions, 'type'>) =>
      showAlert(message, { ...options, type: 'warning' }),
    [showAlert]
  );

  const showInfo = useCallback(
    (message: string, options?: Omit<AlertOptions, 'type'>) =>
      showAlert(message, { ...options, type: 'info' }),
    [showAlert]
  );

  const contextValue: AlertContextType = {
    alerts,
    showAlert,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    dismissAlert,
    dismissAll,
  };

  return (
    <AlertContext.Provider value={contextValue}>
      {children}
      <AlertContainer alerts={alerts} onDismiss={dismissAlert} />
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};
