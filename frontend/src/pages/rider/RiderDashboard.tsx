import axios from "axios";
import api from "../../services/api";
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Car, Bike, Zap, Clock, Route, LogOut, X, ChevronRight, User, History, Home, Briefcase, Map, Gavel, Star } from 'lucide-react';
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

// Types for bid socket events
type RawBidEvent = {
    bid?: {
        id: number;
        captainId: number;
        offerAmount: number;
        estimatedArrival?: number;
        status?: string;
        captainName?: string;
        captainRating?: number;
        totalRides?: number;
        vehicleNumber?: string;
        vehicleModel?: string;
        vehicleColor?: string;
        vehicleType?: string;
        isAcceptingRiderPrice?: boolean;
    };
    isAcceptingRiderPrice?: boolean;
    captainId?: number;
    captainName?: string;
    newOfferAmount?: number;
    offerAmount?: number;
    status?: string;
};

type RawBidUpdated = {
    rideId?: number;
    captainId: number;
    captainName?: string;
    newOfferAmount?: number;
    offerAmount?: number;
    status?: string;
};

type BidPayload = {
    id: number;
    captainId: number;
    offerAmount?: number;
    estimatedArrival?: number;
    status?: string;
    captainName?: string;
    captainRating?: number;
    totalRides?: number;
    vehicleNumber?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    vehicleType?: string;
    isAcceptingRiderPrice?: boolean;
};

