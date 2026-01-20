import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Users,
  FileCheck,
  Clock,
  CheckCircle,
  XCircle,
  LogOut,
  Search,
  Filter,
  Eye,
  Shield,
  Car,
  AlertCircle,
  ChevronDown,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

type DocumentType = 'LICENSE' | 'INSURANCE' | 'RC' | 'AADHAR' | 'PAN';
type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
type CaptainFilter = 'all' | 'verified' | 'unverified' | 'pending';

interface Captain {
  id: number;
  userId: number;
  vehicleType: string;
  vehicleNumber: string;
  isAvailable: boolean;
  isVerified: boolean;
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  documents: {
    id: number;
    documentType: DocumentType;
    status: DocumentStatus;
  }[];
  _count: {
    documents: number;
  };
}

interface PendingDocument {
  id: number;
  documentType: DocumentType;
  documentUrl: string;
  status: DocumentStatus;
  createdAt: string;
  captain: {
    id: number;
    vehicleType: string;
    vehicleNumber: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

interface DashboardStats {
  totalCaptains: number;
  verifiedCaptains: number;
  pendingVerifications: number;
  totalDocuments: number;
  pendingDocuments: number;
  verifiedDocuments: number;
  rejectedDocuments: number;
}

const DOCUMENT_LABELS: Record<DocumentType, string> = {
  LICENSE: 'Driving License',
  INSURANCE: 'Vehicle Insurance',
  RC: 'Registration Certificate',
  AADHAR: 'Aadhar Card',
  PAN: 'PAN Card',
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'captains' | 'documents'>('overview');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [captainFilter, setCaptainFilter] = useState<CaptainFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCaptain, setSelectedCaptain] = useState<Captain | null>(null);
  const [reviewingDoc, setReviewingDoc] = useState<PendingDocument | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, captainsRes, docsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get(`/admin/captains?filter=${captainFilter}`),
        api.get('/admin/documents/pending')
      ]);
      setStats(statsRes.data);
      setCaptains(captainsRes.data.captains || []);
      setPendingDocs(docsRes.data.documents || []);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [captainFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const handleReviewDocument = async (documentId: number, action: 'VERIFIED' | 'REJECTED') => {
    if (action === 'REJECTED' && !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      await api.patch(`/admin/documents/${documentId}/review`, {
        status: action,
        rejectionReason: action === 'REJECTED' ? rejectionReason : undefined
      });
      toast.success(`Document ${action.toLowerCase()}`);
      setReviewingDoc(null);
      setRejectionReason('');
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to review document');
    }
  };

  const handleToggleVerification = async (captainId: number, currentStatus: boolean) => {
    try {
      await api.patch(`/admin/captains/${captainId}/verification`, {
        isVerified: !currentStatus
      });
      toast.success(`Captain ${!currentStatus ? 'verified' : 'unverified'}`);
      fetchData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to update verification');
    }
  };

  const filteredCaptains = captains.filter(captain => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      captain.user.firstName.toLowerCase().includes(query) ||
      captain.user.lastName.toLowerCase().includes(query) ||
      captain.user.email.toLowerCase().includes(query) ||
      captain.vehicleNumber.toLowerCase().includes(query)
    );
  });

  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      {/* Header */}
      <header className="bg-zinc-800 border-b border-zinc-700 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="text-amber-500" size={28} />
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-zinc-800 border-b border-zinc-700">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1">
            {(['overview', 'captains', 'documents'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-4 font-medium capitalize transition-colors relative ${
                  activeTab === tab
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"
                  />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard
                icon={<Users size={24} />}
                label="Total Captains"
                value={stats.totalCaptains}
                color="blue"
              />
              <StatCard
                icon={<CheckCircle size={24} />}
                label="Verified Captains"
                value={stats.verifiedCaptains}
                color="green"
              />
              <StatCard
                icon={<Clock size={24} />}
                label="Pending Verifications"
                value={stats.pendingVerifications}
                color="amber"
              />
              <StatCard
                icon={<FileCheck size={24} />}
                label="Total Documents"
                value={stats.totalDocuments}
                color="purple"
              />
            </div>

            {/* Document Stats */}
            <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700">
              <h2 className="text-lg font-semibold mb-6">Document Statistics</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-center gap-4 p-4 bg-zinc-700/50 rounded-xl">
                  <div className="p-3 bg-amber-500/20 rounded-xl">
                    <Clock className="text-amber-500" size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.pendingDocuments}</p>
                    <p className="text-sm text-zinc-400">Pending Review</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-zinc-700/50 rounded-xl">
                  <div className="p-3 bg-green-500/20 rounded-xl">
                    <CheckCircle className="text-green-500" size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.verifiedDocuments}</p>
                    <p className="text-sm text-zinc-400">Verified</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-zinc-700/50 rounded-xl">
                  <div className="p-3 bg-red-500/20 rounded-xl">
                    <XCircle className="text-red-500" size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.rejectedDocuments}</p>
                    <p className="text-sm text-zinc-400">Rejected</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Pending Documents */}
            {pendingDocs.length > 0 && (
              <div className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold">Recent Pending Documents</h2>
                  <button
                    onClick={() => setActiveTab('documents')}
                    className="text-amber-500 hover:text-amber-400 text-sm font-medium"
                  >
                    View All →
                  </button>
                </div>
                <div className="space-y-4">
                  {pendingDocs.slice(0, 3).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 bg-zinc-700/50 rounded-xl"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-amber-500/20 rounded-lg">
                          <FileCheck className="text-amber-500" size={20} />
                        </div>
                        <div>
                          <p className="font-medium">{DOCUMENT_LABELS[doc.documentType]}</p>
                          <p className="text-sm text-zinc-400">
                            {doc.captain.user.firstName} {doc.captain.user.lastName}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setReviewingDoc(doc)}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg transition-colors"
                      >
                        Review
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Captains Tab */}
        {activeTab === 'captains' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                <input
                  type="text"
                  placeholder="Search captains..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                <select
                  value={captainFilter}
                  onChange={(e) => setCaptainFilter(e.target.value as CaptainFilter)}
                  className="pl-12 pr-10 py-3 bg-zinc-800 border border-zinc-700 rounded-xl focus:outline-none focus:border-amber-500 appearance-none cursor-pointer"
                >
                  <option value="all">All Captains</option>
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified</option>
                  <option value="pending">Pending Documents</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={20} />
              </div>
            </div>

            {/* Captains List */}
            <div className="bg-zinc-800 rounded-2xl border border-zinc-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-700/50">
                    <tr>
                      <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Captain</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Vehicle</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Documents</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Status</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-zinc-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700">
                    {filteredCaptains.map((captain) => (
                      <tr key={captain.id} className="hover:bg-zinc-700/30">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium">
                              {captain.user.firstName} {captain.user.lastName}
                            </p>
                            <p className="text-sm text-zinc-400">{captain.user.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Car size={18} className="text-zinc-400" />
                            <div>
                              <p className="font-medium">{captain.vehicleType}</p>
                              <p className="text-sm text-zinc-400">{captain.vehicleNumber}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">
                              {captain.documents.filter(d => d.status === 'VERIFIED').length}/5 verified
                            </span>
                            {captain.documents.some(d => d.status === 'PENDING') && (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-xs rounded-full">
                                Pending
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {captain.isVerified ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-500 rounded-full text-sm">
                              <CheckCircle size={14} />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-600 text-zinc-300 rounded-full text-sm">
                              <AlertCircle size={14} />
                              Unverified
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedCaptain(captain)}
                              className="p-2 hover:bg-zinc-600 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <Eye size={18} />
                            </button>
                            <button
                              onClick={() => handleToggleVerification(captain.id, captain.isVerified)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                captain.isVerified
                                  ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                                  : 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
                              }`}
                            >
                              {captain.isVerified ? 'Revoke' : 'Verify'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredCaptains.length === 0 && (
                  <div className="text-center py-12 text-zinc-400">
                    No captains found
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <h2 className="text-xl font-semibold">Pending Document Reviews</h2>
            
            {pendingDocs.length === 0 ? (
              <div className="bg-zinc-800 rounded-2xl p-12 border border-zinc-700 text-center">
                <CheckCircle className="mx-auto text-green-500 mb-4" size={48} />
                <p className="text-lg font-medium">All caught up!</p>
                <p className="text-zinc-400">No documents pending review</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingDocs.map((doc) => (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-3 bg-amber-500/20 rounded-xl">
                        <FileCheck className="text-amber-500" size={24} />
                      </div>
                      <span className="px-3 py-1 bg-amber-500/20 text-amber-500 text-xs font-medium rounded-full">
                        Pending
                      </span>
                    </div>
                    
                    <h3 className="font-semibold text-lg mb-1">
                      {DOCUMENT_LABELS[doc.documentType]}
                    </h3>
                    
                    <div className="space-y-2 mb-4">
                      <p className="text-zinc-400">
                        <span className="text-zinc-500">Captain:</span>{' '}
                        {doc.captain.user.firstName} {doc.captain.user.lastName}
                      </p>
                      <p className="text-zinc-400">
                        <span className="text-zinc-500">Vehicle:</span>{' '}
                        {doc.captain.vehicleNumber}
                      </p>
                      <p className="text-zinc-400 text-sm">
                        Submitted {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <button
                      onClick={() => setReviewingDoc(doc)}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl transition-colors"
                    >
                      Review Document
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Document Review Modal */}
      {reviewingDoc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-zinc-700 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Review Document</h2>
              <button
                onClick={() => {
                  setReviewingDoc(null);
                  setRejectionReason('');
                }}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500/20 rounded-xl">
                    <FileCheck className="text-amber-500" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{DOCUMENT_LABELS[reviewingDoc.documentType]}</h3>
                    <p className="text-sm text-zinc-400">
                      {reviewingDoc.captain.user.firstName} {reviewingDoc.captain.user.lastName}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-zinc-700/50 rounded-xl space-y-2">
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-500">Email:</span>{' '}
                    {reviewingDoc.captain.user.email}
                  </p>
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-500">Vehicle:</span>{' '}
                    {reviewingDoc.captain.vehicleType} - {reviewingDoc.captain.vehicleNumber}
                  </p>
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-500">Submitted:</span>{' '}
                    {new Date(reviewingDoc.createdAt).toLocaleString()}
                  </p>
                </div>

                {/* Document Preview Placeholder */}
                <div className="aspect-video bg-zinc-700 rounded-xl flex items-center justify-center">
                  <div className="text-center text-zinc-400">
                    <FileCheck size={48} className="mx-auto mb-2" />
                    <p className="text-sm">Document Preview</p>
                    <p className="text-xs text-zinc-500">(In production, display actual document)</p>
                  </div>
                </div>

                {/* Rejection Reason */}
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Rejection Reason (required if rejecting)
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason for rejection..."
                    className="w-full px-4 py-3 bg-zinc-700 border border-zinc-600 rounded-xl focus:outline-none focus:border-amber-500 resize-none"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => handleReviewDocument(reviewingDoc.id, 'REJECTED')}
                  className="flex-1 py-3 bg-red-500/20 text-red-500 hover:bg-red-500/30 font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <XCircle size={20} />
                  Reject
                </button>
                <button
                  onClick={() => handleReviewDocument(reviewingDoc.id, 'VERIFIED')}
                  className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle size={20} />
                  Verify
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Captain Details Modal */}
      {selectedCaptain && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6 border-b border-zinc-700 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Captain Details</h2>
              <button
                onClick={() => setSelectedCaptain(null)}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Captain Info */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-zinc-700 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold">
                    {selectedCaptain.user.firstName[0]}{selectedCaptain.user.lastName[0]}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {selectedCaptain.user.firstName} {selectedCaptain.user.lastName}
                  </h3>
                  <p className="text-zinc-400">{selectedCaptain.user.email}</p>
                  {selectedCaptain.isVerified ? (
                    <span className="inline-flex items-center gap-1 text-green-500 text-sm">
                      <CheckCircle size={14} />
                      Verified Captain
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-zinc-400 text-sm">
                      <AlertCircle size={14} />
                      Not Verified
                    </span>
                  )}
                </div>
              </div>

              {/* Vehicle Info */}
              <div className="p-4 bg-zinc-700/50 rounded-xl">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Car size={18} />
                  Vehicle Information
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-zinc-500">Type</p>
                    <p className="font-medium">{selectedCaptain.vehicleType}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Number</p>
                    <p className="font-medium">{selectedCaptain.vehicleNumber}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Status</p>
                    <p className={`font-medium ${selectedCaptain.isAvailable ? 'text-green-500' : 'text-zinc-400'}`}>
                      {selectedCaptain.isAvailable ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <FileCheck size={18} />
                  Documents ({selectedCaptain.documents.filter(d => d.status === 'VERIFIED').length}/5 Verified)
                </h4>
                <div className="space-y-2">
                  {(['LICENSE', 'INSURANCE', 'RC', 'AADHAR', 'PAN'] as DocumentType[]).map((type) => {
                    const doc = selectedCaptain.documents.find(d => d.documentType === type);
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between p-3 bg-zinc-700/50 rounded-lg"
                      >
                        <span className="text-sm">{DOCUMENT_LABELS[type]}</span>
                        {doc ? (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            doc.status === 'VERIFIED'
                              ? 'bg-green-500/20 text-green-500'
                              : doc.status === 'PENDING'
                              ? 'bg-amber-500/20 text-amber-500'
                              : 'bg-red-500/20 text-red-500'
                          }`}>
                            {doc.status}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 bg-zinc-600 text-zinc-400 rounded-full">
                            Not Uploaded
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => {
                  handleToggleVerification(selectedCaptain.id, selectedCaptain.isVerified);
                  setSelectedCaptain(null);
                }}
                className={`w-full py-3 font-semibold rounded-xl transition-colors ${
                  selectedCaptain.isVerified
                    ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                {selectedCaptain.isVerified ? 'Revoke Verification' : 'Verify Captain'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: number; 
  color: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-500/20 text-blue-500',
    green: 'bg-green-500/20 text-green-500',
    amber: 'bg-amber-500/20 text-amber-500',
    purple: 'bg-purple-500/20 text-purple-500',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-800 rounded-2xl p-6 border border-zinc-700"
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
          {icon}
        </div>
        <div>
          <p className="text-3xl font-bold">{value}</p>
          <p className="text-sm text-zinc-400">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}
