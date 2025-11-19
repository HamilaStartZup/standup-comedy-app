import axios from 'axios';

// Configuration de base d'axios
// Note: les routes appelées utilisent déjà le préfixe '/api/...'
// Donc ici, baseURL doit être l'URL racine du backend SANS '/api'
const apiBaseUrl = import.meta.env.PROD
  ? (process.env.REACT_APP_API_URL || 'https://standup-comedy-app.onrender.com')
  : 'https://standup-comedy-app.onrender.com';

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur pour ajouter le token d'authentification
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercepteur pour gérer les erreurs de réponse
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Fonctions d'authentification
export const login = async (email: string, password: string) => {
  try {
    const response = await apiClient.post('/api/auth/login', { email, password });
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    throw error;
  }
};

export const register = async (userData: any) => {
  try {
    const response = await apiClient.post('/api/auth/register', userData);
    return response.data;
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    throw error;
  }
};

export const getProfile = async () => {
  try {
    const response = await apiClient.get('/api/auth/profile');
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la récupération du profil:', error);
    throw error;
  }
};

// Fonction pour récupérer tous les utilisateurs (SUPER_ADMIN seulement)
export const getAllUsers = async () => {
  try {
    const response = await apiClient.get('/api/auth/users');
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    throw error;
  }
};

export default apiClient;



