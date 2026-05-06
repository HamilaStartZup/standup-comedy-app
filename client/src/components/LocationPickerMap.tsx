import React, { useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { venueMarkerIcon } from '../utils/mapUtils';

interface LocationPickerMapProps {
  lat: number;
  lng: number;
  name: string;
  onPositionChange: (lat: number, lng: number) => void;
}

const LocationPickerMap: React.FC<LocationPickerMapProps> = ({ lat, lng, name, onPositionChange }) => {
  const markerRef = useRef<L.Marker>(null);

  const eventHandlers = useMemo(() => ({
    dragend() {
      const marker = markerRef.current;
      if (marker) {
        const pos = marker.getLatLng();
        onPositionChange(pos.lat, pos.lng);
      }
    },
  }), [onPositionChange]);

  return (
    <div style={{ marginTop: 16 }}>
      <span style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600, display: 'block', marginBottom: 8 }}>
        📍 Vérifiez la position — faites glisser le marqueur si besoin
      </span>
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', height: 260 }}>
        <MapContainer center={[lat, lng]} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker draggable position={[lat, lng]} icon={venueMarkerIcon as any} ref={markerRef} eventHandlers={eventHandlers}>
            <Popup>{name || 'Déplacez le marqueur'}</Popup>
          </Marker>
        </MapContainer>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 11, color: '#666' }}>
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </p>
    </div>
  );
};

export default LocationPickerMap;
