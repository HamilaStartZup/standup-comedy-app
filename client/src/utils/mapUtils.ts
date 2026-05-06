import L from 'leaflet';

export const venueMarkerIcon = L.divIcon({
  html: `
    <svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z"
        fill="#ff416c" stroke="#fff" stroke-width="1.5"/>
      <circle cx="12" cy="12" r="4" fill="#fff"/>
    </svg>`,
  iconSize: [24, 32],
  iconAnchor: [12, 32],
  className: '',
});
