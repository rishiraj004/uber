import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  MessageSquare, ShieldCheck, 
  XCircle, AlertTriangle, CheckCircle2, Navigation,
  Banknote, Smartphone, CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import { useSocket } from '../../context/socket-context';
import { RideMap } from '../../components/RideMap';
import RideChat from '../../components/RideChat';
import EmergencyModal from '../../components/EmergencyModal';
import InAppCall from '../../components/InAppCall';

// Declare Razorpay on window for TypeScript
declare global {
    interface Window {
        Razorpay: any;
    }
}

const StatusStepper = ({ currentStatus }: { currentStatus: string }) => {
  const steps = [
    { label: 'Accepted', status: 'ACCEPTED' },
    { label: 'Arrived', status: 'ARRIVED' },
    { label: 'On Trip', status: 'ONGOING' },
    { label: 'Done', status: 'COMPLETED' }
  ];

  const getStatusIndex = (status: string) => steps.findIndex(s => s.status === status);
  const currentIndex = getStatusIndex(currentStatus);

  return (
    <div className="flex items-center justify-between w-full px-2 mb-6">
      {steps.map((step, index) => (
        <React.Fragment key={step.label}>
          <div className="flex flex-col items-center relative">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors ${
              index <= currentIndex ? 'bg-black border-black text-white' : 'bg-white border-gray-300 text-gray-300'
            }`}>
              {index < currentIndex ? <CheckCircle2 size={14} /> : <span className="text-[10px]">{index + 1}</span>}
            </div>
            <span className={`text-[10px] absolute -bottom-4 whitespace-nowrap font-bold ${
              index <= currentIndex ? 'text-black' : 'text-gray-400'
            }`}>{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <div className={`flex-1 h-0.5px mx-1 ${index < currentIndex ? 'bg-black' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

const RideCancelled = async (rideId: number) => {
  await api.post('/ride/cancel-ride', { rideId });
}

const RiderTracking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const rideData = location.state?.ride;
  
  const [rideStatus, setRideStatus] = useState(rideData?.status || 'ACCEPTED');
  
  // --- ADDED: State to track if the sheet is hidden ---
  const [isSheetHidden, setIsSheetHidden] = useState(false);
  
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Emergency modal state
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'IN_APP' | null>(rideData?.paymentMode || null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isUpdatingPaymentMethod, setIsUpdatingPaymentMethod] = useState(false);
  const [showPaymentSelection, setShowPaymentSelection] = useState(!rideData?.paymentMode);

  const [path, setPath] = useState<[number, number][]>([]);
  const [currentLocation, setCurrentLocation] = useState<[number, number] | undefined>(undefined);

  const [pickupCoords, setPickupCoords] = useState<[number, number] | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<[number, number] | null>(null);

  interface RideDetails {
    vehicleNumber: string;
    captainName: string;
    vehicleColor: string;
    vehicleModel: string;
    vehicleType: string;
    rating: number;
    status: string;
    fare: number;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    otp: string;
  }
  
  const [rideDetails, setRideDetails] = useState<RideDetails | null>(null);

  // Live ETA state
  const [captainEta, setCaptainEta] = useState<{ distance: number; duration: number } | null>(null);

  // Razorpay payment handler for IN_APP payments
  const handleRazorpayPayment = async () => {
    const fare = rideDetails?.fare || rideData?.fare || 0;
    const rideId = rideData?.rideId || rideData?.id;
    
    if (!rideId || !fare) return;
    
    setIsProcessingPayment(true);
    
    try {
      // Create order on backend - use correct endpoint
      const orderResponse = await api.post('/payment/order', { rideId });
      
      const { orderId, amount, currency, key } = orderResponse.data;
      
      // Initialize Razorpay with proper configuration
      const options: any = {
        key: key || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: amount, // Amount already in paise from backend
        currency: currency || 'INR',
        name: 'Uber Clone',
        description: `Ride Payment #${rideId}`,
        order_id: orderId,
        handler: async function (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) {
          try {
            // Verify payment on backend with correct field names
            await api.post('/payment/verify', {
              rideId,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature
            });
            
            setShowPaymentModal(false);
            setIsProcessingPayment(false);
          } catch (error) {
            console.error('Payment confirmation failed:', error);
            setIsProcessingPayment(false);
            alert('Payment confirmation failed. Please contact support.');
          }
        },
        prefill: {
          name: 'Rider',
          email: 'rider@example.com',
        },
        theme: {
          color: '#000000'
        },
        modal: {
          ondismiss: function() {
            setIsProcessingPayment(false);
          }
        }
      };

      // Configure for UPI intent if payment mode is UPI
      if (paymentMode === 'UPI') {
        options.config = {
          display: {
            blocks: {
              upi: {
                name: "Pay via UPI",
                instruments: [{ method: "upi" }]
              }
            },
            sequence: ["block.upi"],
            preferences: { show_default_blocks: false }
          }
        };
      }
      
      // Open Razorpay checkout
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        console.error("Payment failed:", response.error);
        setIsProcessingPayment(false);
        alert(`Payment failed: ${response.error.description}`);
      });
      rzp.open();
    } catch (error: any) {
      console.error('Failed to create payment order:', error);
      alert(error.response?.data?.message || 'Failed to initiate payment. Please try again.');
      setIsProcessingPayment(false);
    }
  };

  // Function to update payment method
  const handleUpdatePaymentMethod = async (method: 'CASH' | 'UPI' | 'IN_APP') => {
    const rideId = rideData?.rideId || rideData?.id;
    if (!rideId) return;
    
    setIsUpdatingPaymentMethod(true);
    try {
      await api.patch(`/ride/${rideId}/payment-method`, { paymentMethod: method });
      setPaymentMode(method);
      setShowPaymentSelection(false);
    } catch (error) {
      console.error('Failed to update payment method:', error);
      alert('Failed to update payment method. Please try again.');
    } finally {
      setIsUpdatingPaymentMethod(false);
    }
  };

  // Function to fetch ETA from captain to pickup/dropoff
  const fetchCaptainEta = useCallback(async (captainLat: number, captainLng: number) => {
    if (!pickupCoords) return;
    
    // Use pickup coords if not yet arrived/ongoing, dropoff if ongoing
    const targetLat = rideStatus === 'ONGOING' && dropoffCoords ? dropoffCoords[0] : pickupCoords[0];
    const targetLng = rideStatus === 'ONGOING' && dropoffCoords ? dropoffCoords[1] : pickupCoords[1];

    try {
      const response = await api.get('/map/directions', {
        params: {
          originLat: captainLat,
          originLng: captainLng,
          destLat: targetLat,
          destLng: targetLng
        }
      });
      setCaptainEta({
        distance: response.data.distanceKm,
        duration: response.data.durationMinutes
      });
    } catch (error) {
      console.error("Error fetching captain ETA:", error);
    }
  }, [pickupCoords, dropoffCoords, rideStatus]);
  
  useEffect(() => {
    const fetchCoords = async () => {
      const token = localStorage.getItem('token');
      const userId = token ? JSON.parse(atob(token.split('.')[1])).userId : null;
      const response = await api.get(`/ride/details/${userId}`);
      setPickupCoords([response.data.ride.pickupLat, response.data.ride.pickupLng]);
      setDropoffCoords([response.data.ride.dropoffLat, response.data.ride.dropoffLng]);
    }    
    fetchCoords();
  }, []);

  const socket = useSocket();

  useEffect(() => {
    const fetchRidePath = async () => {
      const rideId = rideData?.rideId || rideData?.id;
      if (!rideId) return;
      try {
        const response = await api.get(`/ride/path/${rideId}`);
        setPath(response.data.path || []);
      } catch (error) {
        console.error("Error fetching ride path:", error);
      }
    };

    const fetchRideDetails = async () => {
      const token = localStorage.getItem('token');
      const userId = token ? JSON.parse(atob(token.split('.')[1])).userId : null;
      const rideId = rideData?.rideId || rideData?.id;
      if (!rideId || !userId) return;
      try {
        const response = await api.get(`/ride/details/${userId}`);
        setRideStatus(response.data.ride.status);
        setRideDetails(response.data.ride);
        console.log("Fetched ride details:", response.data.ride);
      } catch (error) {
        console.error("Error fetching ride details:", error);
      }
    };
    fetchRideDetails();
    fetchRidePath();
  }, [rideData, rideStatus]);

  useEffect(() => {
    if (!socket) return;

    const rideId = rideData?.rideId || rideData?.id;
    api.get(`/ride/path/${rideId}`).then(response => {
      setPath(response.data.path || []);
    }).catch(error => {
      console.error("Error fetching initial ride path:", error);
    });

    const listeners = {
      RIDE_CANCELLED: () => { navigate('/rider-dashboard'); setRideStatus('CANCELLED'); },
      CAPTAIN_ARRIVED: () => { setRideStatus('ARRIVED'); },
      RIDE_STARTED: () => { setRideStatus('ONGOING'); },
      RIDE_COMPLETED: (data: { 
        rideId: number; 
        fare: number; 
        estimatedDistance?: number; 
        estimatedDuration?: number;
        paymentMode?: string;
      }) => { 
        setRideStatus('COMPLETED'); 
        // Pass complete ride data including fare, distance/duration and payment mode to receipt
        navigate('/rider-receipt', { 
          state: { 
            ride: {
              ...rideDetails,
              rideId: data.rideId,
              fare: data.fare,
              estimatedDistance: data.estimatedDistance,
              estimatedDuration: data.estimatedDuration,
              paymentStatus: 'PAID',
              paymentMode: data.paymentMode || paymentMode
            }
          } 
        }); 
      },
      CAPTAIN_LOCATION_UPDATE: (data: { latitude: number; longitude: number }) => {
        const newCoords: [number, number] = [data.latitude, data.longitude];
        setCurrentLocation(newCoords);
        if (rideStatus === 'ONGOING') {
          setPath(prevPath => [...prevPath, newCoords]);
        }
        // Fetch live ETA on location update (throttled by backend updates ~10s)
        fetchCaptainEta(data.latitude, data.longitude);
      },
      PAYMENT_REQUESTED: (data: { rideId: number; fare: number; paymentMode: string }) => {
        // Captain has requested payment collection
        setPaymentMode(data.paymentMode as 'CASH' | 'UPI' | 'IN_APP');
        setShowPaymentModal(true);
      },
      PAYMENT_CONFIRMED: () => {
        // Captain confirmed cash/UPI payment
        setShowPaymentModal(false);
      }
    }
    Object.entries(listeners).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    return () => { 
      Object.keys(listeners).forEach(event => { socket.off(event) });
    };
  }, [rideData, navigate, socket, rideStatus, rideDetails, fetchCaptainEta]);

  return (
    <div className="h-screen w-screen flex flex-col relative bg-gray-100 overflow-hidden font-sans">
      
      {/* 1. SOS Button */}
      <button 
        onClick={() => setIsEmergencyOpen(true)}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 z-50 bg-red-600 text-white p-2.5 sm:p-3 rounded-full shadow-2xl hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center"
        title="Emergency SOS"
        aria-label="Emergency SOS button"
      >
        <AlertTriangle size={20} className="sm:w-6 sm:h-6" />
      </button>

      {/* absolute inset-0 z-0 - full */}

      {/* 2. Fullscreen Map */}
      <div className='absolute inset-0 z-0 bg-slate-300 transition-all duration-300'>
        <div className="absolute inset-0 opacity-20 pointer-events-none z-10" 
        style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '30px 30px' }}>
        </div>
        
        {/* Full Screen Map behind everything */}
        <div className="absolute inset-0 z-0">
          {pickupCoords && dropoffCoords && (
            <RideMap 
              pickup={pickupCoords} 
              dropoff={dropoffCoords} 
              currentLocation={currentLocation}
              path={path}
            />
          )}
        </div>
      </div>

      {/* 3. Dynamic Bottom Sheet */}
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: isSheetHidden ? "calc(100% - 60px)" : 0 }} 
        transition={{ type: "spring", damping: 25, stiffness: 120 }}
        className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl sm:rounded-t-4xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-4 sm:p-6 z-20 max-h-[85vh] overflow-y-auto"
      >
        {/* Clickable Pull Bar to toggle sheet */}
        <div 
          onClick={() => setIsSheetHidden(!isSheetHidden)}
          className="w-full py-2 -mt-1 sm:-mt-2 mb-3 sm:mb-4 cursor-pointer group"
        >
          <div className="w-10 sm:w-12 h-1 sm:h-1.5 bg-gray-200 rounded-full mx-auto group-hover:bg-gray-300 transition-colors" />
        </div>

        <StatusStepper currentStatus={rideStatus} />

        {/* 4. Safety Verification */}
        <div className="bg-blue-50 border border-blue-100 p-2.5 sm:p-3 rounded-xl mb-4 sm:mb-6 flex items-start gap-2 sm:gap-3">
          <ShieldCheck size={18} className="sm:w-5 sm:h-5 text-blue-600 shrink-0" />
          <p className="text-[10px] sm:text-[11px] text-blue-800 leading-tight">
            <span className="font-bold">Safety Check:</span> Verify that the vehicle plate <span className="underline font-black">{rideDetails?.vehicleNumber || 'BR-01-1234'}</span> matches the car arriving. Do not enter if it doesn't match.
          </p>
        </div>

        {/* Captain & Vehicle Info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-xl sm:rounded-2xl overflow-hidden border border-gray-100">
                <img src="https://via.placeholder.com/150" alt="Captain" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-1.5 sm:-bottom-2 -right-1.5 sm:-right-2 bg-yellow-400 text-[9px] sm:text-[10px] font-black px-1 sm:px-1.5 py-0.5 rounded border-2 border-white">
                {rideDetails?.rating || '4.8'} ★
              </div>
            </div>
            <div>
              <p className="font-bold text-base sm:text-xl">{rideDetails?.captainName || 'Aman Gupta'}</p>
              <p className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase tracking-wider">{`${rideDetails?.vehicleColor || 'White'} ${rideDetails?.vehicleModel || 'Maruti Swift'}`}</p>
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            <InAppCall
              rideId={rideData?.rideId || rideData?.id || 0}
              recipientName={rideDetails?.captainName || 'Captain'}
              recipientRole="CAPTAIN"
            />
            <button 
              onClick={() => setIsChatOpen(true)}
              className="p-3 sm:p-4 bg-gray-100 rounded-xl sm:rounded-2xl hover:bg-gray-200 transition-colors" 
              title="Message driver" 
              aria-label="Message driver"
            >
              <MessageSquare size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Live ETA Display */}
        {captainEta && rideStatus !== 'COMPLETED' && (
          <div className="bg-green-50 border border-green-100 p-3 sm:p-4 rounded-xl mb-4 sm:mb-6 flex items-center gap-2.5 sm:gap-3">
            <div className="bg-green-500 text-white p-1.5 sm:p-2 rounded-lg sm:rounded-xl">
              <Navigation size={18} className="sm:w-5 sm:h-5" />
            </div>
            <div className="flex-1">
              <p className="text-xs sm:text-sm font-bold text-green-800">
                {rideStatus === 'ONGOING' 
                  ? `${Math.round(captainEta.duration)} min to destination`
                  : `Captain is ${Math.round(captainEta.duration)} min away`
                }
              </p>
              <p className="text-[10px] sm:text-xs text-green-600">
                {captainEta.distance.toFixed(1)} km {rideStatus === 'ONGOING' ? 'remaining' : 'from pickup'}
              </p>
            </div>
          </div>
        )}

        {/* 5. OTP & Fare */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-zinc-900 text-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl flex flex-col items-center shadow-lg">
             <p className="text-[8px] sm:text-[9px] uppercase opacity-50 tracking-[0.2em] font-black mb-1">Trip OTP</p>
             <h3 className="text-2xl sm:text-3xl font-black tracking-[0.15em]">{rideData?.otp || '5291'}</h3>
          </div>
          
          <div className="relative group">
            <div className="bg-white border-2 border-gray-100 p-4 sm:p-5 rounded-2xl sm:rounded-3xl flex flex-col items-center justify-center h-full">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[8px] sm:text-[9px] uppercase text-gray-400 tracking-[0.2em] font-black">Fare</p>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-zinc-900">₹{rideData?.fare || '154'}</h3>
            </div>
          </div>
        </div>

        {/* Payment Method Selection - Show after ride is accepted */}
        {(rideStatus === 'ACCEPTED' || rideStatus === 'ARRIVED' || rideStatus === 'ONGOING') && (
          <div className="mb-4 sm:mb-6">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
              {paymentMode ? 'Payment Method' : 'Select Payment Method'}
            </h3>
            
            {showPaymentSelection || !paymentMode ? (
              <div className="flex gap-2">
                <button
                  onClick={() => handleUpdatePaymentMethod('CASH')}
                  disabled={isUpdatingPaymentMethod}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl border-2 transition-all ${
                    paymentMode === 'CASH' 
                      ? 'border-zinc-900 bg-zinc-50' 
                      : 'border-zinc-200 hover:border-zinc-300'
                  } disabled:opacity-50`}
                >
                  <Banknote size={18} className={paymentMode === 'CASH' ? 'text-green-600' : 'text-zinc-500'} />
                  <span className={`text-sm font-medium ${paymentMode === 'CASH' ? 'text-zinc-900' : 'text-zinc-600'}`}>Cash</span>
                </button>
                <button
                  onClick={() => handleUpdatePaymentMethod('UPI')}
                  disabled={isUpdatingPaymentMethod}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl border-2 transition-all ${
                    paymentMode === 'UPI' 
                      ? 'border-zinc-900 bg-zinc-50' 
                      : 'border-zinc-200 hover:border-zinc-300'
                  } disabled:opacity-50`}
                >
                  <Smartphone size={18} className={paymentMode === 'UPI' ? 'text-purple-600' : 'text-zinc-500'} />
                  <span className={`text-sm font-medium ${paymentMode === 'UPI' ? 'text-zinc-900' : 'text-zinc-600'}`}>UPI</span>
                </button>
                <button
                  onClick={() => handleUpdatePaymentMethod('IN_APP')}
                  disabled={isUpdatingPaymentMethod}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl border-2 transition-all ${
                    paymentMode === 'IN_APP' 
                      ? 'border-zinc-900 bg-zinc-50' 
                      : 'border-zinc-200 hover:border-zinc-300'
                  } disabled:opacity-50`}
                >
                  <CreditCard size={18} className={paymentMode === 'IN_APP' ? 'text-blue-600' : 'text-zinc-500'} />
                  <span className={`text-sm font-medium ${paymentMode === 'IN_APP' ? 'text-zinc-900' : 'text-zinc-600'}`}>Card</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowPaymentSelection(true)}
                className={`w-full flex items-center justify-between py-3 px-4 rounded-xl border-2 ${
                  paymentMode === 'CASH' ? 'border-green-200 bg-green-50' :
                  paymentMode === 'UPI' ? 'border-purple-200 bg-purple-50' :
                  'border-blue-200 bg-blue-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {paymentMode === 'CASH' && <Banknote size={20} className="text-green-600" />}
                  {paymentMode === 'UPI' && <Smartphone size={20} className="text-purple-600" />}
                  {paymentMode === 'IN_APP' && <CreditCard size={20} className="text-blue-600" />}
                  <span className="font-semibold text-zinc-900">
                    {paymentMode === 'CASH' ? 'Cash Payment' : paymentMode === 'UPI' ? 'UPI Payment' : 'Card Payment'}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">Change</span>
              </button>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4 sm:pt-6">
           <button 
             onClick={() => RideCancelled(rideData?.rideId || rideData?.id)}
             className="flex items-center gap-1.5 sm:gap-2 text-red-600 font-bold text-xs sm:text-sm hover:opacity-70 transition-opacity"
           >
             <XCircle size={16} className="sm:w-4.5 sm:h-4.5" /> Cancel Ride
           </button>
           <p className="text-[8px] sm:text-[9px] font-black text-gray-300 tracking-widest uppercase">ID: #{rideData?.rideId || rideData?.id || '48291'}</p>
        </div>
      </motion.div>

      {/* Chat Component */}
      <RideChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        rideId={rideData?.rideId || rideData?.id || 0}
        recipientName={rideDetails?.captainName || 'Captain'}
        recipientRole="CAPTAIN"
      />

      {/* Emergency Modal */}
      <EmergencyModal
        isOpen={isEmergencyOpen}
        onClose={() => setIsEmergencyOpen(false)}
        rideId={rideData?.rideId || rideData?.id}
        currentLocation={currentLocation ? { lat: currentLocation[0], lng: currentLocation[1] } : null}
        driverName={rideDetails?.captainName}
        vehicleNumber={rideDetails?.vehicleNumber}
      />

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              {/* Payment Header */}
              <div className="text-center mb-6">
                <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
                  paymentMode === 'CASH' ? 'bg-green-100' : 
                  paymentMode === 'UPI' ? 'bg-purple-100' : 'bg-blue-100'
                }`}>
                  {paymentMode === 'CASH' && <Banknote size={32} className="text-green-600" />}
                  {paymentMode === 'UPI' && <Smartphone size={32} className="text-purple-600" />}
                  {paymentMode === 'IN_APP' && <CreditCard size={32} className="text-blue-600" />}
                </div>
                <h3 className="text-xl font-bold text-gray-900">Payment Required</h3>
                <p className="text-gray-500 text-sm mt-1">
                  {paymentMode === 'CASH' && 'Please pay cash to the driver'}
                  {paymentMode === 'UPI' && 'Complete payment via UPI'}
                  {paymentMode === 'IN_APP' && 'Complete payment to finish your ride'}
                </p>
              </div>

              {/* Fare Amount */}
              <div className="bg-gray-50 rounded-2xl p-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-medium">Total Fare</span>
                  <span className="text-3xl font-black text-gray-900">₹{rideDetails?.fare || rideData?.fare || 0}</span>
                </div>
              </div>

              {/* Payment Instructions based on mode */}
              {paymentMode === 'CASH' && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-6">
                  <p className="text-sm text-green-800 font-medium">
                    💵 Hand over <span className="font-bold">₹{rideDetails?.fare || rideData?.fare || 0}</span> in cash to your driver
                  </p>
                  <p className="text-xs text-green-600 mt-2">
                    The driver will confirm payment once received
                  </p>
                </div>
              )}

              {paymentMode === 'UPI' && (
                <div className="space-y-4">
                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                    <p className="text-sm text-purple-800 font-medium">
                      📱 Pay <span className="font-bold">₹{rideDetails?.fare || rideData?.fare || 0}</span> via UPI
                    </p>
                    <p className="text-xs text-purple-600 mt-2">
                      Pay securely using GPay, PhonePe, Paytm or any UPI app
                    </p>
                  </div>
                  
                  <button
                    onClick={handleRazorpayPayment}
                    disabled={isProcessingPayment}
                    className="w-full bg-purple-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProcessingPayment ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Smartphone size={20} />
                        Pay ₹{rideDetails?.fare || rideData?.fare || 0} via UPI
                      </>
                    )}
                  </button>
                </div>
              )}

              {paymentMode === 'IN_APP' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-sm text-blue-800 font-medium">
                      💳 Secure payment via Razorpay
                    </p>
                    <p className="text-xs text-blue-600 mt-2">
                      Click below to complete your payment securely
                    </p>
                  </div>
                  
                  <button
                    onClick={handleRazorpayPayment}
                    disabled={isProcessingPayment}
                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProcessingPayment ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard size={20} />
                        Pay ₹{rideDetails?.fare || rideData?.fare || 0}
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Close button for CASH only */}
              {paymentMode === 'CASH' && (
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  Got it
                </button>
              )}

              {/* Cancel button for UPI/IN_APP */}
              {(paymentMode === 'UPI' || paymentMode === 'IN_APP') && !isProcessingPayment && (
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="w-full mt-3 py-3 text-gray-500 font-medium hover:text-gray-700 transition-colors"
                >
                  Cancel
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>

  );
};

export default RiderTracking;