import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  CheckCircle,
  XCircle,
  LogOut,
  Search,
  Eye,
  Car,
  AlertCircle,
  X,
  Clock,
  RefreshCw,
  ChevronRight,
  BadgeCheck,
  ShieldAlert,
  BarChart3
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

type DocumentType = 'LICENSE' | 'INSURANCE' | 'RC' | 'AADHAR' | 'PAN';
type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
type CaptainFilter = 'all' | 'verified' | 'unverified' | 'pending';
type Tab = 'overview' | 'captains' | 'documents';

interface Captain {
  id: number;
  isVerified: boolean;
  isOnline: boolean;
  vehicleType: string;
  vehicleNumber: string;
  vehicleModel?: string;
  rating?: number;
  totalRides?: number;
  user: {
    id: number;
    fullName: string;
    email: string;
    phone?: string;
  };
  documents: {
    id: number;
    documentType: DocumentType;
    status: DocumentStatus;
  }[];
  documentsCount: number;
  pendingDocsCount: number;
  verifiedDocsCount: number;
}

interface PendingDocument {
  id: number;
  documentType: DocumentType;
  documentUrl: string;
  status: DocumentStatus;
  uploadedAt: string;
  captain: {
    id: number;
    vehicleNumber: string;
    user: {
      fullName: string;
      email: string;
      phone?: string;
    };
  };
}

