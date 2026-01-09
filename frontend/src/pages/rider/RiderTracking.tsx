import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Phone, MessageSquare, ShieldCheck, 
  XCircle, AlertTriangle, Info, CheckCircle2 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';
import { useSocket } from '../../context/socket-context';

// --- Sub-component: Ride Status Stepper ---
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

const RideCancelled = async (rideId: string) => {
  await api.post('/ride/cancel-ride', { rideId });
}

const RiderTracking = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const rideData = location.state?.ride;
  
  const [rideStatus, setRideStatus] = useState(rideData?.status || 'ACCEPTED');
  const [showFareBreakdown, setShowFareBreakdown] = useState(false);

  const socket = useSocket();

  useEffect(() => {
    if (!socket) return;

    const listeners = {
      RIDE_CANCELLED: () => { navigate('/rider-dashboard'); setRideStatus('CANCELLED'); },
      RIDE_ARRIVED: () => { setRideStatus('ARRIVED'); },
      RIDE_STARTED: () => { setRideStatus('ONGOING'); },
      RIDE_COMPLETED: () => { 
        setRideStatus('COMPLETED'); 
        navigate('/receipt', { state: { ride: rideData } }); 
      }
    }
    Object.entries(listeners).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    return () => { 
      Object.keys(listeners).forEach(event => { socket.off(event) });
    };
  }, [rideData, navigate, socket]);

  return (
    <div className="h-screen w-screen flex flex-col relative bg-gray-100 overflow-hidden font-sans">
      
      {/* 1. SOS Button (Feature #1) */}
      <button 
        onClick={() => alert("Emergency alert sent to local authorities and emergency contacts.")} // later will implement actual SOS functionality
        className="absolute top-6 right-6 z-50 bg-red-600 text-white p-3 rounded-full shadow-2xl hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center"
        title="Emergency SOS"
        aria-label="Emergency SOS button"
      >
        <AlertTriangle size={24} />
      </button>

      {/* 2. Map Layout */}
      <div className="flex-1 bg-slate-300 relative">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
        {/* Placeholder for real map markers */}
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-medium">Map Overview</div>
      </div>

      {/* 3. Dynamic Bottom Sheet */}
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 100 }}
        className="bg-white rounded-t-4xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] p-6 z-10 relative"
      >
        {/* Pull Bar */}
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />

        <StatusStepper currentStatus={rideStatus} />

        {/* 4. Safety Verification */}
        <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl mb-6 flex items-start gap-3">
          <ShieldCheck size={20} className="text-blue-600 shrink-0" />
          <p className="text-[11px] text-blue-800 leading-tight">
            <span className="font-bold">Safety Check:</span> Verify that the vehicle plate <span className="underline font-black">BR-01-1234</span> matches the car arriving. Do not enter if it doesn't match.
          </p>
        </div>

        {/* Captain & Vehicle Info */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl overflow-hidden border border-gray-100">
                <img src="https://via.placeholder.com/150" alt="Captain" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-[10px] font-black px-1.5 py-0.5 rounded border-2 border-white">
                4.8 ★
              </div>
            </div>
            <div>
              <p className="font-bold text-xl">{rideData?.captainName || 'Aman Gupta'}</p>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">White Maruti Swift</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="p-4 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors" title="Call driver" aria-label="Call driver"><Phone size={20} /></button>
            <button className="p-4 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-colors" title="Message driver" aria-label="Message driver"><MessageSquare size={20} /></button>
          </div>
        </div>

        {/* 5. OTP & Fare Breakdown (Feature #4) */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-zinc-900 text-white p-5 rounded-3xl flex flex-col items-center shadow-lg">
             <p className="text-[9px] uppercase opacity-50 tracking-[0.2em] font-black mb-1">Trip OTP</p>
             <h3 className="text-3xl font-black tracking-[0.15em]">{rideData?.otp || '5291'}</h3>
          </div>
          
          <div className="relative group">
            <div className="bg-white border-2 border-gray-100 p-5 rounded-3xl flex flex-col items-center justify-center h-full">
              <div className="flex items-center gap-1 mb-1">
                <p className="text-[9px] uppercase text-gray-400 tracking-[0.2em] font-black">Fare</p>
                <button onClick={() => setShowFareBreakdown(true)} title="View fare breakdown" aria-label="View fare breakdown"><Info size={12} className="text-gray-300 hover:text-gray-500" /></button>
              </div>
              <h3 className="text-2xl font-black text-zinc-900">₹{rideData?.fare || '154'}</h3>
            </div>

            {/* Fare Breakdown Modal Overlay */}
            <AnimatePresence>
              {showFareBreakdown && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute inset-0 bg-white border-2 border-black p-4 rounded-3xl z-20 flex flex-col justify-between shadow-2xl"
                >
                  <div className="text-[10px] space-y-1">
                    <div className="flex justify-between"><span>Base Fare</span><span>₹30.00</span></div>
                    <div className="flex justify-between"><span>Distance (4.2km)</span><span>₹84.00</span></div>
                    <div className="flex justify-between"><span>Duration (15m)</span><span>₹30.00</span></div>
                    <div className="h-px bg-gray-100 my-1" />
                    <div className="flex justify-between font-bold text-black"><span>Total</span><span>₹144.00</span></div>
                  </div>
                  <button 
                    onClick={() => setShowFareBreakdown(false)}
                    className="text-[9px] font-black uppercase text-center w-full text-blue-600"
                    title="Close fare breakdown"
                    aria-label="Close fare breakdown"
                  >
                    Close
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-6">
           <button 
             onClick={() => RideCancelled(rideData?.rideId)}
             className="flex items-center gap-2 text-red-600 font-bold text-sm hover:opacity-70 transition-opacity"
           >
             <XCircle size={18} /> Cancel Ride
           </button>
           <p className="text-[9px] font-black text-gray-300 tracking-widest uppercase">ID: #{rideData?.rideId || '48291'}</p>
        </div>
      </motion.div>
    </div>
  );
};

export default RiderTracking;