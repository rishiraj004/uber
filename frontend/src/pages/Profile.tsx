import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Mail, Phone, Star, Home, Briefcase,
  Car, FileText, CheckCircle, Clock, XCircle, Upload, LogOut,
  ChevronRight, Shield, Edit2, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import toast from 'react-hot-toast';
import AddressAutocomplete from '../components/AddressAutocomplete';

interface UserProfile {
  id: number;
  email: string;
  fullName: string;
  phone: string;
  role: 'RIDER' | 'CAPTAIN';
  createdAt: string;
  riderProfile?: {
    rating: number;
    totalRides: number;
    homeAddress: string | null;
    homeAddressLat: number | null;
    homeAddressLng: number | null;
    workAddress: string | null;
    workAddressLat: number | null;
    workAddressLng: number | null;
  };
  captainProfile?: {
    rating: number;
    totalRides: number;
    totalEarnings: number;
    vehicleType: string;
    vehicleNumber: string;
    vehicleModel: string;
    vehicleColor: string;
    isOnline: boolean;
    isAvailable: boolean;
    documents: {
      documentType: string;
      status: string;
      uploadedAt: string;
    }[];
  };
}

interface DocumentItem {
  type: string;
  label: string;
  description: string;
  uploaded: boolean;
  documentUrl: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  uploadedAt: string | null;
}

