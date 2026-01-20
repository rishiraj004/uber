import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Phone, Shield, 
  MapPin, Siren,
  Copy, Check, ExternalLink
} from 'lucide-react';

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  rideId?: number;
  currentLocation?: { lat: number; lng: number } | null;
  driverName?: string;
  vehicleNumber?: string;
}

const EmergencyModal = ({
  isOpen,
  onClose,
  rideId,
  currentLocation,
  driverName,
  vehicleNumber
}: EmergencyModalProps) => {
  const [copiedRideId, setCopiedRideId] = useState(false);
  const [alertSent, setAlertSent] = useState(false);
  
  // Mock emergency contacts - in real app, fetch from user profile
  const emergencyContacts: EmergencyContact[] = [
    { id: '1', name: 'Emergency Services', phone: '112' },
    { id: '2', name: 'Police', phone: '100' },
    { id: '3', name: 'Women Helpline', phone: '1091' },
  ];

  const handleCopyRideId = () => {
    if (rideId) {
      navigator.clipboard.writeText(`Ride ID: ${rideId}`);
      setCopiedRideId(true);
      setTimeout(() => setCopiedRideId(false), 2000);
    }
  };

  const handleShareLocation = () => {
    if (currentLocation) {
      const locationUrl = `https://maps.google.com/?q=${currentLocation.lat},${currentLocation.lng}`;
      navigator.clipboard.writeText(
        `I need help! My current location: ${locationUrl}\nRide ID: ${rideId}\nDriver: ${driverName || 'Unknown'}\nVehicle: ${vehicleNumber || 'Unknown'}`
      );
      setAlertSent(true);
      setTimeout(() => setAlertSent(false), 3000);
    }
  };

  const handleCallEmergency = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="bg-red-600 p-5 sm:rounded-t-3xl rounded-t-3xl relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
            
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                <Siren size={28} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Emergency Support</h2>
                <p className="text-red-100 text-sm">Get help immediately</p>
              </div>
            </div>
          </div>

          {/* Alert Sent Notification */}
          <AnimatePresence>
            {alertSent && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-green-50 border-b border-green-100"
              >
                <div className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Check size={16} className="text-green-600" />
                  </div>
                  <p className="text-sm text-green-800 font-medium">
                    Location & ride details copied to clipboard!
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content */}
          <div className="p-5 space-y-5">
            {/* Quick Actions */}
            <div>
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                Quick Actions
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleCallEmergency('112')}
                  className="flex flex-col items-center gap-2 p-4 bg-red-50 rounded-2xl border-2 border-red-100 hover:bg-red-100 transition-colors"
                >
                  <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                    <Phone size={24} className="text-red-600" />
                  </div>
                  <span className="text-sm font-semibold text-red-700">Call 112</span>
                  <span className="text-[10px] text-red-500">Emergency Services</span>
                </button>

                <button
                  onClick={handleShareLocation}
                  className="flex flex-col items-center gap-2 p-4 bg-blue-50 rounded-2xl border-2 border-blue-100 hover:bg-blue-100 transition-colors"
                >
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <MapPin size={24} className="text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-blue-700">Share Location</span>
                  <span className="text-[10px] text-blue-500">Copy ride info</span>
                </button>
              </div>
            </div>

            {/* Ride Info Card */}
            {(rideId || driverName || vehicleNumber) && (
              <div className="bg-zinc-50 rounded-2xl p-4">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  Ride Details
                </h3>
                <div className="space-y-3">
                  {rideId && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-600">Ride ID</span>
                      <button
                        onClick={handleCopyRideId}
                        className="flex items-center gap-2 text-sm font-mono font-bold text-zinc-900 hover:text-blue-600 transition-colors"
                      >
                        #{rideId}
                        {copiedRideId ? (
                          <Check size={14} className="text-green-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  )}
                  {driverName && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-600">Driver</span>
                      <span className="text-sm font-semibold text-zinc-900">{driverName}</span>
                    </div>
                  )}
                  {vehicleNumber && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-600">Vehicle</span>
                      <span className="text-sm font-mono font-bold text-zinc-900">{vehicleNumber}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Emergency Contacts */}
            <div>
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                Emergency Numbers
              </h3>
              <div className="space-y-2">
                {emergencyContacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleCallEmergency(contact.phone)}
                    className="w-full flex items-center justify-between p-3 bg-zinc-50 rounded-xl hover:bg-zinc-100 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <Phone size={18} className="text-zinc-600" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-zinc-900">{contact.name}</p>
                        <p className="text-xs text-zinc-500">{contact.phone}</p>
                      </div>
                    </div>
                    <ExternalLink size={16} className="text-zinc-400 group-hover:text-zinc-600 transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* Safety Tips */}
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                  <Shield size={16} className="text-amber-600" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-900 mb-1">Safety Tips</h4>
                  <ul className="text-xs text-amber-800 space-y-1">
                    <li>• Stay calm and assess your situation</li>
                    <li>• Share your live location with trusted contacts</li>
                    <li>• If in danger, call 112 immediately</li>
                    <li>• Note down vehicle details and driver info</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-5 pt-0">
            <button
              onClick={onClose}
              className="w-full py-3 bg-zinc-100 text-zinc-700 rounded-xl font-semibold hover:bg-zinc-200 transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EmergencyModal;
