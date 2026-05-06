import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import type { IUserData } from '../types/user';
import axios from 'axios';
import {
  loginWithKeycloak as oauthLogin,
  storeOAuthTokens,
  clearOAuthTokens,
  checkOAuthStatus,
  logoutFromKeycloak,
  getStoredOAuthTokens,
} from '../services/oauth';

interface AuthContextType {
  token: string | null;
  user: IUserData | null;
  setToken: (token: string | null) => void;
  setUser: (user: IUserData | null) => void;
  loginMutation: ReturnType<typeof useMutation>;
  registerMutation: ReturnType<typeof useMutation>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
  loginWithKeycloak: (provider?: string) => Promise<void>;
  isOAuthEnabled: boolean;
  isOAuthLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

// Pages protégées qui doivent rediriger vers /login quand la session expire
const isProtectedPath = (path: string) => {
  const publicPrefixes = [
    '/', '/login', '/organisateur', '/register', '/forgot-password', '/reset-password',
    '/auth/callback', '/mentions-legales', '/politique-confidentialite', '/cgu', '/a-propos',
  ];
  // Exact match for "/" but prefix match for others
  if (path === '/') return false;
  return !publicPrefixes.some(p => p !== '/' && path.startsWith(p));
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  // token is kept in memory only — derived from the HttpOnly cookie via /profile/me
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<IUserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOAuthEnabled, setIsOAuthEnabled] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);
  // Track si l'utilisateur était connecté (pour détecter la perte de session)
  const wasAuthenticated = useRef(false);

  const redirectByRole = useCallback((role: string) => {
    if (role === 'ORGANIZER') navigate('/dashboard');
    else if (role === 'COMEDIAN') navigate('/profile/comedian');
    else if (role === 'SUPER_ADMIN') navigate('/dashboard');
    else if (role === 'SPECTATOR') navigate('/spectateur');
    else if (role === 'LIEU') navigate('/my-venues-management');
    else navigate('/');
  }, [navigate]);

  const logout = useCallback(async () => {
    const { id_token } = getStoredOAuthTokens();

    clearOAuthTokens();
    setToken(null);
    setUser(null);

    // Always clear the HttpOnly cookie via the generic logout endpoint
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Non-blocking
    }

    // If OAuth session, also logout from Keycloak
    if (id_token) {
      try {
        await logoutFromKeycloak(id_token, false);
      } catch (error) {
        console.error('Keycloak logout error:', error);
      }
    }

    navigate('/');
  }, [navigate]);

  const loginWithKeycloak = useCallback(async (provider?: string) => {
    setIsOAuthLoading(true);
    try {
      const tokens = await oauthLogin(provider);
      storeOAuthTokens(tokens);

      // Cookie is set by the server — just fetch the user profile
      const response = await api.get<IUserData>('/profile/me');
      setUser(response.data);
      redirectByRole(response.data.role);
    } catch (error: any) {
      console.error('Keycloak login error:', error);
      throw error;
    } finally {
      setIsOAuthLoading(false);
    }
  }, [redirectByRole]);

  const refreshUser = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get<IUserData>('/profile/me');
      setUser(response.data);
    } catch (err: any) {
      if (axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
        await logout();
      }
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      setIsLoading(true);

      // Validate session via HttpOnly cookie — if cookie is missing/expired, /profile/me returns 401
      // User data is kept in memory only (React state) — no sessionStorage to avoid XSS exposure
      try {
        const response = await api.get<IUserData>('/profile/me');
        if (isMounted) {
          setUser(response.data);
        }
      } catch (err: any) {
        if (isMounted && axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 403)) {
          setUser(null);
        }
      }

      if (isMounted) setIsLoading(false);
    };

    initializeAuth();

    checkOAuthStatus().then((status) => {
      if (isMounted) setIsOAuthEnabled(status.enabled);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Redirection centralisée : quand un utilisateur connecté perd sa session → /login
  useEffect(() => {
    if (user) {
      wasAuthenticated.current = true;
    } else if (!isLoading && wasAuthenticated.current) {
      // L'utilisateur était connecté mais ne l'est plus (session expirée / 401)
      wasAuthenticated.current = false;
      if (isProtectedPath(location.pathname)) {
        navigate('/login', { replace: true });
      }
    }
  }, [user, isLoading, location.pathname, navigate]);

  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/auth/register', data);
      return response.data;
    },
    onSuccess: async (data) => {
      await refreshUser();
      redirectByRole(data.user.role);
    }
  });

  const loginMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/auth/login', data);
      return response.data;
    },
    onSuccess: async (data) => {
      await refreshUser();
      redirectByRole(data.user.role);
    }
  });

  const contextValue = {
    token,
    user,
    setToken,
    setUser,
    loginMutation,
    registerMutation,
    logout,
    refreshUser,
    isLoading,
    loginWithKeycloak,
    isOAuthEnabled,
    isOAuthLoading,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 