import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Phone, MessageSquare, ShieldAlert, Star, Clock, Route, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../../context/socket-context';
import toast from 'react-hot-toast';
import { RideMap } from '../../components/RideMap';
import { AxiosError } from 'axios';
import RatingModal from '../../components/RatingModal';
import RideChat from '../../components/RideChat';
import EmergencyModal from '../../components/EmergencyModal';

interface RideData {
  id?: number;
  rideId?: number;
  status: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  fare: number;
  riderName?: string;
  riderRating?: number;
  riderId?: number;
  distanceKm?: number;
  durationMinutes?: number;
}

const CaptainTracking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialRide: RideData = location.state?.ride;
  
  const [rideStatus, setRideStatus] = useState(initialRide?.status || 'ACCEPTED');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [completedRideData, setCompletedRideData] = useState<{ rideId: number; riderName: string; riderId: number } | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);

  // Map States
  const [path, setPath] = useState<[number, number][]>([]);
  const [currentLocation, setCurrentLocation] = useState<[number, number] | undefined>(undefined);
  const [pickupCoords] = useState<[number, number] | null>(
    initialRide ? [initialRide.pickupLat, initialRide.pickupLng] : null
  );
  const [dropoffCoords] = useState<[number, number] | null>(
    initialRide ? [initialRide.dropoffLat, initialRide.dropoffLng] : null
  );

  const socket = useSocket();
  const watchId = useRef<number | null>(null);

  // Fetch existing path on mount
  useEffect(() => {
    const fetchPathHistory = async () => {
      try {
        const rideId = initialRide?.rideId || initialRide?.id;
        const response = await api.get(`/ride/path/${rideId}`);
        setPath(response.data.path || []);
      } catch (err) {
        console.error("Error fetching path history:", err);
      }
    };
    if (initialRide?.rideId || initialRide?.id) fetchPathHistory();
  }, [initialRide?.rideId, initialRide?.id]);

  // Location tracking and socket emission
  useEffect(() => {
    if (socket) {
      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const newCoords: [number, number] = [position.coords.latitude, position.coords.longitude];
          setCurrentLocation(newCoords);
          
          if (rideStatus === 'ONGOING') {
            setPath(prev => [...prev, newCoords]);
          }

          socket.emit('CAPTAIN_LOCATION_UPDATE', {
            location: { latitude: newCoords[0], longitude: newCoords[1] },
            userId: JSON.parse(atob(localStorage.getItem("token")!.split('.')[1])).userId
          });
        },
        (error) => console.error("Location error:", error),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [socket, rideStatus]);

  // Handle ride cancellation
  useEffect(() => {
    if (!socket) return;
    const rideId = initialRide?.rideId || initialRide?.id;
    const handleRideCancellation = (data: { rideId: number }) => {
      if (data.rideId === rideId) {
        toast('Ride Cancelled by Rider', { icon: '❌' });
        navigate('/captain-dashboard');
      }
    };
    socket.on("RIDE_CANCELLED", handleRideCancellation);
    return () => { socket.off("RIDE_CANCELLED", handleRideCancellation); };
  }, [initialRide?.rideId, initialRide?.id, navigate, socket]);

  const handleArrived = async () => {
    try {
      const rideId = initialRide?.rideId || initialRide?.id;
      await api.post('/ride/arrived-at-pickup', { rideId });
      setRideStatus('ARRIVED');
      toast.success('Marked as arrived!');
    } catch (err) {
      console.error("Error updating status to ARRIVED:", err);
      toast.error("Error updating status");
    }
  };

  const handleStartTrip = async () => {
    if (otp.length !== 4) {
      toast.error("Enter 4-digit OTP");
      return;
    }
    setLoading(true);
    try {
      const rideId = initialRide?.rideId || initialRide?.id;
      await api.post('/ride/start-ride', { rideId, otp });
      setRideStatus('ONGOING');
      toast.success('Trip started!');
    } catch (err: unknown) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTrip = async () => {
    setLoading(true);
    try {
      const rideId = initialRide?.rideId || initialRide?.id;
      await api.post('/ride/complete-ride', { rideId });
      setCompletedRideData({
        rideId: rideId ?? 0,
        riderName: initialRide?.riderName || 'Rider',
        riderId: initialRide?.riderId ?? 0
      });
      setShowRatingModal(true);
    } catch (err) {
      console.error("Error completing trip:", err);
      toast.error("Error completing trip");
    } finally {
      setLoading(false);
    }
  };

  const handleRatingSubmit = () => {
    setShowRatingModal(false);
    toast.success('Trip completed!');
    navigate('/captain-dashboard');
  };

  const handleSkipRating = () => {
    setShowRatingModal(false);
    navigate('/captain-dashboard');
  };

  const getStatusConfig = () => {
    switch (rideStatus) {
      case 'ACCEPTED':
        return { color: 'bg-zinc-500', label: 'Heading to Pickup', icon: Navigation };
      case 'ARRIVED':
        return { color: 'bg-zinc-500', label: 'Waiting for Rider', icon: Clock };
      case 'ONGOING':
        return { color: 'bg-zinc-500', label: 'Trip in Progress', icon: Route };
      default:
        return { color: 'bg-zinc-500', label: 'Unknown', icon: MapPin };
    }
  };

  const statusConfig = getStatusConfig();
  const isMapReady = pickupCoords && dropoffCoords;

  return (
    <div className="h-screen w-screen relative bg-zinc-900 overflow-hidden">
      
      {/* SOS Button */}
      <button 
        onClick={() => setIsEmergencyOpen(true)}
        className="absolute top-14 sm:top-16 right-4 sm:right-6 z-30 bg-red-600 text-white p-2.5 sm:p-3 rounded-full shadow-2xl hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center"
        title="Emergency SOS"
        aria-label="Emergency SOS button"
      >
        <AlertTriangle size={20} className="sm:w-6 sm:h-6" />
      </button>
      
      {/* Rating Modal */}
      {completedRideData && (
        <RatingModal
          isOpen={showRatingModal}
          onClose={handleSkipRating}
          onSubmit={handleRatingSubmit}
          rideId={completedRideData.rideId}
          recipientName={completedRideData.riderName}
          reviewType="CAPTAIN_TO_RIDER"
          title="Rate Your Rider"
        />
      )}

      {/* Map */}
      <div className="absolute inset-0 z-0">
        {isMapReady ? (
          <RideMap 
            pickup={pickupCoords} 
            dropoff={dropoffCoords} 
            currentLocation={currentLocation}
            path={path}
          />
        ) : (
          <div className="h-full w-full bg-zinc-100 flex items-center justify-center">
            <p className="text-zinc-500">Loading map...</p>
          </div>
        )}
      </div>

      {/* Status Bar - Top */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className={`${statusConfig.color} px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-center gap-2`}>
          <statusConfig.icon size={16} className="sm:w-4.5 sm:h-4.5 text-white" />
          <span className="text-white font-semibold text-sm sm:text-base">{statusConfig.label}</span>
        </div>
      </div>

      {/* Bottom Sheet */}
      <motion.div 
        initial={{ y: 0 }}
        animate={{ y: isSheetExpanded ? 0 : "calc(100% - 80px)" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-20 shadow-2xl overflow-hidden"
        style={{ maxHeight: '75vh' }}
      >
        {/* Pull Handle */}
        <div 
          onClick={() => setIsSheetExpanded(!isSheetExpanded)}
          className="w-full py-3 sm:py-4 cursor-pointer flex flex-col items-center"
        >
          <div className="w-10 sm:w-12 h-1 sm:h-1.5 bg-zinc-200 rounded-full mb-1.5 sm:mb-2" />
          <div className="flex items-center gap-1 text-zinc-400">
            {isSheetExpanded ? <ChevronDown size={14} className="sm:w-4 sm:h-4" /> : <ChevronUp size={14} className="sm:w-4 sm:h-4" />}
            <span className="text-[10px] sm:text-xs font-medium">{isSheetExpanded ? 'Collapse' : 'Expand'}</span>
          </div>
        </div>

        <div className={`px-4 sm:px-6 pb-6 sm:pb-8 overflow-y-auto ${!isSheetExpanded ? 'hidden' : ''}`} style={{ maxHeight: 'calc(75vh - 60px)' }}>
          {/* Rider Info */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-11 h-11 sm:w-14 sm:h-14 bg-linear-to-br from-blue-500 to-blue-600 text-white rounded-xl sm:rounded-2xl flex items-center justify-center font-black text-lg sm:text-xl shadow-lg">
                {initialRide?.riderName?.[0]?.toUpperCase() || 'R'}
              </div>
              <div>
                <p className="text-[9px] sm:text-xs text-zinc-400 font-semibold uppercase tracking-wider">Rider</p>
                <h3 className="text-base sm:text-xl font-bold text-zinc-900">{initialRide?.riderName || 'Customer'}</h3>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star size={12} className="sm:w-3.5 sm:h-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs sm:text-sm font-medium text-zinc-600">
                    {initialRide?.riderRating?.toFixed(1) || '5.0'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-1.5 sm:gap-2">
              <button 
                title="Call rider" 
                className="p-2.5 sm:p-3 bg-zinc-100 rounded-xl text-zinc-600 hover:bg-zinc-200 transition-colors"
              >
                <Phone size={18} className="sm:w-5 sm:h-5" />
              </button>
              <button 
                onClick={() => setIsChatOpen(true)}
                title="Message rider" 
                className="p-2.5 sm:p-3 bg-zinc-100 rounded-xl text-zinc-600 hover:bg-zinc-200 transition-colors"
              >
                <MessageSquare size={18} className="sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          {/* Trip Details */}
          <div className="bg-zinc-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin size={14} className="sm:w-4 sm:h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Pickup</p>
                  <p className="text-xs sm:text-sm font-semibold text-zinc-900 truncate">{initialRide?.pickupAddress}</p>
                </div>
              </div>
              <div className="ml-3.5 sm:ml-4 border-l-2 border-dashed border-zinc-200 h-3 sm:h-4" />
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-zinc-900 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Navigation size={14} className="sm:w-4 sm:h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] sm:text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Dropoff</p>
                  <p className="text-xs sm:text-sm font-semibold text-zinc-900 truncate">{initialRide?.dropoffAddress}</p>
                </div>
              </div>
            </div>
            
            {/* Fare Display */}
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-zinc-200 flex items-center justify-between">
              <span className="text-xs sm:text-sm text-zinc-500">Trip Fare</span>
              <span className="text-lg sm:text-xl font-black text-zinc-900">₹{initialRide?.fare}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 sm:space-y-4">
            <AnimatePresence mode="wait">
              {rideStatus === 'ACCEPTED' && (
                <motion.button 
                  key="arrived"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  onClick={handleArrived}
                  className="w-full bg-blue-600 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <MapPin size={18} className="sm:w-5 sm:h-5" />
                  I Have Arrived
                </motion.button>
              )}

              {rideStatus === 'ARRIVED' && (
                <motion.div 
                  key="otp-panel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 sm:space-y-4"
                >
                  <div className="text-center">
                    <p className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 sm:mb-3">
                      Enter Rider's OTP
                    </p>
                    <div className="flex justify-center gap-2 sm:gap-3">
                      {[0, 1, 2, 3].map((index) => (
                        <input
                          key={index}
                          type="text"
                          maxLength={1}
                          value={otp[index] || ''}
                          onChange={(e) => {
                            const newOtp = otp.split('');
                            newOtp[index] = e.target.value;
                            setOtp(newOtp.join(''));
                            // Auto-focus next input
                            if (e.target.value && index < 3) {
                              const nextInput = e.target.parentElement?.children[index + 1] as HTMLInputElement;
                              nextInput?.focus();
                            }
                          }}
                          className="w-11 h-11 sm:w-14 sm:h-14 text-center text-xl sm:text-2xl font-black bg-zinc-100 rounded-lg sm:rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={handleStartTrip}
                    disabled={loading || otp.length !== 4}
                    className="w-full bg-amber-500 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Navigation size={18} className="sm:w-5 sm:h-5" />
                        Start Trip
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {rideStatus === 'ONGOING' && (
                <motion.button 
                  key="complete"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={handleCompleteTrip}
                  disabled={loading}
                  className="w-full bg-green-600 text-white py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Route size={18} className="sm:w-5 sm:h-5" />
                      Complete Trip • Collect ₹{initialRide?.fare}
                    </>
                  )}
                </motion.button>
              )}
            </AnimatePresence>

            {/* Emergency Button */}
            <button 
              onClick={() => setIsEmergencyOpen(true)}
              className="w-full flex items-center justify-center gap-2 text-red-500 font-semibold text-xs sm:text-sm py-2.5 sm:py-3 hover:bg-red-50 rounded-xl transition-colors"
            >
              <ShieldAlert size={16} className="sm:w-4.5 sm:h-4.5" />
              Emergency Support
            </button>
          </div>
        </div>
      </motion.div>

      {/* Chat Component */}
      <RideChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        rideId={initialRide?.rideId || initialRide?.id || 0}
        recipientName={initialRide?.riderName || 'Rider'}
        recipientRole="RIDER"
      />

      {/* Emergency Modal */}
      <EmergencyModal
        isOpen={isEmergencyOpen}
        onClose={() => setIsEmergencyOpen(false)}
        rideId={initialRide?.rideId || initialRide?.id}
        currentLocation={currentLocation ? { lat: currentLocation[0], lng: currentLocation[1] } : null}
        driverName={initialRide?.riderName}
      />
    </div>
  );
};

export default CaptainTracking;
