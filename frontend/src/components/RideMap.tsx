import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

interface RideMapProps {
    pickup: [number, number];
    dropoff: [number, number];
    currentLocation?: [number, number];
    path: [number, number][];
}

// Helper to auto-center map when location updates
const RecenterMap = ({ coords }: { coords: [number, number] }) => {
    const map = useMap();
    useEffect(() => { map.setView(coords); }, [coords, map]);
    return null;
};

export const RideMap = ({ pickup, dropoff, currentLocation, path }: RideMapProps) => {
    return (
        <MapContainer center={pickup} zoom={15} style={{ height: '100%', width: '100%' }} className="h-full w-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            <Marker position={pickup} /> {/* Pickup Point */}
            <Marker position={dropoff} /> {/* Destination */}
            
            {currentLocation && (
                <>
                    <Marker position={currentLocation} /> {/* Live Captain */}
                    <RecenterMap coords={currentLocation} />
                </>
            )}

            <Polyline positions={path} color="#000" weight={4} opacity={0.6} />
        </MapContainer>
    );
};