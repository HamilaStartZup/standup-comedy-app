import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';

function Home() {
  const { registerMutation, loginMutation } = useAuth();
  const { showSuccess, showError } = useAlert();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'comedian' as 'comedian' | 'organizer'
  });

  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  const handleSubmitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await registerMutation.mutateAsync(formData);
      showSuccess('Inscription réussie !');
    } catch (error: any) {
      showError(error.userFriendlyMessage || error.response?.data?.message || 'Une erreur est survenue lors de l\'inscription');
    }
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await loginMutation.mutateAsync(loginData);
      showSuccess('Connexion réussie !');
    } catch (error: any) {
      showError(error.userFriendlyMessage || error.response?.data?.message || 'Une erreur est survenue lors de la connexion');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="ccc-page-title text-center mb-6">Standup Comedy</h1>
        
        {/* Formulaire de connexion */}
        <form onSubmit={handleSubmitLogin} className="space-y-4">
          <h2 className="text-xl font-semibold">Connexion</h2>
          <input
            type="email"
            placeholder="Email"
            value={loginData.email}
            onChange={(e) => setLoginData({...loginData, email: e.target.value})}
            className="w-full p-3 border rounded-lg"
            required
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={loginData.password}
            onChange={(e) => setLoginData({...loginData, password: e.target.value})}
            className="w-full p-3 border rounded-lg"
            required
          />
          <button 
            type="submit" 
            disabled={loginMutation.isPending}
            className="w-full bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {loginMutation.isPending ? 'Connexion en cours...' : 'Se connecter'}
          </button>
        </form>

        <hr className="my-6" />

        {/* Formulaire d'inscription */}
        <form onSubmit={handleSubmitRegister} className="space-y-4">
          <h2 className="text-xl font-semibold">Inscription</h2>
          <input
            type="text"
            placeholder="Prénom"
            value={formData.firstName}
            onChange={(e) => setFormData({...formData, firstName: e.target.value})}
            className="w-full p-3 border rounded-lg"
            required
          />
          <input
            type="text"
            placeholder="Nom"
            value={formData.lastName}
            onChange={(e) => setFormData({...formData, lastName: e.target.value})}
            className="w-full p-3 border rounded-lg"
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            className="w-full p-3 border rounded-lg"
            required
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={formData.password}
            onChange={(e) => setFormData({...formData, password: e.target.value})}
            className="w-full p-3 border rounded-lg"
            required
          />
          <select
            value={formData.role}
            onChange={(e) => setFormData({...formData, role: e.target.value as 'comedian' | 'organizer'})}
            className="w-full p-3 border rounded-lg"
          >
            <option value="comedian">Humoriste</option>
            <option value="organizer">Organisateur</option>
          </select>
          <button 
            type="submit" 
            disabled={registerMutation.isPending}
            className="w-full bg-green-500 text-white p-3 rounded-lg hover:bg-green-600 disabled:opacity-50"
          >
            {registerMutation.isPending ? 'Inscription en cours...' : 'S\'inscrire'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Home; 