type Bid = {
    id: number;
    offerAmount: number;
    status: string;
    estimatedArrival?: number;
    captain: {
        id: number;
        rating: number;
        totalRides: number;
        vehicleNumber: string;
        vehicleModel: string;
        vehicleColor: string;
        user: { fullName: string };
    };
};

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

    // Search status for dynamic broadcaster feedback
    const [searchStatus, setSearchStatus] = useState<{
        currentRadius: number;
        captainsNotified: number;
        elapsedSeconds: number;
        maxSeconds: number;
        message: string;
    } | null>(null);

    // Saved addresses
    const [savedAddresses, setSavedAddresses] = useState<{
        homeAddress: string | null;
        homeAddressLat: number | null;
        homeAddressLng: number | null;
        workAddress: string | null;
        workAddressLat: number | null;
        workAddressLng: number | null;
    } | null>(null);

    // Nearby captains for map display
    const [nearbyCaptains, setNearbyCaptains] = useState<{id: number; lastLat: number; lastLng: number}[]>([]);

    // Bidding mode
    const [biddingEnabled, setBiddingEnabled] = useState(false);
    const [offerPrice, setOfferPrice] = useState<number | null>(null);

    // Incoming bids from captains
    const [bids, setBids] = useState<Array<{
        id: number;
        offerAmount: number;
        status: string;
        estimatedArrival?: number;
        captain: {
            id: number;
            rating: number;
            totalRides: number;
            vehicleNumber: string;
            vehicleModel: string;
            vehicleColor: string;
            user: { fullName: string };
        };
    }>>([]);

    // Directions cache to avoid repeated API calls
    const directionsCache = useRef<DirectionsCache | null>(null);
    
    // Mapbox session token (generated once per search session)
    const [sessionToken] = useState(() => generateSessionToken());

    // Route info display
    const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);

    const socket = useSocket();
    const navigate = useNavigate();

    // Fetch saved addresses on mount
    useEffect(() => {
        const fetchSavedAddresses = async () => {
            try {
                const response = await api.get('/profile/rider/addresses');
                setSavedAddresses(response.data.addresses);
            } catch (err) {
                console.error("Error fetching saved addresses:", err);
            }
        };
        fetchSavedAddresses();
    }, []);

    // Fetch nearby captains when pickup location is set
    // Clear nearby captains when pickup cleared (avoid setState directly in other effect body)
    useEffect(() => {
        if (!pickupCoords) {
            // schedule clear to avoid synchronous setState inside effect body
            const t = setTimeout(() => setNearbyCaptains([]), 0);
            return () => clearTimeout(t);
        }
        return;
    }, [pickupCoords]);

    // Fetch nearby captains when pickup location is set
    useEffect(() => {
        if (!pickupCoords) return;
        const fetchNearbyCaptains = async () => {
            try {
                const response = await api.get(`/captain/nearby?latitude=${pickupCoords.lat}&longitude=${pickupCoords.lng}&radius=5`);
                setNearbyCaptains(response.data.captains || []);
            } catch (err) {
                console.error("Error fetching nearby captains:", err);
            }
        };
        fetchNearbyCaptains();
        // Refresh every 30 seconds
        const interval = setInterval(fetchNearbyCaptains, 30000);
        return () => clearInterval(interval);
    }, [pickupCoords]);

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
            setSearchStatus(null);
        };

        const handleRideExpired = (data: { rideId: number; message: string }) => {
            if (rideId === data.rideId) {
                toast.error(data.message || 'No captains available. Please try again.');
                setRideId(null);
                setLoading(false);
                setSearchStatus(null);
            }
        };

        const handleRideSearching = (data: { 
            rideId: number; 
            currentRadius: number;
            captainsNotified: number;
            elapsedSeconds: number;
            maxSeconds: number;
            message: string;
        }) => {
            if (rideId === data.rideId) {
                setSearchStatus(data);
            }
        };

        socket.on("RIDE_ACCEPTED", handleRideAccepted);
        socket.on("RIDE_EXPIRED", handleRideExpired);
        socket.on("RIDE_SEARCHING", handleRideSearching);

        // Bidding listeners
        const handleNewBid = (data: RawBidEvent) => {
            // Backend sends flat fields or a nested `bid` object. Narrow safely.
            const raw = (data as RawBidEvent).bid ? (data as RawBidEvent).bid as BidPayload : (data as unknown as BidPayload);

            const normalizedBid: Bid = {
                id: raw.id ?? 0,
                offerAmount: raw.offerAmount ?? 0,
                status: raw.status ?? 'COUNTERED',
                estimatedArrival: raw.estimatedArrival,
                captain: {
                    id: raw.captainId ?? 0,
                    user: { fullName: raw.captainName || 'Captain' },
                    rating: raw.captainRating ?? 0,
                    totalRides: raw.totalRides ?? 0,
                    vehicleNumber: raw.vehicleNumber || '',
                    vehicleModel: raw.vehicleModel || '',
                    vehicleColor: raw.vehicleColor || ''
                }
            };

            const isAcceptingRiderPrice = raw.isAcceptingRiderPrice || (data as RawBidEvent).isAcceptingRiderPrice;

            setBids((prev: Bid[]) => {
                const existing = prev.find(b => b.captain.id === normalizedBid.captain.id);
                if (existing) return prev;
                return [...prev, normalizedBid];
            });

            if (isAcceptingRiderPrice) {
                toast.success(`${normalizedBid.captain.user.fullName} accepted your price!`);
            } else {
                toast(`${normalizedBid.captain.user.fullName} counter-offered ₹${normalizedBid.offerAmount}`, { icon: '💰' });
            }
        };

        const handleBidUpdated = (data: RawBidUpdated) => {
            // Backend sends flat: { rideId, captainId, captainName, newOfferAmount, status }
            const captainId = data.captainId;
            const newAmount = data.newOfferAmount ?? data.offerAmount ?? 0;
            setBids((prev: Bid[]) => prev.map(b =>
                b.captain.id === captainId
                    ? { ...b, offerAmount: newAmount, status: data.status ?? b.status }
                    : b
            ));
            if (data.captainName) {
                toast(`${data.captainName} updated offer to ₹${newAmount}`, { icon: '💰' });
            }
        };

        socket.on("NEW_BID_RECEIVED", handleNewBid);
        socket.on("BID_UPDATED", handleBidUpdated);

        return () => { 
            socket.off("RIDE_ACCEPTED", handleRideAccepted);
            socket.off("RIDE_EXPIRED", handleRideExpired);
            socket.off("RIDE_SEARCHING", handleRideSearching);
            socket.off("NEW_BID_RECEIVED", handleNewBid);
            socket.off("BID_UPDATED", handleBidUpdated);
        };
    }, [socket, navigate, rideId]);

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

        if (biddingEnabled && (!offerPrice || offerPrice < Math.round(fares[vehicleType] * 0.5))) {
            setError(`Offer price must be at least ₹${Math.round(fares[vehicleType] * 0.5)}`);
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
                ...(biddingEnabled && { isBiddingEnabled: true, baseOfferPrice: offerPrice }),
            });

            setRideId(response.data.ride.id);
            
            if (biddingEnabled) {
                toast.success('Ride posted! Waiting for captain bids...');
            } else {
                toast.success('Looking for nearby captains...');
            }
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
            setBids([]);
            toast('Ride cancelled');
        } catch (err) {
            console.error("Error cancelling ride:", err);
        }
    };

    const handleSelectBid = async (bidId: number) => {
        if (!rideId) return;
        try {
            await api.post(`/bids/${rideId}/select/${bidId}`);
            toast.success('Captain selected! They are on the way.');
            // The RIDE_ACCEPTED socket event will navigate to tracking
        } catch (err) {
            console.error("Error selecting bid:", err);
            toast.error("Failed to select captain. Please try again.");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        navigate("/login");
    };

    const showVehicleOptions = pickupCoords && dropoffCoords && fares.CAR > 0;

    // State for mobile map toggle
    const [showMobileMap, setShowMobileMap] = useState(false);

    return (
        <div className="h-screen w-screen flex flex-col md:flex-row bg-zinc-50 overflow-hidden">
            {/* Mobile Map View Overlay */}
            {showMobileMap && (
                <div className="fixed inset-0 z-50 md:hidden bg-white">
                    <div className="h-full w-full relative">
                        {pickupCoords && dropoffCoords ? (
                            <RideMap
                                pickup={[pickupCoords.lat, pickupCoords.lng]}
                                dropoff={[dropoffCoords.lat, dropoffCoords.lng]}
                                path={[]}
                                nearbyCaptains={nearbyCaptains.map(c => [c.lastLat, c.lastLng] as [number, number])}
                            />
                        ) : (
                            <div className="h-full w-full bg-zinc-100 flex items-center justify-center">
                                <p className="text-zinc-500">Select pickup and destination first</p>
                            </div>
                        )}
                        <button
                            onClick={() => setShowMobileMap(false)}
                            className="absolute top-4 left-4 p-3 bg-white rounded-xl shadow-lg"
                        >
                            <X size={20} />
                        </button>
                        {/* Route info overlay on map */}
                        {routeInfo && (
                            <div className="absolute bottom-6 left-4 right-4 bg-white rounded-2xl shadow-lg p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
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
                                    <span className="text-lg font-bold text-zinc-900">₹{fares[vehicleType]}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Left Panel - Inputs & Selection */}
            <div className="w-full md:w-105 bg-white h-full shadow-xl z-10 flex flex-col">
                {/* Header */}
                <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-zinc-100 flex items-center justify-between">
                    <div>
                        <h1 className="text-lg sm:text-xl font-bold text-zinc-900">Book a ride</h1>
                        <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">Get where you need to go</p>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                        {/* Mobile Map Button */}
                        {pickupCoords && dropoffCoords && (
                            <button
                                onClick={() => setShowMobileMap(true)}
                                className="p-2 sm:p-2.5 hover:bg-zinc-100 rounded-xl transition-colors md:hidden"
                                title="View Map"
                            >
                                <Map size={20} className="text-blue-600" />
                            </button>
                        )}
                        <button
                            onClick={() => navigate('/ride-history')}
                            className="p-2 sm:p-2.5 hover:bg-zinc-100 rounded-xl transition-colors"
                            title="Ride History"
                        >
                            <History size={18} className="sm:w-5 sm:h-5 text-zinc-500" />
                        </button>
                        <button
                            onClick={() => navigate('/profile')}
                            className="p-2 sm:p-2.5 hover:bg-zinc-100 rounded-xl transition-colors"
                            title="Profile"
                        >
                            <User size={18} className="sm:w-5 sm:h-5 text-zinc-500" />
                        </button>
                        <button
                            onClick={handleLogout}
                            className="p-2 sm:p-2.5 hover:bg-zinc-100 rounded-xl transition-colors"
                            title="Logout"
                        >
                            <LogOut size={18} className="sm:w-5 sm:h-5 text-zinc-500" />
                        </button>
                    </div>
                </div>

                {/* Location Inputs */}
                <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-3">
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
                        <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-zinc-50 rounded-xl">
                            <div className="flex items-center gap-1.5 sm:gap-2 text-zinc-600">
                                <Route size={14} className="sm:w-4 sm:h-4" />
                                <span className="text-xs sm:text-sm font-medium">{routeInfo.distance} km</span>
                            </div>
                            <div className="w-1 h-1 bg-zinc-300 rounded-full" />
                            <div className="flex items-center gap-1.5 sm:gap-2 text-zinc-600">
                                <Clock size={14} className="sm:w-4 sm:h-4" />
                                <span className="text-xs sm:text-sm font-medium">{Math.round(routeInfo.duration)} min</span>
                            </div>
                        </div>
                    )}

                    {/* Quick Destinations - Saved Addresses */}
                    {savedAddresses && (savedAddresses.homeAddress || savedAddresses.workAddress) && !dropoffCoords && (
                        <div className="pt-2">
                            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Quick destinations</p>
                            <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                {savedAddresses.homeAddress && savedAddresses.homeAddressLat && savedAddresses.homeAddressLng && (
                                    <button
                                        onClick={() => {
                                            setDropoff(savedAddresses.homeAddress!);
                                            setDropoffCoords({
                                                lat: savedAddresses.homeAddressLat!,
                                                lng: savedAddresses.homeAddressLng!
                                            });
                                        }}
                                        className="min-w-35 sm:min-w-40 shrink-0 snap-start flex items-center gap-2 px-2 sm:px-3 py-2 sm:py-2.5 bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors"
                                    >
                                        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                                            <Home size={14} className="sm:w-4 sm:h-4 text-blue-600" />
                                        </div>
                                        <div className="text-left overflow-hidden min-w-0">
                                            <p className="text-xs sm:text-sm font-medium text-zinc-900">Home</p>
                                            <p className="text-[10px] sm:text-xs text-zinc-500 truncate">{savedAddresses.homeAddress}</p>
                                        </div>
                                    </button>
                                )}
                                {savedAddresses.workAddress && savedAddresses.workAddressLat && savedAddresses.workAddressLng && (
                                    <button
                                        onClick={() => {
                                            setDropoff(savedAddresses.workAddress!);
                                            setDropoffCoords({
                                                lat: savedAddresses.workAddressLat!,
                                                lng: savedAddresses.workAddressLng!
                                            });
                                        }}
                                        className="min-w-35 sm:min-w-40 shrink-0 snap-start flex items-center gap-2 px-2 sm:px-3 py-2 sm:py-2.5 bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors"
                                    >
                                        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-100 rounded-full flex items-center justify-center shrink-0">
                                            <Briefcase size={14} className="sm:w-4 sm:h-4 text-purple-600" />
                                        </div>
                                        <div className="text-left overflow-hidden min-w-0">
                                            <p className="text-xs sm:text-sm font-medium text-zinc-900">Work</p>
                                            <p className="text-[10px] sm:text-xs text-zinc-500 truncate">{savedAddresses.workAddress}</p>
                                        </div>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mx-4 sm:mx-6 mb-3 sm:mb-4 px-3 sm:px-4 py-2.5 sm:py-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 sm:gap-3">
                        <X size={16} className="sm:w-4.5 sm:h-4.5 text-red-500" />
                        <span className="text-xs sm:text-sm text-red-700">{error}</span>
                    </div>
                )}

                {/* Vehicle Selection */}
                {showVehicleOptions && (
                    <div className="flex-1 px-4 sm:px-6 pb-4 sm:pb-6 overflow-y-auto">
                        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 sm:mb-4">
                            Choose a ride
                        </h3>
                        <div className="space-y-2 sm:space-y-3">
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

                        {/* Bidding Mode Toggle */}
                        <div className="mt-4 p-3 sm:p-4 border-2 border-zinc-100 rounded-xl">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Gavel size={16} className="text-amber-600" />
                                    <div>
                                        <p className="text-sm font-semibold text-zinc-900">Negotiate fare</p>
                                        <p className="text-[10px] sm:text-xs text-zinc-500">Let captains bid on your ride</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setBiddingEnabled(!biddingEnabled);
                                        if (!biddingEnabled) {
                                            setOfferPrice(fares[vehicleType]);
                                        } else {
                                            setOfferPrice(null);
                                        }
                                    }}
                                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                                        biddingEnabled ? 'bg-amber-500' : 'bg-zinc-300'
                                    }`}
                                >
                                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                                        biddingEnabled ? 'translate-x-5' : 'translate-x-0'
                                    }`} />
                                </button>
                            </div>
                            {biddingEnabled && (
                                <div className="mt-3 pt-3 border-t border-zinc-100">
                                    <label className="text-xs text-zinc-500 font-medium">Your offer price</label>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className="text-lg font-bold text-zinc-900">₹</span>
                                        <input
                                            type="number"
                                            value={offerPrice ?? ''}
                                            onChange={(e) => setOfferPrice(Number(e.target.value))}
                                            className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                                            placeholder={`Suggested: ₹${fares[vehicleType]}`}
                                            min={Math.round(fares[vehicleType] * 0.5)}
                                        />
                                    </div>
                                    <p className="text-[10px] text-zinc-400 mt-1">
                                        Suggested: ₹{fares[vehicleType]} &middot; Min: ₹{Math.round(fares[vehicleType] * 0.5)}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Request Button */}
                        <button
                            disabled={loading || !canRequest}
                            onClick={handleRequestRide}
                            className={`
                                w-full mt-4 sm:mt-6 py-3 sm:py-4 rounded-xl font-semibold text-sm sm:text-base transition-all duration-200
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

                        {/* Search Progress Indicator */}
                        {loading && searchStatus && (
                            <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs sm:text-sm font-medium text-zinc-700">Searching for captains</span>
                                    <span className="text-[10px] sm:text-xs text-zinc-500">
                                        {searchStatus.elapsedSeconds}s / {searchStatus.maxSeconds}s
                                    </span>
                                </div>
                                <div className="w-full bg-zinc-200 rounded-full h-1.5 sm:h-2 mb-2">
                                    <div 
                                        className="bg-zinc-900 h-1.5 sm:h-2 rounded-full transition-all duration-500"
                                        style={{ width: `${(searchStatus.elapsedSeconds / searchStatus.maxSeconds) * 100}%` }}
                                    />
                                </div>
                                <p className="text-[10px] sm:text-xs text-zinc-500">
                                    {searchStatus.captainsNotified > 0 
                                        ? `${searchStatus.captainsNotified} captain(s) notified within ${searchStatus.currentRadius}km`
                                        : `Expanding search radius to ${searchStatus.currentRadius}km...`
                                    }
                                </p>
                            </div>
                        )}

                        {/* Cancel Button */}
                        {loading && rideId && (
                            <button
                                onClick={cancelRide}
                                className="w-full mt-2 sm:mt-3 py-2.5 sm:py-3 rounded-xl font-medium text-red-600 border-2 border-red-200 hover:bg-red-50 transition-colors text-sm"
                            >
                                Cancel Request
                            </button>
                        )}

                        {/* Bids Panel - shown when bidding mode is active and bids arrive */}
                        {loading && biddingEnabled && bids.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                                    Captain Offers ({bids.length})
                                </h4>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {bids.map((bid) => (
                                        <div
                                            key={bid.id}
                                            className="p-3 bg-white border-2 border-zinc-100 rounded-xl hover:border-amber-300 transition-colors"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-9 h-9 bg-zinc-100 rounded-lg flex items-center justify-center">
                                                        <User size={16} className="text-zinc-600" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold">{bid.captain.user.fullName}</p>
                                                        <div className="flex items-center gap-1 text-xs text-zinc-500">
                                                            <Star size={10} className="fill-yellow-400 text-yellow-400" />
                                                            <span>{bid.captain.rating.toFixed(1)}</span>
                                                            <span className="text-zinc-300">·</span>
                                                            <span>{bid.captain.totalRides} trips</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold text-zinc-900">₹{bid.offerAmount}</p>
                                                    {bid.estimatedArrival && (
                                                        <p className="text-[10px] text-zinc-500">{bid.estimatedArrival} min away</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] text-zinc-400">
                                                    {bid.captain.vehicleColor} {bid.captain.vehicleModel} · {bid.captain.vehicleNumber}
                                                </p>
                                                <button
                                                    onClick={() => handleSelectBid(bid.id)}
                                                    className="px-4 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors"
                                                >
                                                    Accept
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Empty state when no destination */}
                {!showVehicleOptions && (
                    <div className="flex-1 flex items-center justify-center px-4 sm:px-6">
                        <div className="text-center">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                                <Car size={24} className="sm:w-7 sm:h-7 text-zinc-400" />
                            </div>
                            <p className="text-zinc-500 text-xs sm:text-sm">
                                Enter your destination to see available rides
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel - Map (Hidden on mobile, shown on md+) */}
            <div className="hidden md:flex flex-1 relative">
                {pickupCoords && dropoffCoords ? (
                    <RideMap
                        pickup={[pickupCoords.lat, pickupCoords.lng]}
                        dropoff={[dropoffCoords.lat, dropoffCoords.lng]}
                        path={[]}
                        nearbyCaptains={nearbyCaptains.map(c => [c.lastLat, c.lastLng] as [number, number])}
                    />
                ) : pickupCoords ? (
                    <RideMap
                        pickup={[pickupCoords.lat, pickupCoords.lng]}
                        dropoff={[pickupCoords.lat, pickupCoords.lng]}
                        path={[]}
                        nearbyCaptains={nearbyCaptains.map(c => [c.lastLat, c.lastLng] as [number, number])}
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
