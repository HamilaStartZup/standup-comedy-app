import React, { useState } from 'react';
import { useEvents } from '@/contexts/EventsContext';
import { useAuth } from '@/contexts/AuthContext';
import { Event } from '@/types/events';
import { Location } from '@/types/auth';
import { getCoordinatesFromAddress, formatAddress } from '@/services/geolocationService';

interface EventFormData {
  title: string;
  description: string;
  location: Location;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  budgetMin: string;
  budgetMax: string;
  status: 'draft' | 'published' | 'cancelled' | 'full' | 'completed';
  maxPerformers?: number;
}

const MyEventsPage: React.FC = () => {
  const { user } = useAuth();
  const { events, createEvent, updateEvent } = useEvents();
  const [isCreating, setIsCreating] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [selectedEventForDetails, setSelectedEventForDetails] = useState<Event | null>(null);
  const [formData, setFormData] = useState<EventFormData>({
    title: '',
    description: '',
    location: {
      city: '',
      postalCode: '',
      address: '',
      latitude: undefined,
      longitude: undefined
    },
    date: '',
    startTime: '',
    endTime: '',
    venue: '',
    budgetMin: '',
    budgetMax: '',
    status: 'published',
    maxPerformers: undefined
  });

  const myEvents = events.filter(event => event.organizerId === user?.id);

  // Separate upcoming/current events from past events
  const now = new Date();
  const upcomingAndActiveEvents = myEvents.filter(event => {
    const eventEndDateTime = new Date(`${event.date}T${event.endTime}`);
    return eventEndDateTime > now && event.status !== 'completed' && event.status !== 'cancelled';
  }).sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.startTime}`);
    const dateB = new Date(`${b.date}T${b.startTime}`);
    return dateA.getTime() - dateB.getTime();
  });

  const pastEvents = myEvents.filter(event => {
    const eventEndDateTime = new Date(`${event.date}T${event.endTime}`);
    return eventEndDateTime <= now || event.status === 'completed' || event.status === 'cancelled';
  }).sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.startTime}`);
    const dateB = new Date(`${b.date}T${b.startTime}`);
    return dateB.getTime() - dateA.getTime(); // Sort descending for most recent past events
  });

  const handleLocationChange = async (field: keyof Location, value: string) => {
    const newLocation = { ...formData.location, [field]: value || undefined };
    setFormData({ ...formData, location: newLocation });

    // Si l'adresse est complète, on essaie de géocoder
    if (newLocation.city && newLocation.postalCode) {
      const fullAddress = formatAddress(newLocation);
      const coordinates = await getCoordinatesFromAddress(fullAddress);
      if (coordinates) {
        setFormData(prev => ({
          ...prev,
          location: {
            ...newLocation,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude
          }
        }));
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    // Gérer le champ maxPerformers comme un nombre
    if (name === 'maxPerformers') {
      setFormData({
        ...formData,
        [name]: value === '' ? undefined : Number(value) // Convertir en nombre, ou undefined si vide
      });
    } else if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent as keyof EventFormData]: {
          ...(prev[parent as keyof EventFormData] as any),
          [child]: value
        }
      }));
    } else {
      setFormData({
        ...formData,
        [name as keyof EventFormData]: value
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const eventData = {
        ...formData,
        budget: {
          min: Number(formData.budgetMin),
          max: Number(formData.budgetMax)
        },
        // maxPerformers est déjà un nombre ou undefined dans formData
      };

      if (editingEvent) {
        await updateEvent(editingEvent.id, eventData);
        setEditingEvent(null);
      } else {
        await createEvent({
          ...eventData,
          applications: [],
          organizerName: user.firstName + ' ' + user.lastName,
        });
      }
      setFormData({
        title: '',
        description: '',
        location: {
          city: '',
          postalCode: '',
          address: '',
          latitude: undefined,
          longitude: undefined
        },
        date: '',
        startTime: '',
        endTime: '',
        venue: '',
        budgetMin: '',
        budgetMax: '',
        status: 'published',
        maxPerformers: undefined
      });
      setIsCreating(false);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'évènement:', error);
    }
  };

  const handleEdit = (event: Event) => {
    console.log('Évènement à modifier:', event);
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description,
      location: event.location ? {
        city: event.location.city || '',
        postalCode: event.location.postalCode || '',
        address: event.location.address || '',
        latitude: event.location.latitude,
        longitude: event.location.longitude
      } : {
        city: '',
        postalCode: '',
        address: '',
        latitude: undefined,
        longitude: undefined
      },
      date: event.date,
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      venue: event.venue,
      budgetMin: event.budget.min.toString(),
      budgetMax: event.budget.max.toString(),
      status: event.status,
      maxPerformers: event.maxPerformers // Charger maxPerformers lors de l'édition
    });
    setIsCreating(true);
  };

  

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Mes Évènements</h1>
        <button
          onClick={() => {
            setIsCreating(true);
            setEditingEvent(null);
            setFormData({
              title: '',
              description: '',
              location: {
                city: '',
                postalCode: '',
                address: '',
                latitude: undefined,
                longitude: undefined
              },
              date: '',
              startTime: '',
              endTime: '',
              venue: '',
              budgetMin: '',
              budgetMax: '',
              status: 'draft',
              maxPerformers: undefined
            });
          }}
          className="px-4 py-2 bg-pink-600 text-white rounded-md hover:bg-pink-700 transition-colors"
        >
          Créer un évènement
        </button>
      </div>

      {isCreating && (
        <div className="mb-8 p-6 bg-gray-800/50 rounded-lg border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">{editingEvent ? 'Modifier l\'évènement' : 'Créer un nouvel évènement'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-300">Titre de l'évènement</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-300">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-gray-300">Ville</label>
                <input
                  type="text"
                  id="city"
                  name="location.city"
                  value={formData.location.city}
                  onChange={(e) => handleLocationChange('city', e.target.value)}
                  className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="postalCode" className="block text-sm font-medium text-gray-300">Code Postal</label>
                <input
                  type="text"
                  id="postalCode"
                  name="location.postalCode"
                  value={formData.location.postalCode}
                  onChange={(e) => handleLocationChange('postalCode', e.target.value)}
                  className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-300">Adresse</label>
              <input
                type="text"
                id="address"
                name="location.address"
                value={formData.location.address}
                onChange={(e) => handleLocationChange('address', e.target.value)}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-300">Date</label>
                <input
                  type="date"
                  id="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="venue" className="block text-sm font-medium text-gray-300">Lieu</label>
                <input
                  type="text"
                  id="venue"
                  name="venue"
                  value={formData.venue}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startTime" className="block text-sm font-medium text-gray-300">Heure de début</label>
                <input
                  type="time"
                  id="startTime"
                  name="startTime"
                  value={formData.startTime}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="endTime" className="block text-sm font-medium text-gray-300">Heure de fin</label>
                <input
                  type="time"
                  id="endTime"
                  name="endTime"
                  value={formData.endTime}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="budgetMin" className="block text-sm font-medium text-gray-300">Budget Min (€)</label>
                <input
                  type="number"
                  id="budgetMin"
                  name="budgetMin"
                  value={formData.budgetMin}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="budgetMax" className="block text-sm font-medium text-gray-300">Budget Max (€)</label>
                <input
                  type="number"
                  id="budgetMax"
                  name="budgetMax"
                  value={formData.budgetMax}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="maxPerformers" className="block text-sm font-medium text-gray-300">Nombre maximum d'humoristes</label>
              <input
                type="number"
                id="maxPerformers"
                name="maxPerformers"
                value={formData.maxPerformers || ''}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                placeholder="Laisser vide si illimité"
              />
            </div>
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-300">Statut</label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-pink-500 focus:ring-pink-500"
                required
              >
                <option value="published">Publié</option>
                <option value="cancelled">Annulé</option>
                <option value="completed">Terminé</option>
              </select>
            </div>
            <div className="flex space-x-4">
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                {editingEvent ? 'Mettre à jour' : 'Créer l\'évènement'}
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-xl font-bold text-white mb-4">Évènements à venir</h2>
        {upcomingAndActiveEvents.length === 0 ? (
          <p className="text-gray-400">Aucun évènement à venir. Créez-en un !</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingAndActiveEvents.map(event => (
              <div key={event.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 shadow-lg">
                <h3 className="text-lg font-semibold text-white mb-2 truncate">{event.title}</h3>
                <p className="text-gray-400 text-sm mb-1">{new Date(event.date).toLocaleDateString('fr-FR')} à {event.startTime} - {event.endTime}</p>
                <p className="text-gray-400 text-sm mb-2">{event.venue}, {event.location.city}</p>
                <p className="text-gray-400 text-sm mb-4">Statut: <span className="capitalize font-medium text-blue-400">{event.status}</span></p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(event)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                  >
                    Modifier
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold text-white mb-4">Historique des évènements (Archives)</h2>
        {pastEvents.length === 0 ? (
          <p className="text-gray-400">Aucun évènement passé ou archivé.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pastEvents.map(event => (
              <div 
                key={event.id} 
                className="bg-gray-800/30 border border-gray-700 rounded-lg p-4 shadow-lg opacity-80 cursor-pointer hover:bg-gray-700/50 transition-colors"
                onClick={() => setSelectedEventForDetails(event)}
              >
                <h3 className="text-lg font-semibold text-white mb-2 truncate">{event.title}</h3>
                <p className="text-gray-400 text-sm mb-1">{new Date(event.date).toLocaleDateString('fr-FR')} ({event.location.city})</p>
                <p className="text-gray-400 text-sm mb-2">Statut: <span className="capitalize font-medium text-gray-500">{event.status}</span></p>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedEventForDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-w-2xl w-full p-6 relative">
            <button
              onClick={() => setSelectedEventForDetails(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              &times;
            </button>
            <h2 className="text-2xl font-bold text-white mb-4">{selectedEventForDetails.title}</h2>
            <p className="text-gray-300 mb-4">{selectedEventForDetails.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-400 text-sm">Date:</p>
                <p className="text-white">{new Date(selectedEventForDetails.date).toLocaleDateString('fr-FR')}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Heure:</p>
                <p className="text-white">{selectedEventForDetails.startTime} - {selectedEventForDetails.endTime}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Lieu:</p>
                <p className="text-white">{selectedEventForDetails.venue}, {selectedEventForDetails.location.address}, {selectedEventForDetails.location.postalCode} {selectedEventForDetails.location.city}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Budget:</p>
                <p className="text-white">{selectedEventForDetails.budget.min}€ - {selectedEventForDetails.budget.max}€</p>
              </div>
            </div>

            <h3 className="text-xl font-semibold text-white mb-3">Humoristes Participants:</h3>
            {selectedEventForDetails.applications.filter(app => app.status === 'accepted').length > 0 ? (
              <ul className="list-disc list-inside text-gray-300 space-y-1">
                {selectedEventForDetails.applications
                  .filter(app => app.status === 'accepted')
                  .map(app => (
                    <li key={app.id}> {app.stageName || app.humoristName || 'Humoriste inconnu'}</li>
                  ))}
              </ul>
            ) : (
              <p className="text-gray-400">Aucun humoriste accepté pour cet évènement.</p>
            )}

            <p className="text-gray-400 text-sm mt-4">Statut: <span className="capitalize font-medium text-blue-400">{selectedEventForDetails.status}</span></p>
          </div>
        </div>
      )}
    </div>
  );
};

export { MyEventsPage };
export default MyEventsPage;
