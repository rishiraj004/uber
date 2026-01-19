import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, Ruler, Clock } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import RatingModal from '../../components/RatingModal';

interface RideData {
    rideId?: number;
    id?: number;
    fare: number;
    estimatedDistance?: number;
    estimatedDuration?: number;
    pickupLat?: number;
    pickupLng?: number;
    dropoffLat?: number;
    dropoffLng?: number;
    vehicleType?: string;
    captainName?: string;
}

const Receipt = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { rideId: paramRideId } = useParams();
    const stateRide = location.state?.ride as RideData | undefined;

    const [ride, setRide] = useState<RideData | null>(stateRide || null);
    const [loading, setLoading] = useState(!stateRide);
    const [showRatingModal, setShowRatingModal] = useState(true);
    const [hasReviewed, setHasReviewed] = useState(false);

    // Fetch ride data if not passed via state (e.g., direct URL access)
    useEffect(() => {
        const fetchRide = async () => {
            const rideIdToFetch = paramRideId || stateRide?.rideId || stateRide?.id;
            if (!rideIdToFetch) {
                setLoading(false);
                return;
            }
            
            // If we already have ride data from state with fare, use it
            if (stateRide?.fare) {
                setRide(stateRide);
                setLoading(false);
                return;
            }

            try {
                const response = await api.get(`/ride/${rideIdToFetch}`);
                setRide(response.data.ride);
            } catch (error) {
                console.error("Error fetching ride:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchRide();
    }, [paramRideId, stateRide]);

    useEffect(() => {
        const checkReviewStatus = async () => {
            const rideId = ride?.rideId || ride?.id;
            if (!rideId) return;
            try {
                const response = await api.get(`/review/status/${rideId}`);
                setHasReviewed(response.data.hasReviewed);
                if (response.data.hasReviewed) {
                    setShowRatingModal(false);
                }
            } catch (error) {
                console.error("Error checking review status:", error);
            }
        };
        checkReviewStatus();
    }, [ride]);

    const handleRatingSubmit = () => {
        setShowRatingModal(false);
        setHasReviewed(true);
    };

    if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
    if (!ride) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">No receipt data found.</div>;

    const rideId = ride.rideId || ride.id;
    const fare = ride.fare || 0;
    const distance = ride.estimatedDistance || 0;
    const duration = ride.estimatedDuration || 0;

    return (
        <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
            {/* Rating Modal */}
            {!hasReviewed && (
                <RatingModal
                    isOpen={showRatingModal}
                    onClose={() => setShowRatingModal(false)}
                    onSubmit={handleRatingSubmit}
                    rideId={rideId}
                    recipientName={ride?.captainName || 'Your Captain'}
                    reviewType="RIDER_TO_CAPTAIN"
                    title="Rate Your Ride"
                />
            )}

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
                    <h1 className="text-5xl font-black">₹{fare}</h1>
                </div>

                <div className="space-y-6 border-t border-b border-dashed border-gray-200 py-8 mb-8">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 text-gray-500">
                            <Ruler size={18} />
                            <span className="text-sm font-medium">Distance Traveled</span>
                        </div>
                        <span className="font-bold">{distance} km</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 text-gray-500">
                            <Clock size={18} />
                            <span className="text-sm font-medium">Trip Duration</span>
                        </div>
                        <span className="font-bold">{Math.round(duration)} mins</span>
                    </div>
                </div>

                {/* Rate Again Button (if skipped) */}
                {!hasReviewed && (
                    <button 
                        onClick={() => setShowRatingModal(true)}
                        className="w-full bg-yellow-400 text-black py-4 rounded-2xl font-bold mb-4 hover:bg-yellow-500 transition"
                    >
                        ⭐ Rate Your Captain
                    </button>
                )}

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