interface Stats {
  users: {
    totalRiders: number;
    totalCaptains: number;
    verifiedCaptains: number;
    unverifiedCaptains: number;
    onlineCaptains: number;
  };
  documents: {
    pendingReview: number;
  };
  rides: {
    today: number;
    totalCompleted: number;
    totalRevenue: number;
  };
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
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [captainFilter, setCaptainFilter] = useState<CaptainFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCaptain, setSelectedCaptain] = useState<Captain | null>(null);
  const [reviewingDoc, setReviewingDoc] = useState<PendingDocument | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/stats');
      setStats(res.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchCaptains = useCallback(async () => {
    try {
      const statusParam = captainFilter === 'all' ? '' : `?status=${captainFilter}`;
      const res = await api.get(`/admin/captains${statusParam}`);
      setCaptains(res.data.captains || []);
    } catch (error) {
      console.error('Error fetching captains:', error);
    }
  }, [captainFilter]);

  const fetchPendingDocs = useCallback(async () => {
    try {
      const res = await api.get('/admin/documents/pending');
      setPendingDocs(res.data.documents || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchCaptains(), fetchPendingDocs()]);
    setLoading(false);
  }, [fetchStats, fetchCaptains, fetchPendingDocs]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    fetchCaptains();
  }, [captainFilter, fetchCaptains]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const handleReviewDocument = async (documentId: number, action: 'VERIFY' | 'REJECT') => {
    if (action === 'REJECT' && !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    setActionLoading(true);
    try {
      await api.patch(`/admin/documents/${documentId}/review`, {
        action,
        rejectionReason: action === 'REJECT' ? rejectionReason : undefined
      });
      toast.success(`Document ${action === 'VERIFY' ? 'verified' : 'rejected'} successfully`);
      setReviewingDoc(null);
      setRejectionReason('');
      fetchAllData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleVerification = async (captainId: number, currentStatus: boolean) => {
    setActionLoading(true);
    try {
      await api.patch(`/admin/captains/${captainId}/verify`, {
        isVerified: !currentStatus
      });
      toast.success(`Captain ${!currentStatus ? 'verified' : 'unverified'} successfully`);
      fetchCaptains();
      fetchStats();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredCaptains = captains.filter(captain => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      captain.user.fullName?.toLowerCase().includes(q) ||
      captain.user.email?.toLowerCase().includes(q) ||
      captain.vehicleNumber?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">U</span>
              </div>
              <span className="font-semibold text-gray-900">Admin Panel</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchAllData}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw size={18} />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors text-sm"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-8">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'captains', label: 'Captains', icon: Users },
              { id: 'documents', label: 'Documents', icon: FileText },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as Tab)}
                className={`flex items-center gap-2 py-4 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === id
                    ? 'border-black text-black'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={16} />
                {label}
                {id === 'documents' && pendingDocs.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                    {pendingDocs.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Captains"
                value={stats.users.totalCaptains}
                icon={<Users className="text-gray-400" size={20} />}
              />
              <StatCard
                label="Verified"
                value={stats.users.verifiedCaptains}
                icon={<BadgeCheck className="text-green-500" size={20} />}
                highlight="green"
              />
              <StatCard
                label="Unverified"
                value={stats.users.unverifiedCaptains}
                icon={<ShieldAlert className="text-orange-500" size={20} />}
                highlight="orange"
              />
              <StatCard
                label="Online Now"
                value={stats.users.onlineCaptains}
                icon={<div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />}
              />
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Riders</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{stats.users.totalRiders}</p>
                  </div>
                  <Users className="text-gray-300" size={32} />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Completed Rides</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{stats.rides.totalCompleted}</p>
                  </div>
                  <Car className="text-gray-300" size={32} />
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Total Revenue</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">₹{stats.rides.totalRevenue.toLocaleString()}</p>
                  </div>
                  <span className="text-3xl text-gray-300">₹</span>
                </div>
              </div>
            </div>

            {/* Pending Documents Alert */}
            {pendingDocs.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <Clock className="text-orange-600" size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{pendingDocs.length} documents pending review</p>
                      <p className="text-sm text-gray-500">Review documents to verify captains</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('documents')}
                    className="flex items-center gap-1 text-orange-600 hover:text-orange-700 font-medium text-sm"
                  >
                    Review
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Recent Captains */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Recent Captains</h3>
                <button
                  onClick={() => setActiveTab('captains')}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  View all
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {captains.slice(0, 5).map((captain) => (
                  <div key={captain.id} className="px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-600">
                          {captain.user.fullName?.charAt(0) || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{captain.user.fullName}</p>
                        <p className="text-sm text-gray-500">{captain.vehicleNumber}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      captain.isVerified
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {captain.isVerified ? 'Verified' : 'Pending'}
                    </span>
                  </div>
                ))}
                {captains.length === 0 && (
                  <p className="px-5 py-8 text-center text-gray-400">No captains yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Captains Tab */}
        {activeTab === 'captains' && (
          <div className="space-y-4">
            {/* Search & Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by name, email, or vehicle..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                />
              </div>
              <select
                value={captainFilter}
                onChange={(e) => setCaptainFilter(e.target.value as CaptainFilter)}
                className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent cursor-pointer"
              >
                <option value="all">All Captains</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
                <option value="pending">Pending Docs</option>
              </select>
            </div>

            {/* Captains Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Captain</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Documents</th>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCaptains.map((captain) => (
                      <tr key={captain.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                              <span className="text-sm font-medium text-gray-600">
                                {captain.user.fullName?.charAt(0) || '?'}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 truncate">{captain.user.fullName}</p>
                              <p className="text-sm text-gray-500 truncate">{captain.user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-gray-900">{captain.vehicleType}</p>
                          <p className="text-sm text-gray-500">{captain.vehicleNumber}</p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">
                              {captain.verifiedDocsCount}/{captain.documentsCount || 0}
                            </span>
                            {captain.pendingDocsCount > 0 && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full">
                                {captain.pendingDocsCount} pending
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {captain.isVerified ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                              <CheckCircle size={12} />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                              <AlertCircle size={12} />
                              Unverified
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedCaptain(captain)}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => handleToggleVerification(captain.id, captain.isVerified)}
                              disabled={actionLoading}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                captain.isVerified
                                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                  : 'bg-green-50 text-green-600 hover:bg-green-100'
                              } disabled:opacity-50`}
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
                  <div className="py-12 text-center text-gray-400">
                    <Users className="mx-auto mb-2" size={32} />
                    <p>No captains found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Pending Documents</h2>
              <span className="text-sm text-gray-500">{pendingDocs.length} documents</span>
            </div>

            {pendingDocs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
                <CheckCircle className="mx-auto text-green-500 mb-3" size={40} />
                <p className="font-medium text-gray-900">All caught up!</p>
                <p className="text-sm text-gray-500 mt-1">No documents pending review</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pendingDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                        <FileText className="text-orange-500" size={20} />
                      </div>
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                        Pending
                      </span>
                    </div>
                    
                    <h3 className="font-medium text-gray-900 mb-1">
                      {DOCUMENT_LABELS[doc.documentType]}
                    </h3>
                    
                    <p className="text-sm text-gray-600 mb-1">{doc.captain.user.fullName}</p>
                    <p className="text-xs text-gray-400 mb-4">
                      {doc.captain.vehicleNumber} • {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>

                    <button
                      onClick={() => setReviewingDoc(doc)}
                      className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                    >
                      Review Document
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Document Review Modal */}
      {reviewingDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Review Document</h2>
              <button
                onClick={() => {
                  setReviewingDoc(null);
                  setRejectionReason('');
                }}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                  <FileText className="text-orange-500" size={20} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{DOCUMENT_LABELS[reviewingDoc.documentType]}</p>
                  <p className="text-sm text-gray-500 truncate">{reviewingDoc.captain.user.fullName}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span className="text-gray-900">{reviewingDoc.captain.user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Vehicle</span>
                  <span className="text-gray-900">{reviewingDoc.captain.vehicleNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Submitted</span>
                  <span className="text-gray-900">{new Date(reviewingDoc.uploadedAt).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Document Preview */}
              <div className="aspect-4/3 bg-gray-100 rounded-xl flex items-center justify-center overflow-hidden">
                {reviewingDoc.documentUrl && !reviewingDoc.documentUrl.includes('...') ? (
                  <img
                    src={reviewingDoc.documentUrl}
                    alt="Document"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <FileText className="mx-auto text-gray-300 mb-2" size={32} />
                    <p className="text-xs text-gray-400">Preview not available</p>
                  </div>
                )}
              </div>

              {/* Rejection Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Rejection reason <span className="text-gray-400 font-normal">(required if rejecting)</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent resize-none"
                  rows={2}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleReviewDocument(reviewingDoc.id, 'REJECT')}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <XCircle size={16} />
                  Reject
                </button>
                <button
                  onClick={() => handleReviewDocument(reviewingDoc.id, 'VERIFY')}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle size={16} />
                  Verify
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Captain Details Modal */}
      {selectedCaptain && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="font-semibold text-gray-900">Captain Details</h2>
              <button
                onClick={() => setSelectedCaptain(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            
            <div className="p-5 space-y-5">
              {/* Profile */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
                  <span className="text-xl font-semibold text-gray-600">
                    {selectedCaptain.user.fullName?.charAt(0) || '?'}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{selectedCaptain.user.fullName}</h3>
                  <p className="text-sm text-gray-500">{selectedCaptain.user.email}</p>
                  {selectedCaptain.isVerified ? (
                    <span className="inline-flex items-center gap-1 text-green-600 text-xs mt-1">
                      <CheckCircle size={12} />
                      Verified Captain
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-500 text-xs mt-1">
                      <AlertCircle size={12} />
                      Not Verified
                    </span>
                  )}
                </div>
              </div>

              {/* Vehicle Info */}
              <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Car size={16} />
                  Vehicle Details
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-400">Type</p>
                    <p className="font-medium text-gray-900">{selectedCaptain.vehicleType}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Number</p>
                    <p className="font-medium text-gray-900">{selectedCaptain.vehicleNumber}</p>
                  </div>
                  {selectedCaptain.vehicleModel && (
                    <div>
                      <p className="text-gray-400">Model</p>
                      <p className="font-medium text-gray-900">{selectedCaptain.vehicleModel}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-400">Status</p>
                    <p className={`font-medium ${selectedCaptain.isOnline ? 'text-green-600' : 'text-gray-500'}`}>
                      {selectedCaptain.isOnline ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Documents */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <FileText size={16} />
                  Documents ({selectedCaptain.verifiedDocsCount}/{selectedCaptain.documentsCount || 0})
                </h4>
                <div className="space-y-2">
                  {(['LICENSE', 'INSURANCE', 'RC', 'AADHAR', 'PAN'] as DocumentType[]).map((type) => {
                    const doc = selectedCaptain.documents?.find(d => d.documentType === type);
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between py-2.5 px-3 bg-gray-50 rounded-lg"
                      >
                        <span className="text-sm text-gray-700">{DOCUMENT_LABELS[type]}</span>
                        {doc ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            doc.status === 'VERIFIED'
                              ? 'bg-green-100 text-green-700'
                              : doc.status === 'PENDING'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {doc.status}
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full">
                            Not uploaded
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action */}
              <button
                onClick={() => {
                  handleToggleVerification(selectedCaptain.id, selectedCaptain.isVerified);
                  setSelectedCaptain(null);
                }}
                disabled={actionLoading}
                className={`w-full py-3 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 ${
                  selectedCaptain.isVerified
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {selectedCaptain.isVerified ? 'Revoke Verification' : 'Verify Captain'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon,
  highlight
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode;
  highlight?: 'green' | 'orange';
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        {icon}
        {highlight && (
          <div className={`w-2 h-2 rounded-full ${
            highlight === 'green' ? 'bg-green-500' : 'bg-orange-500'
          }`} />
        )}
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}
