import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, MapPin, Ruler, CreditCard, Clock } from 'lucide-react';

const Receipt = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { ride } = location.state || {};

    if (!ride) return <div>No receipt data found.</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 mt-10 border border-gray-100">
                <div className="flex flex-col items-center mb-8">
                    <div className="bg-green-100 p-4 rounded-full mb-4">
                        <CheckCircle size={40} className="text-green-600" />
                    </div>
                    <h2 className="text-2xl font-black">Ride Completed!</h2>
                    <p className="text-gray-400 text-sm">Thank you for riding with us.</p>
                </div>

                <div className="text-center mb-10">
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Final Fare</p>
                    <h1 className="text-5xl font-black">₹{ride.fare}</h1>
                </div>

                <div className="space-y-6 border-t border-b border-dashed border-gray-200 py-8 mb-8">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 text-gray-500">
                            <Ruler size={18} />
                            <span className="text-sm font-medium">Distance Traveled</span>
                        </div>
                        <span className="font-bold">{ride.distance} km</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 text-gray-500">
                            <Clock size={18} />
                            <span className="text-sm font-medium">Trip Duration</span>
                        </div>
                        <span className="font-bold">{ride.duration} mins</span>
                    </div>
                </div>

                <button 
                    onClick={() => navigate('/rider-dashboard')}
                    className="w-full bg-black text-white py-4 rounded-2xl font-bold hover:bg-zinc-800 transition"
                >
                    Done
                </button>
            </div>
        </div>
    );
};

export default Receipt;