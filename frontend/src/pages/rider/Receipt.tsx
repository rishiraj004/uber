import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, Ruler, Clock, CreditCard, Banknote, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '../../services/api';
import RatingModal from '../../components/RatingModal';

// Declare Razorpay on window for TypeScript
declare global {
    interface Window {
        Razorpay: any;
    }
}

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
    paymentStatus?: string;
    paymentMode?: 'CASH' | 'UPI' | 'IN_APP';
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
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    
    // Determine initial payment status based on mode and status
    const getInitialPaymentStatus = (): 'PENDING' | 'SUCCESS' | 'FAILED' | 'CASH_COLLECTED' => {
        if (stateRide?.paymentStatus === 'PAID' || stateRide?.paymentStatus === 'CAPTURED') return 'SUCCESS';
        if (stateRide?.paymentMode === 'CASH' || stateRide?.paymentMode === 'UPI') return 'CASH_COLLECTED';
        return 'PENDING';
    };
    
    const [paymentStatus, setPaymentStatus] = useState<'PENDING' | 'SUCCESS' | 'FAILED' | 'CASH_COLLECTED'>(
        getInitialPaymentStatus()
    );
    const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'IN_APP'>(
        stateRide?.paymentMode || 'IN_APP'
    );

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
                if (stateRide.paymentMode) {
                    setPaymentMode(stateRide.paymentMode);
                    if (stateRide.paymentMode === 'CASH' || stateRide.paymentMode === 'UPI') {
                        setPaymentStatus('CASH_COLLECTED');
                    }
                }
                setLoading(false);
                return;
            }

            try {
                const response = await api.get(`/ride/${rideIdToFetch}`);
                setRide(response.data.ride);
                if (response.data.ride?.paymentMode) {
                    setPaymentMode(response.data.ride.paymentMode);
                }
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

    const handlePayment = async (preferredMethod?: 'upi' | 'card') => {
        setIsProcessingPayment(true);
        try {
            const rideIdToUse = ride?.rideId || ride?.id;
            
            // 1. Create order on backend
            const orderResponse = await api.post('/payment/order', { rideId: rideIdToUse });
            const { orderId, amount, currency, key } = orderResponse.data;

            // 2. Configure Razorpay options with UPI intent support
            const options: any = {
                key: key,
                amount: amount, // Amount is already in paise from backend
                currency: currency,
                name: "Uber Clone",
                description: `Payment for Ride #${rideIdToUse}`,
                order_id: orderId,
                handler: async function (response: any) {
                    // 3. Verify payment on backend
                    try {
                        await api.post('/payment/verify', {
                            rideId: rideIdToUse,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                        });
                        setPaymentStatus('SUCCESS');
                        setIsProcessingPayment(false);
                    } catch (err) {
                        console.error("Payment verification failed:", err);
                        setPaymentStatus('FAILED');
                        setIsProcessingPayment(false);
                        alert("Payment verification failed. Please contact support.");
                    }
                },
                prefill: {
                    name: "Rider",
                    email: "rider@example.com",
                },
                theme: { color: "#000000" },
                modal: {
                    ondismiss: function() { 
                        setIsProcessingPayment(false); 
                    },
                    escape: true,
                    backdropclose: false
                }
            };

            // If UPI payment mode is selected, configure for UPI intent
            if (paymentMode === 'UPI' || preferredMethod === 'upi') {
                options.config = {
                    display: {
                        blocks: {
                            upi: {
                                name: "Pay via UPI",
                                instruments: [
                                    { method: "upi" }
                                ]
                            }
                        },
                        sequence: ["block.upi"],
                        preferences: {
                            show_default_blocks: false
                        }
                    }
                };
            }

            // 4. Open Razorpay modal
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response: any) {
                console.error("Payment failed:", response.error);
                setPaymentStatus('FAILED');
                alert(`Payment failed: ${response.error.description}`);
                setIsProcessingPayment(false);
            });
            rzp.open();
        } catch (error: any) {
            console.error("Payment initiation failed:", error);
            alert(error.response?.data?.message || "Could not initiate payment. Please try again.");
            setIsProcessingPayment(false);
        }
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
                    rideId={rideId || 0}
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
                    
                    {/* Payment Status Indicators */}
                    {paymentStatus === 'SUCCESS' && (
                        <span className="inline-flex items-center gap-1 text-green-600 font-bold text-sm mt-2">
                            <CheckCircle size={16} /> Payment Successful
                        </span>
                    )}
                    {paymentStatus === 'CASH_COLLECTED' && paymentMode === 'CASH' && (
                        <span className="inline-flex items-center gap-1 text-green-600 font-bold text-sm mt-2">
                            <Banknote size={16} /> Cash Payment Collected
                        </span>
                    )}
                    {paymentStatus === 'CASH_COLLECTED' && paymentMode === 'UPI' && (
                        <span className="inline-flex items-center gap-1 text-purple-600 font-bold text-sm mt-2">
                            <Smartphone size={16} /> UPI Payment Collected
                        </span>
                    )}
                    {paymentStatus === 'FAILED' && (
                        <span className="text-red-500 font-bold text-sm mt-2">Payment Failed - Please retry</span>
                    )}
                    {paymentStatus === 'PENDING' && paymentMode === 'IN_APP' && (
                        <span className="text-orange-500 font-bold text-sm mt-2">Payment Pending</span>
                    )}
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

                {/* UPI Payment Button - For UPI payment mode via Razorpay */}
                {paymentMode === 'UPI' && paymentStatus !== 'SUCCESS' && paymentStatus !== 'CASH_COLLECTED' && (
                    <button 
                        onClick={() => handlePayment('upi')}
                        disabled={isProcessingPayment}
                        className="w-full bg-purple-600 text-white py-4 rounded-2xl font-bold mb-4 hover:bg-purple-700 transition flex items-center justify-center gap-2 disabled:bg-purple-400 disabled:cursor-not-allowed"
                    >
                        <Smartphone size={20} />
                        {isProcessingPayment ? "Processing..." : `Pay ₹${fare} via UPI`}
                    </button>
                )}

                {/* Card/Online Payment Button - For IN_APP payment mode */}
                {paymentMode === 'IN_APP' && paymentStatus !== 'SUCCESS' && (
                    <button 
                        onClick={() => handlePayment('card')}
                        disabled={isProcessingPayment}
                        className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold mb-4 hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:bg-blue-400 disabled:cursor-not-allowed"
                    >
                        <CreditCard size={20} />
                        {isProcessingPayment ? "Processing..." : `Pay ₹${fare} with Card`}
                    </button>
                )}

                {/* Cash Payment - Display instruction */}
                {paymentMode === 'CASH' && paymentStatus !== 'SUCCESS' && paymentStatus !== 'CASH_COLLECTED' && (
                    <div className="w-full py-4 px-6 rounded-2xl mb-4 bg-green-50 border-2 border-green-200 text-center">
                        <Banknote size={32} className="text-green-600 mx-auto mb-2" />
                        <p className="font-bold text-green-800 text-lg">Collect ₹{fare} in Cash</p>
                        <p className="text-sm text-green-600 mt-1">Please pay the driver directly</p>
                    </div>
                )}

                {/* Cash/UPI Payment Confirmation Display */}
                {(paymentMode === 'CASH' || paymentMode === 'UPI') && paymentStatus === 'CASH_COLLECTED' && (
                    <div className={`w-full py-4 px-6 rounded-2xl mb-4 flex items-center justify-center gap-3 ${
                        paymentMode === 'CASH' ? 'bg-green-50 border-2 border-green-200' : 'bg-purple-50 border-2 border-purple-200'
                    }`}>
                        {paymentMode === 'CASH' ? (
                            <>
                                <Banknote size={24} className="text-green-600" />
                                <span className="font-bold text-green-700">₹{fare} Paid in Cash</span>
                            </>
                        ) : (
                            <>
                                <Smartphone size={24} className="text-purple-600" />
                                <span className="font-bold text-purple-700">₹{fare} Paid via UPI</span>
                            </>
                        )}
                    </div>
                )}

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