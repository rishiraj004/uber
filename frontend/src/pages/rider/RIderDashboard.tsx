import axios from "axios";
import api from "../../services/api";
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Car, Bike, Zap, Clock, Route, LogOut, X, ChevronRight } from 'lucide-react';
import { useNavigate } from "react-router-dom";
import { useSocket } from "../../context/socket-context";
import AddressAutocomplete from "../../components/AddressAutocomplete";
import { RideMap } from "../../components/RideMap";
import toast from "react-hot-toast";

// Generate UUID for Mapbox session token
const generateSessionToken = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

interface Coordinates {
    lat: number;
    lng: number;
}

interface DirectionsCache {
    pickup: Coordinates;
    dropoff: Coordinates;
    distanceKm: number;
    durationMinutes: number;
}

interface Fares {
    CAR: number;
    BIKE: number;
    AUTO: number;
}

const VehicleOption = ({ 
    type, 
    fare, 
    selected, 
    onClick, 
    eta 
}: { 
    type: 'CAR' | 'BIKE' | 'AUTO'; 
    fare: number; 
    selected: boolean; 
    onClick: () => void;
    eta: string;
}) => {
    const icons = {
        CAR: <Car size={28} strokeWidth={1.5} />,
        BIKE: <Bike size={28} strokeWidth={1.5} />,
        AUTO: <Zap size={28} strokeWidth={1.5} className="text-amber-500" />
    };

    const labels = {
        CAR: 'UberX',
        BIKE: 'Bike',
        AUTO: 'Auto'
    };

    const descriptions = {
        CAR: 'Affordable, everyday rides',
        BIKE: 'Quick & economical',
        AUTO: 'Popular & reliable'
    };

    return (
        <button
            onClick={onClick}
            className={`
                w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-200
                ${selected 
                    ? 'border-zinc-900 bg-zinc-50' 
                    : 'border-zinc-100 hover:border-zinc-300 bg-white'
                }
            `}
        >
            <div className="flex items-center gap-4">
                <div className={`
                    w-14 h-14 rounded-xl flex items-center justify-center
                    ${selected ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}
                `}>
                    {icons[type]}
                </div>
                <div className="text-left">
                    <p className="font-semibold text-zinc-900">{labels[type]}</p>
                    <p className="text-xs text-zinc-500">{descriptions[type]}</p>
                    <div className="flex items-center gap-1 mt-1">
                        <Clock size={12} className="text-zinc-400" />
                        <span className="text-xs text-zinc-500">{eta}</span>
                    </div>
                </div>
            </div>
            <div className="text-right">
                <p className="text-lg font-bold text-zinc-900">₹{fare}</p>
            </div>
        </button>
    );
};

