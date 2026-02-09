import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  MapPin, Navigation, Clock, Car, User, 
  AlertCircle, Loader2, Shield, Phone,
  RefreshCw
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api';
import axios from 'axios';

interface SharedRideData {
  ride: {
    id: number;
    status: string;
    pickup: {
      address: string;
      latitude: number;
      longitude: number;
    };
    destination: {
      address: string;
      latitude: number;
      longitude: number;
    };
    captain: {
      firstName: string;
      lastName: string;
      vehicle: {
        color: string;
        licensePlate: string;
        vehicleType: string;
      } | null;
    } | null;
    currentLocation: {
      latitude: number;
      longitude: number;
    } | null;
    estimatedArrival: string | null;
  };
  expiresAt: string;
}

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const libraries: ("places" | "geometry")[] = ['places', 'geometry'];

const SharedRideTracking = () => {
  const { token } = useParams<{ token: string }>();
  const [rideData, setRideData] = useState<SharedRideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries
  });

  const fetchRideData = useCallback(async () => {
    if (!token) return;
    
    try {
      const apiUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await axios.get(`${apiUrl}/v1/sos/share/${token}`);
      setRideData(response.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        setError('This tracking link has expired or is no longer valid.');
      } else if (axiosError.response?.status === 410) {
        setError('This tracking link has been deactivated by the rider.');
      } else {
        setError('Unable to load ride information. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial fetch and polling
  useEffect(() => {
    fetchRideData();
    
    // Poll every 10 seconds for updates
    const interval = setInterval(fetchRideData, 10000);
    
    return () => clearInterval(interval);
  }, [fetchRideData]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Fit map bounds to show all markers
  useEffect(() => {
    if (mapRef.current && rideData?.ride) {
      const bounds = new google.maps.LatLngBounds();
      
      bounds.extend({
        lat: rideData.ride.pickup.latitude,
        lng: rideData.ride.pickup.longitude
      });
      
      bounds.extend({
        lat: rideData.ride.destination.latitude,
        lng: rideData.ride.destination.longitude
      });

      if (rideData.ride.currentLocation) {
        bounds.extend({
          lat: rideData.ride.currentLocation.latitude,
          lng: rideData.ride.currentLocation.longitude
        });
      }

      mapRef.current.fitBounds(bounds, 60);
    }
  }, [rideData]);

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, { text: string; color: string; bgColor: string }> = {
      'ACCEPTED': { text: 'Driver En Route', color: 'text-blue-700', bgColor: 'bg-blue-100' },
      'ARRIVED': { text: 'Driver Arrived', color: 'text-purple-700', bgColor: 'bg-purple-100' },
      'IN_PROGRESS': { text: 'Ride In Progress', color: 'text-green-700', bgColor: 'bg-green-100' },
      'COMPLETED': { text: 'Ride Completed', color: 'text-zinc-700', bgColor: 'bg-zinc-100' },
      'CANCELLED': { text: 'Ride Cancelled', color: 'text-red-700', bgColor: 'bg-red-100' }
    };
    return statusMap[status] || { text: status, color: 'text-zinc-700', bgColor: 'bg-zinc-100' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-zinc-400 mx-auto mb-4" />
          <p className="text-zinc-600">Loading ride information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mb-2">Link Unavailable</h1>
          <p className="text-zinc-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!rideData) return null;

  const { ride } = rideData;
  const statusInfo = getStatusDisplay(ride.status);

  return (
    <div className="min-h-screen bg-zinc-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-zinc-900">Live Ride Tracking</h1>
              <p className="text-xs text-zinc-500">Shared with you for safety</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <RefreshCw size={12} className="animate-spin" />
            <span>Auto-updating</span>
          </div>
        </div>
      </header>

      {/* Map */}
      <div className="flex-1 relative">
        {loadError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
            <p className="text-zinc-500">Failed to load map</p>
          </div>
        ) : !isLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-100">
            <Loader2 size={32} className="animate-spin text-zinc-400" />
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            zoom={14}
            center={{
              lat: ride.currentLocation?.latitude || ride.pickup.latitude,
              lng: ride.currentLocation?.longitude || ride.pickup.longitude
            }}
            onLoad={onMapLoad}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              styles: [
                { featureType: 'poi', stylers: [{ visibility: 'off' }] }
              ]
            }}
          >
            {/* Pickup Marker */}
            <Marker
              position={{
                lat: ride.pickup.latitude,
                lng: ride.pickup.longitude
              }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#22c55e',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3
              }}
            />

            {/* Destination Marker */}
            <Marker
              position={{
                lat: ride.destination.latitude,
                lng: ride.destination.longitude
              }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#ef4444',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3
              }}
            />

            {/* Current Location Marker (Car) */}
            {ride.currentLocation && (
              <Marker
                position={{
                  lat: ride.currentLocation.latitude,
                  lng: ride.currentLocation.longitude
                }}
                icon={{
                  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
                  scale: 1.5,
                  fillColor: '#3b82f6',
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 2,
                  anchor: new google.maps.Point(12, 24)
                }}
              />
            )}

            {/* Route line from current location to destination */}
            {ride.currentLocation && (
              <Polyline
                path={[
                  { lat: ride.currentLocation.latitude, lng: ride.currentLocation.longitude },
                  { lat: ride.destination.latitude, lng: ride.destination.longitude }
                ]}
                options={{
                  strokeColor: '#3b82f6',
                  strokeOpacity: 0.8,
                  strokeWeight: 4,
                  geodesic: true
                }}
              />
            )}
          </GoogleMap>
        )}
      </div>

      {/* Bottom Info Panel */}
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white rounded-t-3xl shadow-xl"
      >
        <div className="p-5 max-w-4xl mx-auto">
          {/* Status Badge */}
          <div className="flex items-center justify-between mb-4">
            <span className={`px-4 py-2 rounded-full text-sm font-semibold ${statusInfo.bgColor} ${statusInfo.color}`}>
              {statusInfo.text}
            </span>
            {lastUpdated && (
              <span className="text-xs text-zinc-400">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>

          {/* Ride Info */}
          <div className="space-y-4">
            {/* Locations */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-zinc-400 font-medium">Pickup</p>
                  <p className="text-sm text-zinc-900">{ride.pickup.address}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                  <Navigation size={16} className="text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-zinc-400 font-medium">Destination</p>
                  <p className="text-sm text-zinc-900">{ride.destination.address}</p>
                </div>
              </div>
            </div>

            {/* Driver Info */}
            {ride.captain && (
              <div className="bg-zinc-50 rounded-2xl p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-zinc-200 rounded-full flex items-center justify-center">
                    <User size={24} className="text-zinc-500" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-zinc-900">
                      {ride.captain.firstName} {ride.captain.lastName}
                    </p>
                    {ride.captain.vehicle && (
                      <p className="text-sm text-zinc-500">
                        {ride.captain.vehicle.color} {ride.captain.vehicle.vehicleType} • {ride.captain.vehicle.licensePlate}
                      </p>
                    )}
                  </div>
                  <div className="w-10 h-10 bg-zinc-200 rounded-xl flex items-center justify-center">
                    <Car size={20} className="text-zinc-500" />
                  </div>
                </div>
              </div>
            )}

            {/* ETA */}
            {ride.estimatedArrival && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                <Clock size={18} className="text-blue-600" />
                <div>
                  <p className="text-xs text-blue-600 font-medium">Estimated Arrival</p>
                  <p className="text-sm font-semibold text-blue-900">
                    {new Date(ride.estimatedArrival).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Emergency Notice */}
          <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
            <div className="flex items-start gap-3">
              <Phone size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Emergency?</p>
                <p className="text-xs text-amber-700">
                  If you believe someone is in danger, call emergency services (112) immediately.
                </p>
              </div>
            </div>
          </div>

          {/* Ride ID */}
          <div className="mt-4 text-center">
            <p className="text-xs text-zinc-400">
              Ride #{ride.id} • Link expires {new Date(rideData.expiresAt).toLocaleString()}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default SharedRideTracking;
