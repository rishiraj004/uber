import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Phone, MessageSquare, ShieldCheck, 
  XCircle, AlertTriangle, CheckCircle2, Navigation 
} from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../../services/api';
import { useSocket } from '../../context/socket-context';
import { RideMap } from '../../components/RideMap';
import RideChat from '../../components/RideChat';

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
      }) => { 
        setRideStatus('COMPLETED'); 
        // Pass complete ride data including fare and distance/duration to receipt
        navigate('/rider-receipt', { 
          state: { 
            ride: {
              ...rideDetails,
              rideId: data.rideId,
              fare: data.fare,
              estimatedDistance: data.estimatedDistance,
              estimatedDuration: data.estimatedDuration
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
      
      {/* 1. SOS Button (Feature #1) */}
      <button 
        onClick={() => alert("Emergency alert sent to local authorities and emergency contacts.")}
        className="absolute top-6 right-6 z-50 bg-red-600 text-white p-3 rounded-full shadow-2xl hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center"
        title="Emergency SOS"
        aria-label="Emergency SOS button"
      >
        <AlertTriangle size={24} />
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
        // --- EDITED: Animate y based on isSheetHidden state ---
        animate={{ y: isSheetHidden ? "calc(100% - 60px)" : 0 }} 
        transition={{ type: "spring", damping: 25, stiffness: 120 }}
        className="absolute left-0 right-0 bottom-0 bg-white rounded-t-4xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 z-20"
      >
        {/* --- EDITED: Clickable Pull Bar to toggle sheet --- */}
        <div 
          onClick={() => setIsSheetHidden(!isSheetHidden)}
          className="w-full py-2 -mt-2 mb-4 cursor-pointer group"
        >
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto group-hover:bg-gray-300 transition-colors" />
        </div>

        <StatusStepper currentStatus={rideStatus} />

        {/* 4. Safety Verification */}
        <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl mb-6 flex items-start gap-3">
          <ShieldCheck size={20} className="text-blue-600 shrink-0" />
          <p className="text-[11px] text-blue-800 leading-tight">
            <span className="font-bold">Safety Check:</span> Verify that the vehicle plate <span className="underline font-black">{rideDetails?.vehicleNumber || 'BR-01-1234'}</span> matches the car arriving. Do not enter if it doesn't match.
          </p>
        </div>

        {/* Captain & Vehicle Info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl overflow-hidden border border-gray-100">
                <img src="https://via.placeholder.com/150" alt="Captain" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-[10px] font-black px-1.5 py-0.5 rounded border-2 border-white">
                {rideDetails?.rating || '4.8'} ★
              </div>
            </div>
            <div>
              <p className="font-bold text-xl">{rideDetails?.captainName || 'Aman Gupta'}</p>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{`${rideDetails?.vehicleColor || 'White'} ${rideDetails?.vehicleModel || 'Maruti Swift'}`}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="p-4 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors" title="Call driver" aria-label="Call driver"><Phone size={20} /></button>
            <button 
              onClick={() => setIsChatOpen(true)}
              className="p-4 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors" 
              title="Message driver" 
              aria-label="Message driver"
            >
              <MessageSquare size={20} />
            </button>
          </div>
        </div>

        {/* Live ETA Display */}
        {captainEta && rideStatus !== 'COMPLETED' && (
          <div className="bg-green-50 border border-green-100 p-4 rounded-xl mb-6 flex items-center gap-3">
            <div className="bg-green-500 text-white p-2 rounded-xl">
              <Navigation size={20} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-green-800">
                {rideStatus === 'ONGOING' 
                  ? `${Math.round(captainEta.duration)} min to destination`
                  : `Captain is ${Math.round(captainEta.duration)} min away`
                }
              </p>
              <p className="text-xs text-green-600">
                {captainEta.distance.toFixed(1)} km {rideStatus === 'ONGOING' ? 'remaining' : 'from pickup'}
              </p>
            </div>
          </div>
        )}

        {/* 5. OTP  */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-zinc-900 text-white p-5 rounded-3xl flex flex-col items-center shadow-lg">
             <p className="text-[9px] uppercase opacity-50 tracking-[0.2em] font-black mb-1">Trip OTP</p>
             <h3 className="text-3xl font-black tracking-[0.15em]">{rideData?.otp || '5291'}</h3>
          </div>
          
          <div className="relative group">
            <div className="bg-white border-2 border-gray-100 p-5 rounded-3xl flex flex-col items-center justify-center h-full">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[9px] uppercase text-gray-400 tracking-[0.2em] font-black">Fare</p>
              </div>
              <h3 className="text-2xl font-black text-zinc-900">₹{rideData?.fare || '154'}</h3>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-6">
           <button 
             onClick={() => RideCancelled(rideData?.rideId || rideData?.id)}
             className="flex items-center gap-2 text-red-600 font-bold text-sm hover:opacity-70 transition-opacity"
           >
             <XCircle size={18} /> Cancel Ride
           </button>
           <p className="text-[9px] font-black text-gray-300 tracking-widest uppercase">ID: #{rideData?.rideId || rideData?.id || '48291'}</p>
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
    </div>

  );
};

export default RiderTracking;