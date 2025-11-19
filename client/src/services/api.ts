import axios from 'axios';

// Configuration automatique de l'URL de base selon l'environnement
const baseURL =
  process.env.NODE_ENV === 'production'
    ? process.env.REACT_APP_API_URL || 'https://standup-comedy-app.onrender.com/api'  // Production
    : 'https://standup-comedy-app.onrender.com/api';            // Développement

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur pour ajouter le token d'authentification
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercepteur pour gérer les erreurs
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Fonctions pour gérer les absences
export const markAbsence = async (eventId: string, comedianId: string, reason?: string) => {
  const response = await api.post('/absences', { eventId, comedianId, reason });
  return response.data;
};

export const cancelAbsence = async (eventId: string, comedianId: string) => {
  const response = await api.delete(`/absences/${eventId}/${comedianId}`);
  return response.data;
};

export const getEventAbsences = async (eventId: string) => {
  const response = await api.get(`/absences/event/${eventId}`);
  return response.data;
};

export const getComedianAbsences = async (comedianId: string) => {
  const response = await api.get(`/absences/comedian/${comedianId}`);
  return response.data;
};

export default api;
