import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapPin, Navigation, Phone, MessageSquare, ShieldAlert } from 'lucide-react';
import api from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../../context/socket-context';
import toast from 'react-hot-toast';

const CaptainTracking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialRide = location.state?.ride.currentRideRequest;

  const [rideStatus, setRideStatus] = useState(initialRide?.status || 'ACCEPTED');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Phase Logic: ACCEPTED -> ARRIVED -> ONGOING -> COMPLETED
  const handleArrived = async () => {
    try{
      await api.post('/ride/arrived-at-pickup', { rideId: initialRide.rideId });
      setRideStatus('ARRIVED');
    } catch (err) {
      console.error(err);
      toast.error("Error updating status to ARRIVED");
    }
  };

  const socket = useSocket();
  const watchId = useRef<number | null>(null);
  const isOnline = true;

  useEffect(() => {
    if (isOnline && socket) {
      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          socket.emit('CAPTAIN_LOCATION_UPDATE', {
            location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            userId: JSON.parse(atob(localStorage.getItem("token")!.split('.')[1])).userId
          });
          console.log("Location sent:", position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error("Error getting location:", error);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
      );
    };

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [isOnline, socket]);

  useEffect(() => {
    if (!socket) return;

    const handleRideCancellation = (data: { rideId: number }) => {
      if (data.rideId === initialRide.rideId) {
        toast('Ride Cancelled by Rider');
        navigate('/captain-dashboard');
      }
    }
    socket.on("RIDE_CANCELLED", handleRideCancellation);

    return () => { socket.off("RIDE_CANCELLED", handleRideCancellation); };
  }, [initialRide.rideId, navigate, socket]);

  const handleStartTrip = async () => {
    if (otp.length !== 4) return alert("Enter 4-digit OTP");
    setLoading(true);
    try {
      await api.post('/ride/start-ride', { rideId: initialRide.rideId, otp });
      setRideStatus('ONGOING');
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Error starting trip");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTrip = async () => {
    setLoading(true);
    try {
      await api.post('/ride/complete-ride', { rideId: initialRide.rideId });
      navigate('/captain-dashboard'); // Return to searching for rides
    } catch (err) {
      toast.error("Error completing trip");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col relative bg-zinc-900 overflow-hidden">
      
      {/* Map Overview (Placeholder) */}
      <div className="flex-1 bg-zinc-800 relative">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600 font-medium italic">
          Navigation Map View
        </div>
      </div>

      {/* Bottom Control Sheet */}
      <motion.div 
        initial={{ y: "100%" }} animate={{ y: 0 }}
        className="bg-white rounded-t-4xl p-6 z-10 shadow-2xl"
      >
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />

        {/* Rider Details */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center font-black text-xl">
              {initialRide?.riderName?.[0] || 'R'}
            </div>
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Rider</p>
              <h3 className="text-xl font-black">{initialRide?.riderName || 'Customer'}</h3>
            </div>
          </div>
          <div className="flex gap-2">
            <button title="Call rider" className="p-3 bg-gray-100 rounded-xl text-zinc-600"><Phone size={20} /></button>
            <button title="Message rider" className="p-3 bg-gray-100 rounded-xl text-zinc-600"><MessageSquare size={20} /></button>
          </div>
        </div>

        {/* Destination Info */}
        <div className="space-y-4 mb-8 bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-blue-500 mt-1" />
            <div>
              <p className="text-[10px] text-gray-400 font-black uppercase">Pickup</p>
              <p className="text-sm font-bold truncate">{initialRide?.pickupAddress}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Navigation size={18} className="text-black mt-1" />
            <div>
              <p className="text-[10px] text-gray-400 font-black uppercase">Dropoff</p>
              <p className="text-sm font-bold truncate">{initialRide?.dropoffAddress}</p>
            </div>
          </div>
        </div>

        {/* Action Controls based on RideStatus */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {rideStatus === 'ACCEPTED' && (
              <motion.button 
                key="arrived" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={handleArrived}
                className="w-full bg-black text-white py-4 rounded-2xl font-black text-lg hover:bg-zinc-800 transition"
              >
                I Have Arrived
              </motion.button>
            )}

            {rideStatus === 'ARRIVED' && (
              <motion.div 
                key="otp-panel" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="flex flex-col items-center">
                  <p className="text-xs font-bold text-gray-400 mb-2">ENTER RIDER OTP</p>
                  <input 
                    type="text" maxLength={4} placeholder="0000"
                    value={otp} onChange={(e) => setOtp(e.target.value)}
                    className="w-full text-center text-4xl font-black tracking-[1em] p-4 bg-gray-100 rounded-2xl focus:ring-2 focus:ring-black outline-none"
                  />
                </div>
                <button 
                  onClick={handleStartTrip} disabled={loading}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 transition"
                >
                  {loading ? "Verifying..." : "Start Trip"}
                </button>
              </motion.div>
            )}

            {rideStatus === 'ONGOING' && (
              <motion.button 
                key="complete" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                onClick={handleCompleteTrip} disabled={loading}
                className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-green-700 transition"
              >
                {loading ? "Processing..." : `Finish Trip (Collect ₹${initialRide?.fare})`}
              </motion.button>
            )}
          </AnimatePresence>

          <button className="w-full flex items-center justify-center gap-2 text-red-500 font-bold text-sm py-2">
            <ShieldAlert size={16} /> Emergency Support
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default CaptainTracking;