// Generate UUID for Mapbox session token
const generateSessionToken = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const Profile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'addresses' | 'documents'>('profile');
  const [editingAddress, setEditingAddress] = useState<'home' | 'work' | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [sessionToken] = useState(() => generateSessionToken());

  // Address edit states
  const [tempAddress, setTempAddress] = useState('');
  const [tempCoords, setTempCoords] = useState<{ lat: number; lng: number } | null>(null);

  const token = localStorage.getItem('token');
  const userRole = token ? JSON.parse(atob(token.split('.')[1])).role : 'RIDER';

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/profile/me');
        setProfile(response.data.profile);
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    if (userRole === 'CAPTAIN') {
      const fetchDocuments = async () => {
        try {
          const response = await api.get('/profile/captain/documents');
          setDocuments(response.data.documents);
        } catch (error) {
          console.error("Error fetching documents:", error);
        }
      };
      fetchDocuments();
    }
  }, [userRole]);

  const handleSaveAddress = async (type: 'home' | 'work') => {
    if (!tempAddress || !tempCoords) {
      toast.error("Please select a valid address");
      return;
    }

    try {
      const payload = type === 'home' 
        ? { homeAddress: tempAddress, homeAddressLat: tempCoords.lat, homeAddressLng: tempCoords.lng }
        : { workAddress: tempAddress, workAddressLat: tempCoords.lat, workAddressLng: tempCoords.lng };

      await api.put('/profile/rider/addresses', payload);
      
      // Update local state
      if (profile?.riderProfile) {
        setProfile({
          ...profile,
          riderProfile: {
            ...profile.riderProfile,
            ...(type === 'home' 
              ? { homeAddress: tempAddress, homeAddressLat: tempCoords.lat, homeAddressLng: tempCoords.lng }
              : { workAddress: tempAddress, workAddressLat: tempCoords.lat, workAddressLng: tempCoords.lng })
          }
        });
      }

      setEditingAddress(null);
      setTempAddress('');
      setTempCoords(null);
      toast.success(`${type === 'home' ? 'Home' : 'Work'} address saved!`);
    } catch (error) {
      console.error("Error saving address:", error);
      toast.error("Failed to save address");
    }
  };

  const handleUploadDocument = async (docType: string) => {
    // Mock upload - in production, you'd use a file upload service
    const mockUrl = `https://example.com/documents/${docType.toLowerCase()}_${Date.now()}.pdf`;
    
    try {
      await api.post('/profile/captain/documents', {
        documentType: docType,
        documentUrl: mockUrl
      });

      // Refresh documents
      const response = await api.get('/profile/captain/documents');
      setDocuments(response.data.documents);
      toast.success('Document uploaded successfully!');
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Failed to upload document");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <CheckCircle size={12} /> Verified
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
            <Clock size={12} /> Pending
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
            <XCircle size={12} /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
            Not Uploaded
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-zinc-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-zinc-900 text-white">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => navigate(userRole === 'RIDER' ? '/rider-dashboard' : '/captain-dashboard')}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold">Profile</h1>
          </div>

          {/* Profile Card */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center">
              <span className="text-3xl font-bold">{profile?.fullName.charAt(0)}</span>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{profile?.fullName}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-white/70 text-sm">
                  <Star size={14} className="text-yellow-400 fill-yellow-400" />
                  {userRole === 'RIDER' 
                    ? profile?.riderProfile?.rating.toFixed(1) 
                    : profile?.captainProfile?.rating.toFixed(1)}
                </span>
                <span className="text-white/50">•</span>
                <span className="text-white/70 text-sm">
                  {userRole === 'RIDER' 
                    ? `${profile?.riderProfile?.totalRides || 0} rides`
                    : `${profile?.captainProfile?.totalRides || 0} trips`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'profile' 
                  ? 'border-zinc-900 text-zinc-900' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Profile
            </button>
            {userRole === 'RIDER' && (
              <button
                onClick={() => setActiveTab('addresses')}
                className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'addresses' 
                    ? 'border-zinc-900 text-zinc-900' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Saved Places
              </button>
            )}
            {userRole === 'CAPTAIN' && (
              <button
                onClick={() => setActiveTab('documents')}
                className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'documents' 
                    ? 'border-zinc-900 text-zinc-900' 
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Documents
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Contact Info */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Contact Information</h3>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                      <Mail size={18} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Email</p>
                      <p className="font-medium">{profile?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                      <Phone size={18} className="text-gray-500" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wider">Phone</p>
                      <p className="font-medium">{profile?.phone}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vehicle Info for Captains */}
              {userRole === 'CAPTAIN' && profile?.captainProfile && (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900">Vehicle Information</h3>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                        <Car size={18} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Vehicle</p>
                        <p className="font-medium">
                          {profile.captainProfile.vehicleColor} {profile.captainProfile.vehicleModel}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                        <FileText size={18} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">License Plate</p>
                        <p className="font-medium">{profile.captainProfile.vehicleNumber}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Earnings for Captains */}
              {userRole === 'CAPTAIN' && profile?.captainProfile && (
                <div className="bg-linear-to-r from-zinc-900 to-zinc-800 rounded-2xl p-6 text-white">
                  <p className="text-sm text-white/60 uppercase tracking-wider">Total Earnings</p>
                  <p className="text-3xl font-bold mt-1">₹{profile.captainProfile.totalEarnings.toFixed(2)}</p>
                </div>
              )}

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <button
                  onClick={() => navigate('/ride-history')}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                      <Clock size={18} className="text-gray-500" />
                    </div>
                    <span className="font-medium">Ride History</span>
                  </div>
                  <ChevronRight size={18} className="text-gray-400" />
                </button>
                <div className="border-t border-gray-100" />
                <button
                  onClick={handleLogout}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-red-600"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                      <LogOut size={18} className="text-red-500" />
                    </div>
                    <span className="font-medium">Logout</span>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'addresses' && userRole === 'RIDER' && (
            <motion.div
              key="addresses"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <p className="text-sm text-gray-500 mb-4">
                Save your frequently visited places for quick one-tap booking.
              </p>

              {/* Home Address */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {editingAddress === 'home' ? (
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                          <Home size={18} className="text-blue-600" />
                        </div>
                        <span className="font-semibold">Home Address</span>
                      </div>
                      <button
                        onClick={() => {
                          setEditingAddress(null);
                          setTempAddress('');
                          setTempCoords(null);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <X size={18} className="text-gray-500" />
                      </button>
                    </div>
                    <AddressAutocomplete
                      placeholder="Enter home address"
                      value={tempAddress}
                      onChange={setTempAddress}
                      onSelect={(suggestion) => {
                        setTempAddress(suggestion.name);
                        setTempCoords({ lat: suggestion.latitude, lng: suggestion.longitude });
                      }}
                      icon="dropoff"
                      sessionToken={sessionToken}
                    />
                    <button
                      onClick={() => handleSaveAddress('home')}
                      className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
                    >
                      Save Home Address
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingAddress('home')}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                        <Home size={18} className="text-blue-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">Home</p>
                        <p className="text-sm text-gray-500 truncate max-w-xs">
                          {profile?.riderProfile?.homeAddress || 'Add home address'}
                        </p>
                      </div>
                    </div>
                    <Edit2 size={18} className="text-gray-400" />
                  </button>
                )}
              </div>

              {/* Work Address */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {editingAddress === 'work' ? (
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                          <Briefcase size={18} className="text-purple-600" />
                        </div>
                        <span className="font-semibold">Work Address</span>
                      </div>
                      <button
                        onClick={() => {
                          setEditingAddress(null);
                          setTempAddress('');
                          setTempCoords(null);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <X size={18} className="text-gray-500" />
                      </button>
                    </div>
                    <AddressAutocomplete
                      placeholder="Enter work address"
                      value={tempAddress}
                      onChange={setTempAddress}
                      onSelect={(suggestion) => {
                        setTempAddress(suggestion.name);
                        setTempCoords({ lat: suggestion.latitude, lng: suggestion.longitude });
                      }}
                      icon="dropoff"
                      sessionToken={sessionToken}
                    />
                    <button
                      onClick={() => handleSaveAddress('work')}
                      className="w-full py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-colors"
                    >
                      Save Work Address
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingAddress('work')}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                        <Briefcase size={18} className="text-purple-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">Work</p>
                        <p className="text-sm text-gray-500 truncate max-w-xs">
                          {profile?.riderProfile?.workAddress || 'Add work address'}
                        </p>
                      </div>
                    </div>
                    <Edit2 size={18} className="text-gray-400" />
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'documents' && userRole === 'CAPTAIN' && (
            <motion.div
              key="documents"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
                <Shield size={20} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900">Document Verification</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Upload your documents for verification. All documents must be verified before you can start accepting rides.
                  </p>
                </div>
              </div>

              {/* Document List */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
                {documents.map((doc) => (
                  <div key={doc.type} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          doc.status === 'VERIFIED' 
                            ? 'bg-green-100' 
                            : doc.status === 'PENDING'
                            ? 'bg-yellow-100'
                            : 'bg-gray-100'
                        }`}>
                          <FileText size={18} className={
                            doc.status === 'VERIFIED'
                              ? 'text-green-600'
                              : doc.status === 'PENDING'
                              ? 'text-yellow-600'
                              : 'text-gray-500'
                          } />
                        </div>
                        <div>
                          <p className="font-medium">{doc.label}</p>
                          <p className="text-xs text-gray-500">{doc.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(doc.status)}
                        {(!doc.uploaded || doc.status === 'REJECTED') && (
                          <button
                            onClick={() => handleUploadDocument(doc.type)}
                            className="p-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            <Upload size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 text-center">
                Documents are reviewed within 24-48 hours
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Profile;
