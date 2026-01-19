import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { MapPin, Navigation, DollarSign, Power, Star, Clock, TrendingUp, Zap, ChevronRight, User, LogOut, History, FileText, AlertCircle } from 'lucide-react';
import { useSocket } from '../../context/socket-context';
import toast from 'react-hot-toast';
import { RideMap } from '../../components/RideMap';
import { motion, AnimatePresence } from 'framer-motion';

interface RideRequest {
  rideId: number;
  riderName: string;
  riderRating?: number;
  fare: number;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  distanceKm?: number;
  durationMinutes?: number;
}

interface Analytics {
  totalEarnings: number;
  totalTrips: number;
  totalOnlineHours: number;
}

interface VerificationStatus {
  isVerified: boolean;
  canGoOnline: boolean;
  pendingCount: number;
  rejectedCount: number;
  message: string;
}

const CaptainDashboard = () => {
  const [isOnline, setIsOnline] = useState(false);
  const [currentRideRequest, setCurrentRideRequest] = useState<RideRequest | null>(null);
  const [analytics, setAnalytics] = useState<Analytics>({ totalEarnings: 0, totalTrips: 0, totalOnlineHours: 0 });
  const [currentLocation, setCurrentLocation] = useState<[number, number] | null>(null);
  const [requestTimer, setRequestTimer] = useState(30);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  
  const watchId = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasRideRef = useRef(false);
  const socket = useSocket();
  const navigate = useNavigate();

  // Fetch captain status and analytics
  useEffect(() => {
    const fetchCaptainStatus = async () => {
      try {
        const response = await api.get('/captain/status');
        setIsOnline(response.data.isOnline || false);
        
        const analyticsResponse = await api.get('/captain/analytics');
        setAnalytics({
          totalEarnings: analyticsResponse.data.totalEarnings || 0,
          totalTrips: analyticsResponse.data.totalTrips || 0,
          totalOnlineHours: analyticsResponse.data.totalOnlineHours || 0
        });

        // Fetch verification status
        const verificationResponse = await api.get('/documents/verification-status');
        setVerificationStatus(verificationResponse.data);
      } catch (error) {
        console.error("Error fetching captain status", error);
      }
    };
    fetchCaptainStatus();
  }, []);

  // Check for active ride
  useEffect(() => {
    const checkActiveRide = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const userId = JSON.parse(atob(token.split('.')[1])).userId;
        const response = await api.get(`/ride/details/${userId}`);
        if (response.data.ride && ['ACCEPTED', 'ARRIVED', 'ONGOING'].includes(response.data.ride.status)) {
          navigate("/captain-tracking", { state: { ride: response.data.ride } });
        }
      } catch (err) {
        console.error("Error checking active ride:", err);
      }
    };
    checkActiveRide();
  }, [navigate]);

  // Get current location
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation([position.coords.latitude, position.coords.longitude]);
      },
      (error) => console.error("Location error:", error),
      { enableHighAccuracy: true }
    );
  }, []);

  // Location tracking when online
  useEffect(() => {
    if (isOnline && socket) {
      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const newLocation: [number, number] = [position.coords.latitude, position.coords.longitude];
          setCurrentLocation(newLocation);
          console.log("Emitting location update:", newLocation);
          socket.emit('CAPTAIN_LOCATION_UPDATE', {
            location: { latitude: newLocation[0], longitude: newLocation[1] }
          });
        },
        (error) => console.error("Error getting location:", error),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    } else {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    }

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [isOnline, socket]);

  // Ride request timer - reset timer when request changes  
  useEffect(() => {
    if (!currentRideRequest?.rideId) {
      hasRideRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    
    // Start with 30 seconds on new ride request
    hasRideRef.current = true;
    let isFirstTick = true;
    
    timerRef.current = setInterval(() => {
      setRequestTimer((prev) => {
        // Set initial timer on first tick
        if (isFirstTick) {
          isFirstTick = false;
          return 30;
        }
        
        if (prev <= 1) {
          setCurrentRideRequest(null);
          hasRideRef.current = false;
          if (timerRef.current) clearInterval(timerRef.current);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
     
  }, [currentRideRequest?.rideId]);

  // Socket listeners
  useEffect(() => {
    if (!socket) {
      console.log("Socket not available");
      return;
    }

    console.log("Setting up socket listeners for captain dashboard");

    const handleNewRideRequest = (data: RideRequest) => {
      console.log("New ride request received with full data:", {
        rideId: data.rideId,
        riderName: data.riderName,
        fare: data.fare,
        pickupAddress: data.pickupAddress,
        dropoffAddress: data.dropoffAddress,
        hasPickupLat: data.pickupLat !== undefined,
        hasPickupLng: data.pickupLng !== undefined,
        hasDropoffLat: data.dropoffLat !== undefined,
        hasDropoffLng: data.dropoffLng !== undefined,
        distanceKm: data.distanceKm,
        durationMinutes: data.durationMinutes,
        fullData: data
      });
      setCurrentRideRequest(data);
      toast('New Ride Request!', {
        icon: '🚗',
        style: { borderRadius: '10px', background: '#18181B', color: '#fff' },
      });
    };

    const handleCancelRide = (data: { rideId: number }) => {
      if (currentRideRequest && data.rideId === currentRideRequest.rideId) {
        setCurrentRideRequest(null);
        toast('Ride Request Cancelled by Rider', { icon: '❌' });
      }
    };

    socket.on('NEW_RIDE_REQUEST', handleNewRideRequest);
    socket.on('RIDE_CANCELLED', handleCancelRide);

    return () => { 
      socket.off("NEW_RIDE_REQUEST", handleNewRideRequest); 
      socket.off("RIDE_CANCELLED", handleCancelRide);
    };
  }, [socket, currentRideRequest]);

  const handleStatusToggle = async () => {
    // Check verification status before going online
    if (!isOnline && verificationStatus && !verificationStatus.canGoOnline) {
      toast.error('Please complete document verification first');
      navigate('/captain/documents');
      return;
    }

    try {
      const response = await api.patch('/captain/toggle-status');
      setIsOnline(response.data.isOnline);
      toast(response.data.isOnline ? 'You are now online' : 'You are now offline', {
        icon: response.data.isOnline ? '🟢' : '🔴'
      });

      // If going online, immediately send current location to server
      if (response.data.isOnline && currentLocation && socket) {
        console.log("Captain is now online, sending initial location:", currentLocation);
        socket.emit('CAPTAIN_LOCATION_UPDATE', {
          location: { latitude: currentLocation[0], longitude: currentLocation[1] }
        });
      }
    } catch (error: any) {
      console.error("Error toggling status", error);
      if (error.response?.data?.redirectTo) {
        toast.error(error.response.data.message || 'Verification required');
        navigate(error.response.data.redirectTo);
      } else {
        toast.error("Could not update status");
      }
    }
  };

  const acceptRide = async (rideId: number) => {
    try {
      await api.post('/ride/accept-ride', { rideId });
      const userId = JSON.parse(atob(localStorage.getItem("token")!.split('.')[1])).userId;
      const RideResponse = await api.get(`/ride/details/${userId}`);
      navigate('/captain-tracking', { state: { ride: RideResponse.data.ride } });
      setCurrentRideRequest(null);
    } catch (error) {
      console.error("Error accepting ride", error);
      toast.error("Could not accept ride.");
    }
  };

  const ignoreRide = () => {
    setCurrentRideRequest(null);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  };

  // Calculate pickup coordinates for map preview
  const ridePreviewCoords = useMemo(() => {
    if (!currentRideRequest) {
      console.log("No current ride request");
      return null;
    }
    console.log("Calculating ride preview coords:", {
      pickupLat: currentRideRequest.pickupLat,
      pickupLng: currentRideRequest.pickupLng,
      dropoffLat: currentRideRequest.dropoffLat,
      dropoffLng: currentRideRequest.dropoffLng
    });
    if (currentRideRequest.pickupLat && currentRideRequest.pickupLng) {
      return {
        pickup: [currentRideRequest.pickupLat, currentRideRequest.pickupLng] as [number, number],
        dropoff: currentRideRequest.dropoffLat && currentRideRequest.dropoffLng 
          ? [currentRideRequest.dropoffLat, currentRideRequest.dropoffLng] as [number, number]
          : null
      };
    }
    return null;
  }, [currentRideRequest]);

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-50 overflow-hidden">
      
      {/* Verification Banner */}
      {verificationStatus && !verificationStatus.canGoOnline && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between z-30">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-500" size={20} />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {verificationStatus.isVerified 
                  ? 'Account verified but missing documents'
                  : 'Complete document verification to start accepting rides'
                }
              </p>
              <p className="text-xs text-amber-600">
                {verificationStatus.uploadedDocuments} of {verificationStatus.requiredDocuments} documents uploaded
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/captain/documents')}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
          >
            <FileText size={16} />
            Upload Documents
          </button>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-zinc-100 flex justify-between items-center z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-zinc-300'}`} />
            <span className="font-bold text-lg text-zinc-900">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleStatusToggle}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all duration-200
              ${isOnline 
                ? 'bg-red-50 text-red-600 hover:bg-red-100' 
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }
            `}
          >
            <Power size={18} />
            {isOnline ? 'Go Offline' : 'Go Online'}
          </button>
          <button
            onClick={() => navigate('/ride-history')}
            className="p-2.5 hover:bg-zinc-100 rounded-xl transition-colors"
            title="Ride History"
          >
            <History size={20} className="text-zinc-500" />
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="p-2.5 hover:bg-zinc-100 rounded-xl transition-colors"
            title="Profile"
          >
            <User size={20} className="text-zinc-500" />
          </button>
          <button
            onClick={handleLogout}
            className="p-2.5 hover:bg-zinc-100 rounded-xl transition-colors"
            title="Logout"
          >
            <LogOut size={20} className="text-zinc-500" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left Panel - Stats */}
        <div className="w-full md:w-95 bg-white border-r border-zinc-100 p-6 overflow-y-auto">
          
          {/* Earnings Card */}
          <div className="bg-linear-to-br from-zinc-900 to-zinc-800 rounded-2xl p-6 text-white mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-zinc-400 text-sm font-medium">Today's Earnings</p>
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <DollarSign size={20} className="text-green-400" />
              </div>
            </div>
            <h2 className="text-4xl font-black mb-4">₹{analytics.totalEarnings.toFixed(0)}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp size={14} className="text-blue-400" />
                  <span className="text-xs text-zinc-400">Trips</span>
                </div>
                <p className="text-xl font-bold">{analytics.totalTrips}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock size={14} className="text-purple-400" />
                  <span className="text-xs text-zinc-400">Hours</span>
                </div>
                <p className="text-xl font-bold">{analytics.totalOnlineHours.toFixed(1)}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Performance</h3>
            <div className="bg-zinc-50 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                  <Star size={18} className="text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Rating</p>
                  <p className="text-lg font-bold text-zinc-900">4.9</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-zinc-400" />
            </div>
            <div className="bg-zinc-50 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <Zap size={18} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Acceptance Rate</p>
                  <p className="text-lg font-bold text-zinc-900">95%</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-zinc-400" />
            </div>
          </div>

          {/* Status Message */}
          {isOnline && !currentRideRequest && (
            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center animate-pulse">
                  <Navigation size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-blue-900">Searching for rides...</p>
                  <p className="text-sm text-blue-600">Stay in high-demand areas</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Map */}
        <div className="flex-1 relative">
          {currentLocation ? (
            <RideMap
              pickup={currentLocation}
              dropoff={currentLocation}
              currentLocation={currentLocation}
              path={[]}
            />
          ) : (
            <div className="h-full w-full bg-zinc-100 flex items-center justify-center">
              <div 
                className="absolute inset-0 opacity-20" 
                style={{ 
                  backgroundImage: 'radial-gradient(#18181B 1px, transparent 0)', 
                  backgroundSize: '24px 24px' 
                }} 
              />
              <div className="relative z-10 text-center">
                <div className="bg-white px-6 py-4 rounded-2xl shadow-lg">
                  <p className="text-zinc-600 font-medium">Getting your location...</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Ride Request Modal - Outside overflow containers */}
      <AnimatePresence mode="wait">
        {currentRideRequest && (
          <motion.div
            key="ride-request-card"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-125 z-9999"
            style={{ pointerEvents: 'auto' }}
          >
                <div className="bg-white rounded-3xl shadow-2xl border border-zinc-100 overflow-hidden">
                  {/* Timer Bar */}
                  <div className="h-1.5 bg-zinc-100">
                    <motion.div 
                      className="h-full bg-zinc-900"
                      initial={{ width: "100%" }}
                      animate={{ width: "0%" }}
                      transition={{ duration: 30, ease: "linear" }}
                    />
                  </div>

                  <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-5">
                      <div>
                        <span className="inline-block bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-lg mb-2">
                          NEW REQUEST • {requestTimer}s
                        </span>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center">
                            <User size={24} className="text-zinc-600" />
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-zinc-900">{currentRideRequest.riderName}</h4>
                            <div className="flex items-center gap-1">
                              <Star size={14} className="fill-yellow-400 text-yellow-400" />
                              <span className="text-sm font-medium text-zinc-600">
                                {currentRideRequest.riderRating?.toFixed(1) || '5.0'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-black text-zinc-900">₹{currentRideRequest.fare}</p>
                        {currentRideRequest.distanceKm && (
                          <p className="text-sm text-zinc-500">{currentRideRequest.distanceKm.toFixed(1)} km</p>
                        )}
                      </div>
                    </div>

                    {/* Route Preview */}
                    {ridePreviewCoords && ridePreviewCoords.dropoff && (
                      <div className="h-32 rounded-xl overflow-hidden mb-5 border border-zinc-100">
                        <RideMap
                          pickup={ridePreviewCoords.pickup}
                          dropoff={ridePreviewCoords.dropoff}
                          currentLocation={currentLocation || undefined}
                          path={[]}
                        />
                      </div>
                    )}

                    {/* Locations */}
                    <div className="space-y-3 mb-6">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                          <MapPin size={16} className="text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-400 font-semibold uppercase">Pickup</p>
                          <p className="text-sm font-medium text-zinc-900 truncate">{currentRideRequest.pickupAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center shrink-0">
                          <Navigation size={16} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-400 font-semibold uppercase">Dropoff</p>
                          <p className="text-sm font-medium text-zinc-900 truncate">{currentRideRequest.dropoffAddress}</p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button 
                        onClick={ignoreRide}
                        className="flex-1 py-3.5 border-2 border-zinc-200 rounded-xl font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
                      >
                        Ignore
                      </button>
                      <button 
                        onClick={() => acceptRide(currentRideRequest.rideId)}
                        className="flex-2 py-3.5 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                      >
                        Accept Ride
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
                    </AnimatePresence>
                </div>
             
            );
          };
          
          export default CaptainDashboard;

