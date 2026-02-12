// frontend/src/components/RideMap.tsx
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, memo } from 'react';

// Custom marker icons for a cleaner look
const pickupIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 24px; 
        height: 24px; 
        background: #3B82F6; 
        border: 3px solid white; 
        border-radius: 50%; 
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

const dropoffIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 24px; 
        height: 24px; 
        background: #18181B; 
        border: 3px solid white; 
        border-radius: 50%; 
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

const captainIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 32px; 
        height: 32px; 
        background: #10B981; 
        border: 3px solid white; 
        border-radius: 50%; 
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
    ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
        </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});

const nearbyCaptainIcon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
        width: 28px; 
        height: 28px; 
        background: #6366F1; 
        border: 2px solid white; 
        border-radius: 50%; 
        box-shadow: 0 2px 8px rgba(99,102,241,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.85;
    ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
        </svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
});

interface RideMapProps {
    pickup: [number, number];
    dropoff: [number, number];
    currentLocation?: [number, number];
    path: [number, number][];
    nearbyCaptains?: [number, number][];
}

// Component to fit bounds to show all markers
const FitBounds = ({ pickup, dropoff, currentLocation }: { 
    pickup: [number, number]; 
    dropoff: [number, number]; 
    currentLocation?: [number, number];
}) => {
    const map = useMap();
    
    useEffect(() => {
        const points: [number, number][] = [pickup];
        if (dropoff && dropoff[0] !== undefined) points.push(dropoff);
        if (currentLocation && currentLocation[0] !== undefined) points.push(currentLocation);
        
        if (points.length > 1) {
            const bounds = L.latLngBounds(points.map(p => [p[0], p[1]]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }, [map, pickup, dropoff, currentLocation]);
    
    return null;
};

// Recenter map when captain location updates
const RecenterMap = ({ coords }: { coords: [number, number] | undefined }) => {
    const map = useMap();
    useEffect(() => {
        if (coords && coords[0] !== undefined && coords[1] !== undefined) {
            map.setView(coords, map.getZoom(), { animate: true });
        }
    }, [coords, map]);
    return null;
};

const RideMapComponent = ({ pickup, dropoff, currentLocation, path, nearbyCaptains }: RideMapProps) => {
    // Guard: If pickup is not yet loaded, show loading state
    if (!pickup || pickup[0] === undefined || pickup[1] === undefined) {
        return (
            <div className="h-full w-full bg-zinc-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                    <span className="text-zinc-500 text-sm font-medium">Loading map...</span>
                </div>
            </div>
        );
    }

    // Mapbox tile URL - using streets-v12 for a clean, modern look
    const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_API_KEY;
    const tileUrl = MAPBOX_TOKEN 
        ? `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    return (
        <MapContainer 
            center={pickup} 
            zoom={14} 
            className="h-full w-full"
            zoomControl={false}
            attributionControl={false}
        >
            <TileLayer 
                url={tileUrl}
                tileSize={512}
                zoomOffset={-1}
            />
            
            {/* Fit bounds to show all markers initially */}
            <FitBounds pickup={pickup} dropoff={dropoff} currentLocation={currentLocation} />
            
            {/* Pickup Marker */}
            <Marker position={pickup} icon={pickupIcon} />
            
            {/* Dropoff Marker - Only if valid */}
            {dropoff && dropoff[0] !== undefined && (
                <Marker position={dropoff} icon={dropoffIcon} />
            )}

            {/* Current Captain Location */}
            {currentLocation && currentLocation[0] !== undefined && (
                <>
                    <Marker position={currentLocation} icon={captainIcon} />
                    <RecenterMap coords={currentLocation} />
                </>
            )}

            {/* Path Polyline with gradient effect */}
            {path.length > 0 && (
                <Polyline 
                    positions={path} 
                    color="#18181B" 
                    weight={4} 
                    opacity={0.8}
                    lineCap="round"
                    lineJoin="round"
                />
            )}

            {/* Nearby Captain Markers */}
            {nearbyCaptains && nearbyCaptains.map((pos, index) => (
                <Marker key={`nearby-captain-${index}`} position={pos} icon={nearbyCaptainIcon} />
            ))}
        </MapContainer>
    );
};

// Memoize the component to prevent unnecessary re-renders
export const RideMap = memo(RideMapComponent, (prevProps, nextProps) => {
    // Only re-render if essential props change
    const pickupSame = prevProps.pickup[0] === nextProps.pickup[0] && prevProps.pickup[1] === nextProps.pickup[1];
    const dropoffSame = prevProps.dropoff[0] === nextProps.dropoff[0] && prevProps.dropoff[1] === nextProps.dropoff[1];
    const locationSame = prevProps.currentLocation?.[0] === nextProps.currentLocation?.[0] && 
                         prevProps.currentLocation?.[1] === nextProps.currentLocation?.[1];
    const pathSame = prevProps.path.length === nextProps.path.length;
    const captainsSame = (prevProps.nearbyCaptains?.length ?? 0) === (nextProps.nearbyCaptains?.length ?? 0);
    
    return pickupSame && dropoffSame && locationSame && pathSame && captainsSame;
});