// frontend/src/components/RideMap.tsx
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';

// Marker Icon Fix
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

interface RideMapProps {
    pickup: [number, number];
    dropoff: [number, number];
    currentLocation?: [number, number];
    path: [number, number][];
}

// FIX: Added guard to RecenterMap
const RecenterMap = ({ coords }: { coords: [number, number] | undefined }) => {
    const map = useMap();
    useEffect(() => {
        // CRITICAL: Check if coords exist and are valid numbers
        if (coords && coords[0] !== undefined && coords[1] !== undefined) {
            map.setView(coords, map.getZoom());
        }
    }, [coords, map]);
    return null;
};

export const RideMap = ({ pickup, dropoff, currentLocation, path }: RideMapProps) => {
    // FIX: Guard the entire component. If pickup is not yet loaded, return null.
    if (!pickup || pickup[0] === undefined || pickup[1] === undefined) {
        return <div className="h-full w-full bg-slate-200 animate-pulse flex items-center justify-center">Loading Map...</div>;
    }

    return (
        <MapContainer 
            center={pickup} 
            zoom={15} 
            className="h-full w-full"
            zoomControl={false}
        >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            
            {/* Pickup Marker */}
            <Marker position={pickup} />
            
            {/* Dropoff Marker - Only if valid */}
            {dropoff && dropoff[0] !== undefined && (
                <Marker position={dropoff} />
            )}

            {/* Current Captain Location */}
            {currentLocation && currentLocation[0] !== undefined && (
                <>
                    <Marker position={currentLocation} />
                    <RecenterMap coords={currentLocation} />
                </>
            )}

            {/* Path Polyline */}
            <Polyline positions={path} color="#000" weight={4} opacity={0.6} />
        </MapContainer>
    );
};