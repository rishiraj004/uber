import { useState, useEffect } from 'react';
import api from '../services/api';
import { io } from 'socket.io-client';
import { MapPin, Navigation, DollarSign, Power } from 'lucide-react';

interface RideRequest {
  rideId: number;
  riderName: string;
  fare: number;
  pickupAddress: string;
  dropoffAddress: string;
}

const CaptainDashboard = () => {
  const [isOnline, setIsOnline] = useState(false);
  const [currentRideRequest, setCurrentRideRequest] = useState<RideRequest | null>(null);

    const userId = JSON.parse(atob(localStorage.getItem("token")!.split('.')[1])).userId;
    const socket = io("http://localhost:3000", {
        query: {
            userId: userId
        }
    });

  // 1. Initialize Socket.io Connection
  useEffect(() => {
    socket.on('NEW_RIDE_REQUEST', (data) => {
      console.log("New Ride Request Received:", data);
      setCurrentRideRequest(data);
    });

    return () => { socket.close(); };
  });

  useEffect(() => {
    socket.on("RIDE_ACCEPTED", (data) => {
      console.log("Ride Accepted Notification:", data);
      setCurrentRideRequest(null);
    });

    return () => { socket.off("RIDE_ACCEPTED"); };
  });

  useEffect(() => {
    socket.on("RIDE_CANCELLED", (data) => {
      console.log("Ride Cancelled Notification:", data);
      setCurrentRideRequest(null);
      console.log("Current ride has been cancelled by the rider.");
    });

    return () => { socket.off("RIDE_CANCELLED"); };
  });

  // 2. Toggle Availability (PATCH /toggle-status)
  const handleStatusToggle = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.patch('/captain/toggle-status', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsOnline(response.data.isOnline);
    } catch (error) {
      console.error("Error toggling status", error);
    }
  };

  // 3. Accept Ride Logic (POST /accept-ride)
  const acceptRide = async (rideId: number) => {
    try {
      const token = localStorage.getItem('token');
      await api.post('ride/accept-ride', { rideId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert("Ride Accepted! Navigate to pickup.");
      setCurrentRideRequest(null);
    } catch (error) {
      console.error("Error accepting ride", error);
      alert("Could not accept ride.");
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-50 overflow-hidden">
      
      {/* Top Header */}
      <div className="p-4 bg-white shadow-sm flex justify-between items-center z-20">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="font-bold text-lg">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
        <button 
          onClick={handleStatusToggle}
          className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition ${
            isOnline ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-black text-white hover:bg-zinc-800'
          }`}
        >
          <Power size={18} />
          {isOnline ? 'Go Offline' : 'Go Online'}
        </button>
      </div>

      <div className="flex-1 relative">
        {/* Dummy Map Area */}
        <div className="absolute inset-0 bg-slate-200 flex items-center justify-center">
            <div className="w-full h-full opacity-20" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '30px 30px' }}></div>
            <p className="text-gray-400 font-medium">Map View: Scanning for nearby riders...</p>
        </div>

        {/* Floating Earnings Card */}
        <div className="absolute top-4 left-4 right-4 md:left-auto md:w-80 bg-white p-4 rounded-2xl shadow-xl z-10 border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-500 text-sm">Today's Earnings</p>
            <DollarSign size={20} className="text-green-600" />
          </div>
          <h3 className="text-3xl font-black">₹0.00</h3>
          <div className="mt-4 flex gap-4 text-center">
            <div className="flex-1"><p className="text-xs text-gray-400 uppercase">Trips</p><p className="font-bold">0</p></div>
            <div className="flex-1"><p className="text-xs text-gray-400 uppercase">Hours</p><p className="font-bold">0.0</p></div>
          </div>
        </div>

        {/* Incoming Ride Notification Popup */}
        {currentRideRequest && (
          <div className="absolute bottom-10 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-112.5 bg-white rounded-3xl shadow-2xl z-30 p-6 border-2 border-black animate-bounce-short">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded">NEW REQUEST</span>
                <h4 className="text-xl font-bold mt-1">{currentRideRequest.riderName}</h4>
              </div>
              <p className="text-2xl font-black">₹{currentRideRequest.fare}</p>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-start gap-3">
                <MapPin size={20} className="text-blue-600 mt-1" />
                <div>
                  <p className="text-xs text-gray-400">PICKUP</p>
                  <p className="text-sm font-medium">{currentRideRequest.pickupAddress}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Navigation size={20} className="text-black mt-1" />
                <div>
                  <p className="text-xs text-gray-400">DROPOFF</p>
                  <p className="text-sm font-medium">{currentRideRequest.dropoffAddress}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setCurrentRideRequest(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl font-bold hover:bg-gray-50"
              >
                Ignore
              </button>
              <button 
                onClick={() => acceptRide(currentRideRequest.rideId)}
                className="flex-2 py-3 bg-black text-white rounded-xl font-bold hover:bg-zinc-800"
              >
                Accept Ride
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CaptainDashboard;