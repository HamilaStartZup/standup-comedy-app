import React, { useState } from 'react';
import { updateVenue } from '../services/api';
import { SuccessMessages, ErrorMessages, getErrorMessage } from '../services/systemMessages';
import { useAlert } from '../hooks/useAlert';
import type { IVenue } from '../types/venue';
import VenueForm, { type VenueFormData } from './VenueForm';

interface EditVenueFormProps {
  venue: IVenue;
  onUpdated: (updatedVenue: IVenue) => void;
}

const EditVenueForm: React.FC<EditVenueFormProps> = ({ venue, onUpdated }) => {
  const { showSuccess, showError } = useAlert();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialData: Partial<VenueFormData> = {
    name: venue.name,
    description: venue.description,
    shortDescription: venue.shortDescription ?? '',
    fullDescription: venue.fullDescription ?? '',
    photos: venue.photos?.length
      ? venue.photos
      : [venue.mainPhoto, ...(venue.gallery || [])].filter(Boolean) as string[],
    address: venue.address,
    addressComplement: venue.addressComplement ?? '',
    city: venue.city,
    postalCode: venue.postalCode,
    country: venue.country,
    latitude: venue.latitude ?? '',
    longitude: venue.longitude ?? '',
    capacity: venue.capacity,
    seatedCapacity: venue.seatedCapacity ?? '',
    standingCapacity: venue.standingCapacity ?? '',
    stageArea: venue.stageArea ?? '',
    configurationType: venue.configurationType ?? '',
    dressingRooms: venue.dressingRooms ?? '',
    accessiblePMR: venue.accessiblePMR ?? false,
    parkingAvailable: venue.parkingAvailable ?? false,
    equipment: venue.equipment ?? [],
    equipmentOther: '',
    pricePerEvent: venue.pricePerEvent,
    pricingType: venue.pricingType ?? '',
    currency: venue.currency ?? 'EUR',
    deposit: venue.deposit ?? '',
    extraFees: venue.extraFees ?? [],
    bookingMode: venue.bookingMode ?? 'manual',
    minBookingDelay: venue.minBookingDelay ?? '',
    minDuration: venue.minDuration ?? '',
    maxDuration: venue.maxDuration ?? '',
    acceptedEventTypes: venue.acceptedEventTypes ?? [],
    cancellationPolicy: venue.cancellationPolicy ?? 'moderate',
    cancellationConditions: venue.cancellationConditions ?? '',
    houseRules: venue.houseRules ?? '',
    contactName: venue.contactName ?? '',
    contactEmail: venue.contactEmail ?? '',
    contactPhone: venue.contactPhone ?? '',
    legalStatus: venue.legalStatus ?? '',
    siret: venue.siret ?? '',
    invoicingAvailable: venue.invoicingAvailable ?? false,
    venueType: venue.venueType,
  };

  const handleSubmit = async (data: VenueFormData) => {
    setIsSubmitting(true);
    try {
      const updated = await updateVenue(venue._id, {
        ...data,
        description: data.description || data.shortDescription,
        capacity: parseInt(data.capacity as string),
        pricePerEvent: parseFloat(data.pricePerEvent as string),
        latitude: data.latitude !== '' ? parseFloat(data.latitude as string) : undefined,
        longitude: data.longitude !== '' ? parseFloat(data.longitude as string) : undefined,
        seatedCapacity: data.seatedCapacity !== '' ? parseInt(data.seatedCapacity as string) : undefined,
        standingCapacity: data.standingCapacity !== '' ? parseInt(data.standingCapacity as string) : undefined,
        stageArea: data.stageArea !== '' ? parseFloat(data.stageArea as string) : undefined,
        dressingRooms: data.dressingRooms !== '' ? parseInt(data.dressingRooms as string) : undefined,
        deposit: data.deposit !== '' ? parseFloat(data.deposit as string) : undefined,
        minBookingDelay: data.minBookingDelay !== '' ? parseInt(data.minBookingDelay as string) : undefined,
        minDuration: data.minDuration !== '' ? parseFloat(data.minDuration as string) : undefined,
        maxDuration: data.maxDuration !== '' ? parseFloat(data.maxDuration as string) : undefined,
        venueType: data.venueType as IVenue['venueType'],
        configurationType: (data.configurationType || undefined) as IVenue['configurationType'],
        pricingType: (data.pricingType || undefined) as IVenue['pricingType'],
        bookingMode: (data.bookingMode || 'manual') as IVenue['bookingMode'],
      } as Partial<IVenue>);
      showSuccess(SuccessMessages.VENUE_UPDATED);
      onUpdated(updated);
    } catch (err) {
      showError(getErrorMessage(err, ErrorMessages.VENUE_UPDATE_FAILED));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <VenueForm
      mode="edit"
      initialData={initialData}
      onSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Enregistrer les modifications"
      flat
    />
  );
};

export default EditVenueForm;
