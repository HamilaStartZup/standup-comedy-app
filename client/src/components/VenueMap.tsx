import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { venueMarkerIcon } from '../utils/mapUtils';

interface VenueMapProps {
  lat: number;
  lng: number;
  name: string;
}

const VenueMap: React.FC<VenueMapProps> = ({ lat, lng, name }) => {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 700, color: '#fff' }}>
        Localisation
      </h3>
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', height: 220 }}>
        <MapContainer center={[lat, lng]} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={[lat, lng]} icon={venueMarkerIcon as any}>
            <Popup>{name}</Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
};

export default VenueMap;