const RiderDashboard: React.FC = () => {
    // Location state
    const [pickup, setPickup] = useState("");
    const [dropoff, setDropoff] = useState("");
    const [pickupCoords, setPickupCoords] = useState<Coordinates | null>(null);
    const [dropoffCoords, setDropoffCoords] = useState<Coordinates | null>(null);

    // Ride state
    const [vehicleType, setVehicleType] = useState<"CAR" | "BIKE" | "AUTO">("CAR");
    const [loading, setLoading] = useState(false);
    const [fares, setFares] = useState<Fares>({ CAR: 0, BIKE: 0, AUTO: 0 });
    const [rideId, setRideId] = useState<number | null>(null);
    const [error, setError] = useState("");

    // Directions cache to avoid repeated API calls
    const directionsCache = useRef<DirectionsCache | null>(null);
    
    // Mapbox session token (generated once per search session)
    const [sessionToken] = useState(() => generateSessionToken());

    // Route info display
    const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);

    const socket = useSocket();
    const navigate = useNavigate();

    // Check for active ride on mount
    useEffect(() => {
        const checkActiveRide = async () => {
            try {
                const token = localStorage.getItem("token");
                if (!token) return;
                const userId = JSON.parse(atob(token.split('.')[1])).userId;
                const response = await api.get(`/ride/details/${userId}`);
                if (response.data.ride && ['ACCEPTED', 'ARRIVED', 'ONGOING'].includes(response.data.ride.status)) {
                    navigate("/rider-tracking", { state: { ride: response.data.ride } });
                }
            } catch (err) {
                console.error("Error checking active ride:", err);
            }
        };
        checkActiveRide();
    }, [navigate]);

    // Socket listener for ride acceptance
    useEffect(() => {
        if (!socket) return;

        const handleRideAccepted = (data: { [key: string]: unknown }) => {
            toast.success('Ride accepted! Captain is on the way.');
            navigate("/rider-tracking", { state: { ride: data } });
            setLoading(false);
        };

        socket.on("RIDE_ACCEPTED", handleRideAccepted);
        return () => { socket.off("RIDE_ACCEPTED", handleRideAccepted); };
    }, [socket, navigate]);

    // Check if coordinates have changed (for cache invalidation)
    const coordsChanged = useCallback((newPickup: Coordinates, newDropoff: Coordinates): boolean => {
        if (!directionsCache.current) return true;
        const { pickup: cachedPickup, dropoff: cachedDropoff } = directionsCache.current;
        return (
            cachedPickup.lat !== newPickup.lat ||
            cachedPickup.lng !== newPickup.lng ||
            cachedDropoff.lat !== newDropoff.lat ||
            cachedDropoff.lng !== newDropoff.lng
        );
    }, []);

    // Calculate fares when both locations are selected
    const calculateAllFares = useCallback(async () => {
        if (!pickupCoords || !dropoffCoords) return;

        // Check cache first
        if (!coordsChanged(pickupCoords, dropoffCoords) && directionsCache.current) {
            const { distanceKm, durationMinutes } = directionsCache.current;
            setRouteInfo({ distance: distanceKm, duration: durationMinutes });
            
            // Calculate fares locally using cached distance
            const baseFares = { CAR: 50, BIKE: 20, AUTO: 30 };
            const perKmRates = { CAR: 15, BIKE: 8, AUTO: 12 };
            const perMinRates = { CAR: 2, BIKE: 1, AUTO: 1.5 };
            
            const calculateFare = (type: 'CAR' | 'BIKE' | 'AUTO') => {
                return Math.round(baseFares[type] + (distanceKm * perKmRates[type]) + (durationMinutes * perMinRates[type]));
            };

            setFares({
                CAR: calculateFare('CAR'),
                BIKE: calculateFare('BIKE'),
                AUTO: calculateFare('AUTO')
            });
            return;
        }

        try {
            // Fetch fare for selected vehicle type - this also gets distance/duration
            const response = await api.post("/ride/calculate-fare", {
                pickupCoords,
                destCoords: dropoffCoords,
                vehicleType: vehicleType,
            });

            const { distanceKm, durationMinutes, estimatedCost } = response.data;

            // Cache the directions result
            directionsCache.current = {
                pickup: pickupCoords,
                dropoff: dropoffCoords,
                distanceKm,
                durationMinutes
            };

            setRouteInfo({ distance: distanceKm, duration: durationMinutes });

            // Calculate all fares using the cached distance/duration
            const baseFares = { CAR: 50, BIKE: 20, AUTO: 30 };
            const perKmRates = { CAR: 15, BIKE: 8, AUTO: 12 };
            const perMinRates = { CAR: 2, BIKE: 1, AUTO: 1.5 };
            
            const calculateFare = (type: 'CAR' | 'BIKE' | 'AUTO') => {
                return Math.round(baseFares[type] + (distanceKm * perKmRates[type]) + (durationMinutes * perMinRates[type]));
            };

            setFares({
                CAR: estimatedCost || calculateFare('CAR'),
                BIKE: calculateFare('BIKE'),
                AUTO: calculateFare('AUTO')
            });
        } catch (err) {
            console.error("Error calculating fares:", err);
            toast.error("Unable to calculate fare. Please try again.");
        }
    }, [pickupCoords, dropoffCoords, coordsChanged, vehicleType]);

    // Trigger fare calculation when both locations are set
    useEffect(() => {
        if (pickupCoords && dropoffCoords) {
            calculateAllFares();
        }
    }, [pickupCoords, dropoffCoords, calculateAllFares]);

    const handlePickupSelect = useCallback((suggestion: { name: string; latitude: number; longitude: number }) => {
        setPickup(suggestion.name);
        setPickupCoords({ lat: suggestion.latitude, lng: suggestion.longitude });
    }, []);

    const handleDropoffSelect = useCallback((suggestion: { name: string; latitude: number; longitude: number }) => {
        setDropoff(suggestion.name);
        setDropoffCoords({ lat: suggestion.latitude, lng: suggestion.longitude });
    }, []);

    const canRequest = useMemo(() => {
        return pickupCoords !== null && dropoffCoords !== null && fares[vehicleType] > 0;
    }, [pickupCoords, dropoffCoords, fares, vehicleType]);

    const handleRequestRide = async () => {
        setError("");
        if (!canRequest) {
            setError("Please select both pickup and drop locations.");
            return;
        }

        setLoading(true);

        try {
            const response = await api.post("/ride/create-ride", {
                pickup,
                destination: dropoff,
                pickupCoords,
                destCoords: dropoffCoords,
                vehicleType,
            });

            setRideId(response.data.ride.id);
            toast.success('Looking for nearby captains...');
        } catch (err) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data.message || "Failed to request ride.");
            } else {
                setError("Failed to request ride.");
            }
            setLoading(false);
        }
    };

    const cancelRide = async () => {
        if (!rideId) return;
        
        try {
            await api.post("/ride/cancel-ride", { rideId });
            setLoading(false);
            setRideId(null);
            toast('Ride cancelled');
        } catch (err) {
            console.error("Error cancelling ride:", err);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        navigate("/login");
    };

    const showVehicleOptions = pickupCoords && dropoffCoords && fares.CAR > 0;

    return (
        <div className="h-screen w-screen flex flex-col md:flex-row bg-zinc-50 overflow-hidden">
            {/* Left Panel - Inputs & Selection */}
            <div className="w-full md:w-105 bg-white h-full shadow-xl z-10 flex flex-col">
                {/* Header */}
                <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-zinc-900">Book a ride</h1>
                        <p className="text-sm text-zinc-500 mt-0.5">Get where you need to go</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-2.5 hover:bg-zinc-100 rounded-xl transition-colors"
                        title="Logout"
                    >
                        <LogOut size={20} className="text-zinc-500" />
                    </button>
                </div>

                {/* Location Inputs */}
                <div className="px-6 py-5 space-y-3">
                    {/* Visual connection line */}
                    <div className="relative">
                        <div className="absolute left-4.75 top-13 w-0.5 h-8 bg-zinc-200 z-10" />
                        
                        <AddressAutocomplete
                            placeholder="Where from?"
                            value={pickup}
                            onChange={setPickup}
                            onSelect={handlePickupSelect}
                            icon="pickup"
                            sessionToken={sessionToken}
                        />
                        
                        <div className="mt-3">
                            <AddressAutocomplete
                                placeholder="Where to?"
                                value={dropoff}
                                onChange={setDropoff}
                                onSelect={handleDropoffSelect}
                                icon="dropoff"
                                sessionToken={sessionToken}
                            />
                        </div>
                    </div>

                    {/* Route Info */}
                    {routeInfo && (
                        <div className="flex items-center gap-4 px-4 py-3 bg-zinc-50 rounded-xl">
                            <div className="flex items-center gap-2 text-zinc-600">
                                <Route size={16} />
                                <span className="text-sm font-medium">{routeInfo.distance} km</span>
                            </div>
                            <div className="w-1 h-1 bg-zinc-300 rounded-full" />
                            <div className="flex items-center gap-2 text-zinc-600">
                                <Clock size={16} />
                                <span className="text-sm font-medium">{Math.round(routeInfo.duration)} min</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
                        <X size={18} className="text-red-500" />
                        <span className="text-sm text-red-700">{error}</span>
                    </div>
                )}

                {/* Vehicle Selection */}
                {showVehicleOptions && (
                    <div className="flex-1 px-6 pb-6 overflow-y-auto">
                        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                            Choose a ride
                        </h3>
                        <div className="space-y-3">
                            {(['CAR', 'AUTO', 'BIKE'] as const).map((type) => (
                                <VehicleOption
                                    key={type}
                                    type={type}
                                    fare={fares[type]}
                                    selected={vehicleType === type}
                                    onClick={() => setVehicleType(type)}
                                    eta={type === 'BIKE' ? '2 min' : type === 'AUTO' ? '3 min' : '4 min'}
                                />
                            ))}
                        </div>

                        {/* Request Button */}
                        <button
                            disabled={loading || !canRequest}
                            onClick={handleRequestRide}
                            className={`
                                w-full mt-6 py-4 rounded-xl font-semibold text-base transition-all duration-200
                                flex items-center justify-center gap-2
                                ${loading 
                                    ? 'bg-zinc-900 text-white' 
                                    : 'bg-zinc-900 text-white hover:bg-zinc-800 active:scale-[0.98]'
                                }
                                disabled:bg-zinc-300 disabled:cursor-not-allowed
                            `}
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Finding your captain...</span>
                                </>
                            ) : (
                                <>
                                    <span>Request {vehicleType === 'CAR' ? 'UberX' : vehicleType}</span>
                                    <ChevronRight size={20} />
                                </>
                            )}
                        </button>

                        {/* Cancel Button */}
                        {loading && rideId && (
                            <button
                                onClick={cancelRide}
                                className="w-full mt-3 py-3 rounded-xl font-medium text-red-600 border-2 border-red-200 hover:bg-red-50 transition-colors"
                            >
                                Cancel Request
                            </button>
                        )}
                    </div>
                )}

                {/* Empty state when no destination */}
                {!showVehicleOptions && (
                    <div className="flex-1 flex items-center justify-center px-6">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Car size={28} className="text-zinc-400" />
                            </div>
                            <p className="text-zinc-500 text-sm">
                                Enter your destination to see available rides
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel - Map */}
            <div className="flex-1 relative">
                {pickupCoords && dropoffCoords ? (
                    <RideMap
                        pickup={[pickupCoords.lat, pickupCoords.lng]}
                        dropoff={[dropoffCoords.lat, dropoffCoords.lng]}
                        path={[]}
                    />
                ) : (
                    <div className="h-full w-full bg-zinc-100 flex items-center justify-center">
                        {/* Dotted pattern background */}
                        <div 
                            className="absolute inset-0 opacity-20" 
                            style={{ 
                                backgroundImage: 'radial-gradient(#18181B 1px, transparent 0)', 
                                backgroundSize: '24px 24px' 
                            }} 
                        />
                        <div className="relative z-10 text-center">
                            <div className="bg-white px-6 py-4 rounded-2xl shadow-lg">
                                <p className="text-zinc-600 font-medium">
                                    Select pickup and destination
                                </p>
                                <p className="text-zinc-400 text-sm mt-1">
                                    Map will appear here
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RiderDashboard;
