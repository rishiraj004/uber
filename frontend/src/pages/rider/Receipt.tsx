import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, Ruler, Clock } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import RatingModal from '../../components/RatingModal';

const Receipt = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { ride } = location.state || {};

    const [fare, setFare] = React.useState({ fare: 0, distance: 0, duration: 0 });
    const [showRatingModal, setShowRatingModal] = useState(true);
    const [hasReviewed, setHasReviewed] = useState(false);

    useEffect(() => {
        const checkReviewStatus = async () => {
            if (!ride?.rideId && !ride?.id) return;
            try {
                const response = await api.get(`/review/status/${ride?.rideId || ride?.id}`);
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

    useEffect(() => {
        const fetchRideDetails = async () => {
            try {
                console.log("Fetching ride details for receipt:", ride);
                const fareResponse = await api.post('/ride/calculate-fare', {
                    pickupCoords: { lat: ride.pickupLat, lng: ride.pickupLng },
                    destCoords: { lat: ride.dropoffLat, lng: ride.dropoffLng },
                    vehicleType: ride.vehicleType
                });
                console.log("Fetched ride details for receipt:", fareResponse.data);
                setFare({
                    fare: fareResponse.data.estimatedCost,
                    distance: fareResponse.data.distanceKm,
                    duration: fareResponse.data.durationMinutes
                });
            } catch (error) {
                console.error("Error fetching ride details for receipt:", error);
            }
        };
        fetchRideDetails();
    }, [ride]);

    const handleRatingSubmit = () => {
        setShowRatingModal(false);
        setHasReviewed(true);
    };

    if (!ride) return <div>No receipt data found.</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center">
            {/* Rating Modal */}
            {!hasReviewed && (
                <RatingModal
                    isOpen={showRatingModal}
                    onClose={() => setShowRatingModal(false)}
                    onSubmit={handleRatingSubmit}
                    rideId={ride?.rideId || ride?.id}
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
                    <h1 className="text-5xl font-black">₹{fare.fare}</h1>
                </div>

                <div className="space-y-6 border-t border-b border-dashed border-gray-200 py-8 mb-8">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 text-gray-500">
                            <Ruler size={18} />
                            <span className="text-sm font-medium">Distance Traveled</span>
                        </div>
                        <span className="font-bold">{fare.distance} km</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3 text-gray-500">
                            <Clock size={18} />
                            <span className="text-sm font-medium">Trip Duration</span>
                        </div>
                        <span className="font-bold">{fare.duration} mins</span>
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