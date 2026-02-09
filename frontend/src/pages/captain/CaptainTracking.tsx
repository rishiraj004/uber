import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapPin, Navigation, MessageSquare, ShieldAlert, Star, Clock, Route, ChevronUp, ChevronDown, AlertTriangle, Banknote, CheckCircle, Smartphone, CreditCard } from 'lucide-react';
import api from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../../context/socket-context';
import toast from 'react-hot-toast';
import { RideMap } from '../../components/RideMap';
import { AxiosError } from 'axios';
import RatingModal from '../../components/RatingModal';
import RideChat from '../../components/RideChat';
import EmergencyModal from '../../components/EmergencyModal';
import InAppCall from '../../components/InAppCall';

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
  paymentMode?: 'CASH' | 'UPI' | 'IN_APP';
  paymentStatus?: string;
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
  
  // Payment collection states
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'IN_APP' | null>(initialRide?.paymentMode || null);
  const [paymentStatus, setPaymentStatus] = useState<string>(initialRide?.paymentStatus || 'PENDING');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isCollectingPayment, setIsCollectingPayment] = useState(false);
  const [isWaitingForOnlinePayment, setIsWaitingForOnlinePayment] = useState(false);

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

  // Initiate payment collection - shows payment modal to captain
  const handleCollectPayment = async () => {
    // Check if payment mode is set
    if (!paymentMode) {
      toast.error('Rider has not selected a payment method yet');
      return;
    }
    
    const rideId = initialRide?.rideId || initialRide?.id;
    try {
      await api.post('/ride/initiate-payment', { rideId });
      setShowPaymentModal(true);
      
      // For online payments (UPI/IN_APP), set waiting state
      if (paymentMode === 'UPI' || paymentMode === 'IN_APP') {
        setIsWaitingForOnlinePayment(true);
      }
      
      toast.success('Payment request sent to rider');
    } catch (err: unknown) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message || "Error initiating payment");
    }
  };

  // Captain confirms they received cash/UPI payment
  const handleConfirmCashPayment = async () => {
    setIsCollectingPayment(true);
    const rideId = initialRide?.rideId || initialRide?.id;
    try {
      await api.post('/ride/confirm-cash-payment', { rideId });
      setPaymentStatus('CAPTURED');
      setShowPaymentModal(false);
      toast.success('Payment confirmed!');
    } catch (err: unknown) {
      const error = err as AxiosError<{ message: string }>;
      toast.error(error.response?.data?.message || "Error confirming payment");
    } finally {
      setIsCollectingPayment(false);
    }
  };

  // Listen for payment events from rider
  useEffect(() => {
    if (!socket) return;
    
    const rideId = initialRide?.rideId || initialRide?.id;
    
    // Handle payment method update from rider
    const handlePaymentMethodUpdated = (data: { rideId: number; paymentMethod: string; fare: number; message: string }) => {
      if (data.rideId === rideId) {
        setPaymentMode(data.paymentMethod as 'CASH' | 'UPI' | 'IN_APP');
        toast.success(data.message || `Payment method updated to ${data.paymentMethod}`);
      }
    };
    
    // Handle both events for payment confirmation
    const handlePaymentReceived = (data: { rideId: number; fare: number; amount?: number }) => {
      if (data.rideId === rideId) {
        setPaymentStatus('CAPTURED');
        setShowPaymentModal(false);
        setIsWaitingForOnlinePayment(false);
        toast.success(`Payment of ₹${data.fare || data.amount} received!`);
      }
    };
    
    const handlePaymentSuccessful = (data: { rideId: number; amount: number; paymentMethod: string; message: string }) => {
      if (data.rideId === rideId) {
        setPaymentStatus('CAPTURED');
        setShowPaymentModal(false);
        setIsWaitingForOnlinePayment(false);
        toast.success(data.message || `Payment of ₹${data.amount} received!`);
      }
    };
    
    socket.on("PAYMENT_METHOD_UPDATED", handlePaymentMethodUpdated);
    socket.on("PAYMENT_RECEIVED", handlePaymentReceived);
    socket.on("PAYMENT_SUCCESSFUL", handlePaymentSuccessful);
    
    return () => { 
      socket.off("PAYMENT_METHOD_UPDATED", handlePaymentMethodUpdated);
      socket.off("PAYMENT_RECEIVED", handlePaymentReceived); 
      socket.off("PAYMENT_SUCCESSFUL", handlePaymentSuccessful);
    };
  }, [socket, initialRide?.rideId, initialRide?.id]);

  const handleCompleteTrip = async () => {
    // Check if payment is collected first
    if (paymentStatus !== 'CAPTURED') {
      toast.error('Please collect payment before completing the ride');
      setShowPaymentModal(true);
      return;
    }
    
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
    } catch (err: unknown) {
      const error = err as AxiosError<{ message: string }>;
      console.error("Error completing trip:", error);
      toast.error(error.response?.data?.message || "Error completing trip");
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

      {/* Payment Collection Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => !isWaitingForOnlinePayment && setShowPaymentModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {!paymentMode ? (
                // Payment mode not yet selected by rider
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-orange-100 flex items-center justify-center mb-4">
                    <AlertTriangle size={32} className="text-orange-600" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900">Waiting for Payment Method</h3>
                  <p className="text-zinc-500 mt-2">
                    Rider has not selected a payment method yet. Please wait.
                  </p>
                  <button
                    onClick={() => setShowPaymentModal(false)}
                    className="w-full mt-6 py-3 bg-zinc-100 text-zinc-700 rounded-2xl font-semibold"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${
                      paymentMode === 'CASH' ? 'bg-green-100' : paymentMode === 'UPI' ? 'bg-purple-100' : 'bg-blue-100'
                    }`}>
                      {paymentMode === 'CASH' && <Banknote size={32} className="text-green-600" />}
                      {paymentMode === 'UPI' && <Smartphone size={32} className="text-purple-600" />}
                      {paymentMode === 'IN_APP' && <CreditCard size={32} className="text-blue-600" />}
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900">
                      {paymentMode === 'CASH' ? 'Collect Cash' : 'Waiting for Online Payment'}
                    </h3>
                    <p className="text-zinc-500 mt-1">
                      {paymentMode === 'CASH' && 'Collect cash from rider and confirm below'}
                      {paymentMode === 'UPI' && 'Rider will pay via UPI through the app'}
                      {paymentMode === 'IN_APP' && 'Rider will pay through the app'}
                    </p>
                  </div>

                  <div className="bg-zinc-50 rounded-2xl p-4 mb-6">
                    <p className="text-sm text-zinc-500 text-center">Amount to collect</p>
                    <p className="text-4xl font-black text-center text-zinc-900">₹{initialRide?.fare}</p>
                  </div>

                  {(paymentMode === 'UPI' || paymentMode === 'IN_APP') ? (
                    <div className="text-center py-4">
                      <div className={`w-10 h-10 border-4 ${paymentMode === 'UPI' ? 'border-purple-600' : 'border-blue-600'} border-t-transparent rounded-full animate-spin mx-auto mb-4`} />
                      <p className="text-zinc-600 font-medium">Waiting for rider to complete payment...</p>
                      <p className="text-xs text-zinc-400 mt-2">Payment confirmation will appear automatically</p>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={handleConfirmCashPayment}
                        disabled={isCollectingPayment}
                        className="w-full py-4 rounded-2xl font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 bg-green-600 text-white hover:bg-green-700"
                      >
                        {isCollectingPayment ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <CheckCircle size={20} />
                            Cash Received
                          </>
                        )}
                      </button>
                      <p className="text-xs text-zinc-400 text-center mt-3">
                        Only confirm after you have received the payment
                      </p>
                    </>
                  )}

                  {paymentMode === 'CASH' && !isCollectingPayment && (
                    <button
                      onClick={() => setShowPaymentModal(false)}
                      className="w-full mt-3 py-3 text-zinc-500 font-medium"
                    >
                      Cancel
                    </button>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
            <div className="flex items-center gap-1.5 sm:gap-2">
              <InAppCall
                rideId={initialRide?.rideId || initialRide?.id || 0}
                recipientName={initialRide?.riderName || 'Rider'}
                recipientRole="RIDER"
              />
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
                <motion.div 
                  key="ongoing-panel"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  {/* Payment Status Indicator */}
                  <div className={`flex items-center justify-between p-3 rounded-xl ${
                    paymentStatus === 'CAPTURED' 
                      ? 'bg-green-50 border border-green-200' 
                      : !paymentMode 
                        ? 'bg-orange-50 border border-orange-200'
                        : 'bg-amber-50 border border-amber-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {paymentStatus === 'CAPTURED' ? (
                        <CheckCircle size={18} className="text-green-600" />
                      ) : !paymentMode ? (
                        <AlertTriangle size={18} className="text-orange-600" />
                      ) : (
                        paymentMode === 'CASH' ? <Banknote size={18} className="text-green-600" /> :
                        paymentMode === 'UPI' ? <Smartphone size={18} className="text-purple-600" /> :
                        <CreditCard size={18} className="text-blue-600" />
                      )}
                      <span className={`text-sm font-medium ${
                        paymentStatus === 'CAPTURED' 
                          ? 'text-green-700' 
                          : !paymentMode 
                            ? 'text-orange-700'
                            : paymentMode === 'CASH' ? 'text-green-700' : paymentMode === 'UPI' ? 'text-purple-700' : 'text-blue-700'
                      }`}>
                        {paymentStatus === 'CAPTURED' 
                          ? 'Payment Collected' 
                          : !paymentMode 
                            ? 'Waiting for rider to select payment method'
                            : `Payment: ${paymentMode === 'IN_APP' ? 'Card' : paymentMode}`
                        }
                      </span>
                    </div>
                    <span className="font-bold text-zinc-900">₹{initialRide?.fare}</span>
                  </div>

                  {/* Collect Payment Button - Only show if payment mode set and not collected */}
                  {paymentMode && paymentStatus !== 'CAPTURED' && (
                    <button 
                      onClick={handleCollectPayment}
                      className={`w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-lg transition-colors flex items-center justify-center gap-2 ${
                        paymentMode === 'CASH' 
                          ? 'bg-green-500 hover:bg-green-600 text-white' 
                          : paymentMode === 'UPI'
                            ? 'bg-purple-500 hover:bg-purple-600 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                    >
                      {paymentMode === 'CASH' && <Banknote size={18} className="sm:w-5 sm:h-5" />}
                      {paymentMode === 'UPI' && <Smartphone size={18} className="sm:w-5 sm:h-5" />}
                      {paymentMode === 'IN_APP' && <CreditCard size={18} className="sm:w-5 sm:h-5" />}
                      {paymentMode === 'CASH' 
                        ? `Collect Cash • ₹${initialRide?.fare}`
                        : paymentMode === 'UPI'
                          ? `Collect UPI • ₹${initialRide?.fare}`
                          : `Request Payment • ₹${initialRide?.fare}`
                      }
                    </button>
                  )}

                  {/* Complete Trip Button - Always show but disable if payment not collected */}
                  <button 
                    onClick={handleCompleteTrip}
                    disabled={loading || paymentStatus !== 'CAPTURED'}
                    className={`w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-lg transition-colors flex items-center justify-center gap-2 ${
                      paymentStatus === 'CAPTURED'
                        ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                        : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                    }`}
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Route size={18} className="sm:w-5 sm:h-5" />
                        {paymentStatus === 'CAPTURED' ? 'Complete Trip' : 'Collect Payment First'}
                      </>
                    )}
                  </button>
                </motion.div>
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
