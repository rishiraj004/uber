import axios from "axios";
import api from "../services/api";
import { useState, useMemo, useEffect } from "react";
import { MapPin, Navigation, Car, Bike, Zap } from 'lucide-react';
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";

const HomePage: React.FC = () => {
    const [pickup, setPickup] = useState("");
    const [drop, setDrop] = useState("");
    const [vehicleType, setVehicleType] = useState<"CAR" | "BIKE" | "AUTO">("CAR");
    const [loading, setLoading] = useState(false);
    const [showFares, setShowFares] = useState(false);
    const [fares, setFares] = useState<{ [key in "CAR" | "BIKE" | "AUTO"]: number }>({ CAR: 0, BIKE: 0, AUTO: 0 });
    const [error, setError] = useState("");
    const [rideId, setRideId] = useState<number | null>(null);

    const userId = JSON.parse(atob(localStorage.getItem("token")!.split('.')[1])).userId;
    const socket = io("http://localhost:3000", {
        query: {
            userId: userId
        }
    });

    const navigate = useNavigate();
    useEffect(() => {
      socket.on("RIDE_ACCEPTED", (data) => {
        setLoading(false);
        //navigate to ride tracking page (to be implemented)
        console.log("Ride accepted, navigating to tracking page...");
        navigate("/rider-tracking", { state: { ride: data } });
      });

      return () => {
        socket.off("RIDE_ACCEPTED");
      };
    });

    const canEstimate = useMemo(() => {
        return pickup.trim() !== "" && drop.trim() !== "";
    }, [pickup, drop]);

    const dummyCoords = {
        pickup: { lat: 12.9716, lng: 77.5946 },
        dest: { lat: 12.2958, lng: 76.6394 }
    };

    const handleEstimateCost = async () => {
        setError("");
        if (!canEstimate) {
            setError("Please enter both pickup and drop locations.");
            return;
        }
        try {
            const responseCar = await api.post("/ride/calculate-fare", {
                pickupCoords: dummyCoords.pickup,
                destCoords: dummyCoords.dest,
                vehicleType: "CAR",
            });
            setFares(prev => ({ ...prev, CAR: responseCar.data.estimatedCost }));

            const responseBike = await api.post("/ride/calculate-fare", {
                pickupCoords: dummyCoords.pickup,
                destCoords: dummyCoords.dest,
                vehicleType: "BIKE",
            });
            setFares(prev => ({ ...prev, BIKE: responseBike.data.estimatedCost }));
            
            const responseAuto = await api.post("/ride/calculate-fare", {
                pickupCoords: dummyCoords.pickup,
                destCoords: dummyCoords.dest,
                vehicleType: "AUTO",
            });
            setFares(prev => ({ ...prev, AUTO: responseAuto.data.estimatedCost }));
        } catch (err) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data.message || "Failed to estimate cost.");
            } else {
                setError("Failed to estimate cost.");
            }
        }
    };


    const handleRequestRide = async () => {
        setError("");
        if (!canEstimate) {
            setError("Please enter both pickup and drop locations.");
            return;
        }

        if (!vehicleType) {
            setError("Please select a vehicle type.");
            return;
        }
        
        setLoading(true);

        try {
            const token = localStorage.getItem("token");
            if (!token) {
                setError("You must be logged in to request a ride.");
                return;
            }

            const response = await api.post("/ride/create-ride", {
                pickup,
                destination: drop,
                pickupCoords: dummyCoords.pickup,
                destCoords: dummyCoords.dest,
                vehicleType,
            },{
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            setRideId(response.data.ride.id);
            socket.emit("NEW_RIDE_REQUEST", {
                rideId: response.data.ride.id,
                pickup,
                destination: drop,
                pickupCoords: dummyCoords.pickup,
                destCoords: dummyCoords.dest,
                vehicleType,
            });
        } catch (err) {
            if (axios.isAxiosError(err)) {
                setError(err.response?.data.message || "Failed to request ride.");
            } else {
                setError("Failed to request ride.");
            }
        }
    };

    const cancelRide = async () => {
        setLoading(false);
        console.log("Cancelling ride with ID:", rideId);
        if (!rideId) {
            setError("No ride to cancel.");
            return;
        }
        await api.post("/ride/cancel-ride", {rideId}, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`
            }
        });
    }

    return (
    <div className="h-screen w-screen flex flex-col md:flex-row relative overflow-hidden">
      
      {/* 1. Side Input Panel */}
      <div className="w-full md:w-100 bg-white h-full shadow-2xl z-10 p-6 flex flex-col">
        <h2 className="text-2xl font-bold mb-6">Where to?</h2>
        
        <div className="space-y-4 relative">
          {/* Visual line between inputs */}
          <div className="absolute left-5 top-12 w-0.5 h-12 bg-gray-300"></div>
          
          <div className="flex items-center gap-4 bg-gray-100 p-3 rounded-lg border focus-within:border-black">
            <MapPin size={20} className="text-gray-500" />
            <input 
              className="bg-transparent w-full outline-none"
              placeholder="Enter pickup location"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4 bg-gray-100 p-3 rounded-lg border focus-within:border-black">
            <Navigation size={20} className="text-black" />
            <input 
              className="bg-transparent w-full outline-none"
              placeholder="Enter destination"
              value={drop}
              onChange={(e) => {
                setDrop(e.target.value);
                if (e.target.value.length > 3) {
                  handleEstimateCost();
                  setShowFares(true);
                }
              }}
            />
          </div>
        </div>

        {/* Error Message Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* 2. Vehicle Selection (Shown after destination is entered) */}
        {showFares && (
          <div className="mt-8 flex-1 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="font-semibold mb-4 text-gray-700">Recommended Rides</h3>
            <div className="space-y-3">
              {(['BIKE', 'AUTO', 'CAR'] as const).map((type) => (
                <div 
                  key={type}
                  onClick={() => setVehicleType(type)}
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    vehicleType === type ? 'border-black bg-gray-50' : 'border-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {type === 'BIKE' && <Bike size={28} />}
                    {type === 'AUTO' && <Zap size={28} className="text-yellow-600" />}
                    {type === 'CAR' && <Car size={28} />}
                    <div>
                      <p className="font-bold">{type}</p>
                      <p className="text-xs text-gray-500">2 mins away</p>
                    </div>
                  </div>
                  <p className="font-bold">₹{fares[type]}</p>
                </div>
              ))}
            </div>

            <button 
              disabled={loading || !vehicleType}
              onClick={handleRequestRide}
              className="w-full mt-6 bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-zinc-800 disabled:bg-gray-400 transition"
            >
              {loading ? "Finding a Captain..." : `Request ${vehicleType || 'Ride'}`}
            </button>

            {/* 5. Cancel Ride Request button */}
            {loading && (
                <button
                  onClick={cancelRide}
                  className="w-full mt-6 bg-black text-white py-4 rounded-xl font-bold text-lg hover:bg-zinc-800 disabled:bg-gray-400 transition"
                >
                  Cancel Ride Request
                </button>
            )}
          </div>
        )}
      </div>

      {/* 3. Dummy Map Layout */}
      <div className="flex-1 bg-slate-200 relative">
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Simple Pattern to mimic a map */}
          <div className="w-full h-full opacity-30" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
          
          <div className="text-center z-0">
            <div className="bg-white/80 px-6 py-3 rounded-full shadow-md text-gray-600 font-medium border border-gray-300">
              Maps API not integrated yet. Showing dummy markers...
            </div>
          </div>

          {/* Dummy Markers */}
          {pickup && (
            <div className="absolute top-[40%] left-[50%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
              <div className="bg-white px-3 py-1 rounded shadow-lg text-xs font-bold mb-1">Pickup</div>
              <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white"></div>
            </div>
          )}
          {drop && (
            <div className="absolute top-[30%] left-[60%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
              <div className="bg-white px-3 py-1 rounded shadow-lg text-xs font-bold mb-1">Destination</div>
              <div className="w-4 h-4 bg-black rounded-full border-2 border-white"></div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Logout Button */}
      <div className="absolute top-4 right-4">
        <button
          onClick={() => {
            localStorage.removeItem("token");
            localStorage.removeItem("role");
            navigate("/login");
          }}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
        >
          Logout
        </button>
      </div>

    </div>
  );
};

export default HomePage;