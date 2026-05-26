import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createVenue } from '../services/api';
import { SuccessMessages, ErrorMessages, getErrorMessage } from '../services/systemMessages';
import { useAlert } from '../hooks/useAlert';
import { useAuth } from '../hooks/useAuth';
import Navbar from '../components/Navbar';
import VenueForm, { type VenueFormData } from '../components/VenueForm';
import type { IVenue } from '../types/venue';

const CreateVenuePage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useAlert();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: VenueFormData) => {
    setIsSubmitting(true);
    try {
      const venue = await createVenue({
        name: data.name,
        description: data.description || data.shortDescription,
        shortDescription: data.shortDescription || undefined,
        fullDescription: data.fullDescription || undefined,
        photos: data.photos,
        address: data.address,
        addressComplement: data.addressComplement || undefined,
        city: data.city,
        postalCode: data.postalCode,
        country: data.country,
        latitude: data.latitude !== '' ? parseFloat(data.latitude as string) : undefined,
        longitude: data.longitude !== '' ? parseFloat(data.longitude as string) : undefined,
        capacity: parseInt(data.capacity as string),
        seatedCapacity: data.seatedCapacity !== '' ? parseInt(data.seatedCapacity as string) : undefined,
        standingCapacity: data.standingCapacity !== '' ? parseInt(data.standingCapacity as string) : undefined,
        stageArea: data.stageArea !== '' ? parseFloat(data.stageArea as string) : undefined,
        configurationType: (data.configurationType || undefined) as IVenue['configurationType'],
        dressingRooms: data.dressingRooms !== '' ? parseInt(data.dressingRooms as string) : undefined,
        accessiblePMR: data.accessiblePMR,
        parkingAvailable: data.parkingAvailable,
        equipment: data.equipment,
        pricePerEvent: parseFloat(data.pricePerEvent as string),
        pricingType: (data.pricingType || undefined) as IVenue['pricingType'],
        currency: data.currency || 'EUR',
        deposit: data.deposit !== '' ? parseFloat(data.deposit as string) : undefined,
        extraFees: data.extraFees?.length
          ? data.extraFees.map(f => ({ description: f.description, amount: parseFloat(f.amount as string) || 0 }))
          : undefined,
        bookingMode: (data.bookingMode || 'manual') as IVenue['bookingMode'],
        minBookingDelay: data.minBookingDelay !== '' ? parseInt(data.minBookingDelay as string) : undefined,
        minDuration: data.minDuration !== '' ? parseFloat(data.minDuration as string) : undefined,
        maxDuration: data.maxDuration !== '' ? parseFloat(data.maxDuration as string) : undefined,
        acceptedEventTypes: data.acceptedEventTypes.length > 0 ? data.acceptedEventTypes : undefined,
        venueType: data.venueType as any,
        cancellationPolicy: data.cancellationPolicy,
        cancellationConditions: data.cancellationConditions || undefined,
        houseRules: data.houseRules || undefined,
        contactName: data.contactName || undefined,
        contactEmail: data.contactEmail || undefined,
        contactPhone: data.contactPhone || undefined,
        legalStatus: data.legalStatus || undefined,
        siret: data.siret || undefined,
        invoicingAvailable: data.invoicingAvailable,
      });
      showSuccess(SuccessMessages.VENUE_CREATED);
      if (user?.role === 'LIEU') {
        navigate('/my-venues-management');
      } else {
        navigate(`/venues/${venue._id}`);
      }
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.VENUE_CREATE_FAILED));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, #1a1a2e, #331f41)', paddingBottom: 60, padding: '20px' }}>
      <Navbar />
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', color: '#aaa', cursor: 'pointer', fontSize: 14 }}
          >
            ← Retour
          </button>
          <h1 style={{ margin: 0, fontSize: '2.2em', fontWeight: 800, color: '#ff416c' }}>
            Ajouter une salle
          </h1>
        </div>

        <VenueForm
          mode="create"
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitLabel="Créer la salle"
        />
      </div>
    </div>
  );
};

export default CreateVenuePage;
