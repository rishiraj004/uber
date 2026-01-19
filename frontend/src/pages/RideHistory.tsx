import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Clock, Calendar, Car, Bike, Zap, 
  ChevronLeft, ChevronRight, Star, X, CheckCircle, XCircle,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import { RideMap } from '../components/RideMap';

interface RideHistoryItem {
  id: number;
  status: 'COMPLETED' | 'CANCELLED';
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  fare: number;
  vehicleType: 'CAR' | 'BIKE' | 'AUTO';
  estimatedDistance: number;
  estimatedDuration: number;
  routeGeometry: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  captain?: {
    user: { fullName: string };
    rating: number;
    vehicleNumber: string;
    vehicleModel: string;
    vehicleColor: string;
  };
  rider?: {
    fullName: string;
    riderProfile: { rating: number };
  };
  reviews: { rating: number; comment: string }[];
}

interface RideDetailModalProps {
  ride: RideHistoryItem;
  onClose: () => void;
  userRole: string;
}

const VehicleIcon = ({ type }: { type: 'CAR' | 'BIKE' | 'AUTO' }) => {
  const icons = {
    CAR: <Car size={16} />,
    BIKE: <Bike size={16} />,
    AUTO: <Zap size={16} />
  };
  return icons[type];
};

const RideDetailModal = ({ ride, onClose, userRole }: RideDetailModalProps) => {
  // Parse route geometry for map display
  let routeCoords: [number, number][] = [];
  if (ride.routeGeometry) {
    try {
      const geometry = JSON.parse(ride.routeGeometry);
      if (geometry.coordinates) {
        routeCoords = geometry.coordinates.map((coord: number[]) => [coord[1], coord[0]] as [number, number]);
      }
    } catch (e) {
      console.error("Error parsing route geometry:", e);
    }
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Trip Details</h2>
            <p className="text-sm text-gray-500">#{ride.id}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {/* Map Section */}
          <div className="h-48 rounded-2xl overflow-hidden mb-6 bg-gray-100">
            <RideMap
              pickup={[ride.pickupLat, ride.pickupLng]}
              dropoff={[ride.dropoffLat, ride.dropoffLng]}
              path={routeCoords}
            />
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-3 mb-6">
            {ride.status === 'COMPLETED' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                <CheckCircle size={14} /> Completed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                <XCircle size={14} /> Cancelled
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
              <VehicleIcon type={ride.vehicleType} /> 
              {ride.vehicleType === 'CAR' ? 'UberX' : ride.vehicleType}
            </span>
          </div>

          {/* Route Info */}
          <div className="bg-gray-50 rounded-2xl p-4 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-3 h-3 bg-black rounded-full mt-1.5" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Pickup</p>
                <p className="font-medium text-gray-900">{ride.pickupAddress}</p>
              </div>
            </div>
            <div className="ml-1.5 border-l-2 border-dashed border-gray-300 h-6" />
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full mt-1.5" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Dropoff</p>
                <p className="font-medium text-gray-900">{ride.dropoffAddress}</p>
              </div>
            </div>
          </div>

          {/* Trip Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Distance</p>
              <p className="text-lg font-bold">{ride.estimatedDistance?.toFixed(1) || '0'} km</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">Duration</p>
              <p className="text-lg font-bold">{Math.round(ride.estimatedDuration || 0)} min</p>
            </div>
            <div className="bg-zinc-900 rounded-xl p-4 text-center text-white">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1">Fare</p>
              <p className="text-lg font-bold">₹{ride.fare}</p>
            </div>
          </div>

          {/* Driver/Rider Info */}
          {userRole === 'RIDER' && ride.captain && (
            <div className="border border-gray-100 rounded-2xl p-4 mb-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">Captain</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center">
                    <span className="text-lg font-bold text-gray-600">
                      {ride.captain.user.fullName.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold">{ride.captain.user.fullName}</p>
                    <p className="text-sm text-gray-500">{ride.captain.vehicleColor} {ride.captain.vehicleModel}</p>
                    <p className="text-xs text-gray-400">{ride.captain.vehicleNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-lg">
                  <Star size={14} className="text-yellow-500 fill-yellow-500" />
                  <span className="font-medium text-sm">{ride.captain.rating.toFixed(1)}</span>
                </div>
              </div>
            </div>
          )}

          {userRole === 'CAPTAIN' && ride.rider && (
            <div className="border border-gray-100 rounded-2xl p-4 mb-6">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">Rider</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center">
                    <span className="text-lg font-bold text-gray-600">
                      {ride.rider.fullName.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold">{ride.rider.fullName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-lg">
                  <Star size={14} className="text-yellow-500 fill-yellow-500" />
                  <span className="font-medium text-sm">{ride.rider.riderProfile?.rating?.toFixed(1) || '5.0'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-sm text-gray-500 space-y-2">
            <div className="flex justify-between">
              <span>Booked at</span>
              <span className="font-medium text-gray-700">{formatDateTime(ride.createdAt)}</span>
            </div>
            {ride.startedAt && (
              <div className="flex justify-between">
                <span>Trip started</span>
                <span className="font-medium text-gray-700">{formatDateTime(ride.startedAt)}</span>
              </div>
            )}
            {ride.completedAt && (
              <div className="flex justify-between">
                <span>Trip ended</span>
                <span className="font-medium text-gray-700">{formatDateTime(ride.completedAt)}</span>
              </div>
            )}
          </div>

          {/* Rating Given */}
          {ride.reviews.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">Your Rating</p>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={20}
                    className={star <= ride.reviews[0].rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}
                  />
                ))}
              </div>
              {ride.reviews[0].comment && (
                <p className="text-sm text-gray-600 mt-2 italic">"{ride.reviews[0].comment}"</p>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const RideHistory = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState<RideHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedRide, setSelectedRide] = useState<RideHistoryItem | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  
  const token = localStorage.getItem('token');
  const userRole = token ? JSON.parse(atob(token.split('.')[1])).role : 'RIDER';

  useEffect(() => {
    const fetchRideHistory = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/ride/history?page=${page}&limit=10`);
        setRides(response.data.rides);
        setTotalPages(response.data.pagination.totalPages);
      } catch (error) {
        console.error("Error fetching ride history:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchRideHistory();
  }, [page]);

  const filteredRides = filter === 'all' 
    ? rides 
    : rides.filter(r => r.status === filter.toUpperCase());

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(userRole === 'RIDER' ? '/rider-dashboard' : '/captain-dashboard')}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Ride History</h1>
            <p className="text-sm text-gray-500">View all your past trips</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex gap-2 bg-white rounded-xl p-1.5 shadow-sm">
          {(['all', 'completed', 'cancelled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                filter === f 
                  ? 'bg-zinc-900 text-white' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 pb-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-zinc-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredRides.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock size={28} className="text-gray-400" />
            </div>
            <p className="text-gray-500">No rides found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRides.map((ride) => (
              <motion.div
                key={ride.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedRide(ride)}
              >
                <div className="p-4">
                  {/* Date & Status */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Calendar size={14} />
                      <span>{formatDate(ride.createdAt)}</span>
                      <span className="text-gray-300">•</span>
                      <span>{formatTime(ride.createdAt)}</span>
                    </div>
                    {ride.status === 'COMPLETED' ? (
                      <span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-700 rounded-full">
                        Completed
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-1 bg-red-100 text-red-700 rounded-full">
                        Cancelled
                      </span>
                    )}
                  </div>

                  {/* Route */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 bg-black rounded-full" />
                      <div className="w-0.5 h-6 bg-gray-200" />
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{ride.pickupAddress}</p>
                      <p className="text-sm text-gray-500 truncate mt-2">{ride.dropoffAddress}</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <VehicleIcon type={ride.vehicleType} />
                        {ride.vehicleType === 'CAR' ? 'UberX' : ride.vehicleType}
                      </span>
                      {ride.estimatedDistance && (
                        <span>{ride.estimatedDistance.toFixed(1)} km</span>
                      )}
                    </div>
                    <p className="text-lg font-bold">₹{ride.fare}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-sm text-gray-600 px-4">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedRide && (
          <RideDetailModal
            ride={selectedRide}
            onClose={() => setSelectedRide(null)}
            userRole={userRole}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default RideHistory;
