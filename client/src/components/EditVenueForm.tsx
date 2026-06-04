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

const emptyToUndefined = (value: string | number): number | undefined => {
  if (value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeSiret = (siret: string): string | undefined => {
  const digits = siret.replace(/\s/g, '');
  if (!digits) return undefined;
  return /^\d{14}$/.test(digits) ? digits : undefined;
};

const normalizeUrl = (url: string): string | undefined => {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    return undefined;
  }
};

const buildTimeRestrictions = (tr: VenueFormData['timeRestrictions']): IVenue['timeRestrictions'] => {
  const cleanTime = (value: string) => (value === '' ? undefined : value);
  return {
    openTime: cleanTime(tr.openTime),
    closeTime: cleanTime(tr.closeTime),
    matinEnabled: tr.matinEnabled,
    matinStart: cleanTime(tr.matinStart),
    matinEnd: cleanTime(tr.matinEnd),
    apremEnabled: tr.apremEnabled,
    apremStart: cleanTime(tr.apremStart),
    apremEnd: cleanTime(tr.apremEnd),
    soireeStart: cleanTime(tr.soireeStart),
    soireeEnd: cleanTime(tr.soireeEnd),
  };
};

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
    extraFees: (venue.extraFees ?? []).map(f => ({ description: f.description, amount: f.amount ?? '' })),
    bookingMode: venue.bookingMode ?? 'manual',
    minBookingDelay: venue.minBookingDelay ?? '',
    minDuration: venue.minDuration ?? '',
    maxDuration: venue.maxDuration ?? '',
    acceptedEventTypes: venue.acceptedEventTypes ?? [],
    cancellationPolicy: venue.cancellationPolicy ?? 'moderate',
    cancellationConditions: venue.cancellationConditions ?? '',
    houseRules: venue.houseRules ?? '',
    timeRestrictions: {
      openTime: venue.timeRestrictions?.openTime ?? '',
      closeTime: venue.timeRestrictions?.closeTime ?? '',
      matinEnabled: venue.timeRestrictions?.matinEnabled ?? true,
      matinStart: venue.timeRestrictions?.matinStart ?? '09:00',
      matinEnd: venue.timeRestrictions?.matinEnd ?? '13:00',
      apremEnabled: venue.timeRestrictions?.apremEnabled ?? true,
      apremStart: venue.timeRestrictions?.apremStart ?? '14:00',
      apremEnd: venue.timeRestrictions?.apremEnd ?? '18:00',
      soireeStart: venue.timeRestrictions?.soireeStart ?? '18:00',
      soireeEnd: venue.timeRestrictions?.soireeEnd ?? '23:59',
    },
    disabledWeekdays: venue.disabledWeekdays ?? [],
    contactName: venue.contactName ?? '',
    contactEmail: venue.contactEmail ?? '',
    contactPhone: venue.contactPhone ?? '',
    legalStatus: venue.legalStatus ?? '',
    siret: venue.siret ?? '',
    invoicingAvailable: venue.invoicingAvailable ?? false,
    companyName: venue.companyName ?? '',
    website: venue.website ?? '',
    socialLinks: {
      youtube: venue.socialLinks?.youtube ?? '',
      instagram: venue.socialLinks?.instagram ?? '',
      facebook: venue.socialLinks?.facebook ?? '',
      twitter: venue.socialLinks?.twitter ?? '',
    },
    venueType: venue.venueType,
  };

  const handleSubmit = async (data: VenueFormData) => {
    setIsSubmitting(true);
    try {
      const updated = await updateVenue(venue._id, {
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
        latitude: emptyToUndefined(data.latitude),
        longitude: emptyToUndefined(data.longitude),
        capacity: parseInt(data.capacity as string),
        seatedCapacity: emptyToUndefined(data.seatedCapacity),
        standingCapacity: emptyToUndefined(data.standingCapacity),
        stageArea: emptyToUndefined(data.stageArea),
        configurationType: (data.configurationType || undefined) as IVenue['configurationType'],
        dressingRooms: emptyToUndefined(data.dressingRooms),
        accessiblePMR: data.accessiblePMR,
        parkingAvailable: data.parkingAvailable,
        equipment: data.equipment,
        pricePerEvent: parseFloat(data.pricePerEvent as string),
        pricingType: (data.pricingType || undefined) as IVenue['pricingType'],
        currency: data.currency || 'EUR',
        deposit: emptyToUndefined(data.deposit),
        extraFees: (data.extraFees ?? [])
          .filter(f => f.description && String(f.description).trim() !== '')
          .map(f => ({ description: String(f.description), amount: parseFloat(f.amount as string) || 0 })),
        bookingMode: (data.bookingMode || 'manual') as IVenue['bookingMode'],
        minBookingDelay: emptyToUndefined(data.minBookingDelay),
        minDuration: emptyToUndefined(data.minDuration),
        maxDuration: emptyToUndefined(data.maxDuration),
        acceptedEventTypes: data.acceptedEventTypes.length > 0 ? data.acceptedEventTypes : undefined,
        cancellationPolicy: data.cancellationPolicy,
        cancellationConditions: data.cancellationConditions || undefined,
        houseRules: data.houseRules || undefined,
        timeRestrictions: buildTimeRestrictions(data.timeRestrictions),
        disabledWeekdays: data.disabledWeekdays,
        contactName: data.contactName || undefined,
        contactEmail: data.contactEmail || undefined,
        contactPhone: data.contactPhone || undefined,
        legalStatus: data.legalStatus || undefined,
        siret: normalizeSiret(data.siret),
        invoicingAvailable: data.invoicingAvailable,
        companyName: data.companyName || undefined,
        website: normalizeUrl(data.website),
        socialLinks: {
          youtube: normalizeUrl(data.socialLinks.youtube),
          instagram: normalizeUrl(data.socialLinks.instagram),
          facebook: normalizeUrl(data.socialLinks.facebook),
          twitter: normalizeUrl(data.socialLinks.twitter),
        },
        venueType: data.venueType as IVenue['venueType'],
      });
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
