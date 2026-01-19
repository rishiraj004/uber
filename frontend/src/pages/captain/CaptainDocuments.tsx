import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Trash2,
  AlertCircle,
  Shield,
  Car,
  CreditCard,
  FileCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

type DocumentType = 'LICENSE' | 'INSURANCE' | 'RC' | 'AADHAR' | 'PAN';
type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

interface Document {
  id: number;
  documentType: DocumentType;
  documentUrl: string;
  status: DocumentStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface VerificationStatus {
  isVerified: boolean;
  canGoOnline: boolean;
  uploadedDocuments: number;
  requiredDocuments: number;
  documents: {
    type: DocumentType;
    status: DocumentStatus | null;
  }[];
}

const DOCUMENT_INFO: Record<DocumentType, { 
  label: string; 
  icon: React.ReactNode; 
  description: string;
  required: boolean;
}> = {
  LICENSE: { 
    label: 'Driving License', 
    icon: <CreditCard size={24} />, 
    description: 'Valid driving license (front & back)',
    required: true
  },
  INSURANCE: { 
    label: 'Vehicle Insurance', 
    icon: <Shield size={24} />, 
    description: 'Active vehicle insurance policy',
    required: true
  },
  RC: { 
    label: 'Registration Certificate', 
    icon: <Car size={24} />, 
    description: 'Vehicle registration certificate',
    required: true
  },
  AADHAR: { 
    label: 'Aadhar Card', 
    icon: <FileCheck size={24} />, 
    description: 'Government ID proof',
    required: true
  },
  PAN: { 
    label: 'PAN Card', 
    icon: <FileText size={24} />, 
    description: 'Tax identification',
    required: true
  },
};

export default function CaptainDocuments() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DocumentType | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const [docsResponse, statusResponse] = await Promise.all([
        api.get('/documents/'),
        api.get('/documents/verification-status')
      ]);
      setDocuments(docsResponse.data.documents || []);
      setVerificationStatus(statusResponse.data);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleFileUpload = async (type: DocumentType, file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a valid image (JPEG, PNG, WebP) or PDF');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setUploading(type);

    try {
      // Convert file to base64 for demo purposes
      // In production, you'd upload to cloud storage and send URL
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        
        try {
          await api.post('/documents/upload', {
            documentType: type,
            documentUrl: base64.substring(0, 200) + '...' // Truncate for demo
          });
          
          toast.success(`${DOCUMENT_INFO[type].label} uploaded successfully`);
          fetchDocuments();
        } catch (err: unknown) {
          const error = err as { response?: { data?: { message?: string } } };
          toast.error(error.response?.data?.message || 'Upload failed');
        } finally {
          setUploading(null);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Failed to process file');
      setUploading(null);
    }
  };

  const handleDelete = async (documentId: number, type: DocumentType) => {
    if (!confirm(`Are you sure you want to delete your ${DOCUMENT_INFO[type].label}?`)) {
      return;
    }

    try {
      await api.delete(`/documents/${documentId}`);
      toast.success('Document deleted');
      fetchDocuments();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to delete document');
    }
  };

  const getDocumentByType = (type: DocumentType): Document | undefined => {
    return documents.find(d => d.documentType === type);
  };

  const getStatusIcon = (status: DocumentStatus | null) => {
    switch (status) {
      case 'VERIFIED':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'REJECTED':
        return <XCircle className="text-red-500" size={20} />;
      case 'PENDING':
        return <Clock className="text-amber-500" size={20} />;
      default:
        return <AlertCircle className="text-zinc-400" size={20} />;
    }
  };

  const getStatusBadge = (status: DocumentStatus | null) => {
    switch (status) {
      case 'VERIFIED':
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Verified</span>;
      case 'REJECTED':
        return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">Rejected</span>;
      case 'PENDING':
        return <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">Pending Review</span>;
      default:
        return <span className="px-2 py-1 bg-zinc-100 text-zinc-600 text-xs font-medium rounded-full">Not Uploaded</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-zinc-900"></div>
      </div>
    );
  }

  const verifiedCount = documents.filter(d => d.status === 'VERIFIED').length;
  const totalRequired = Object.keys(DOCUMENT_INFO).length;
  const progress = (verifiedCount / totalRequired) * 100;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white border-b border-zinc-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/captain-dashboard')}
            className="p-2 hover:bg-zinc-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={20} className="text-zinc-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Document Verification</h1>
            <p className="text-sm text-zinc-500">Upload required documents to start earning</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Progress Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100 mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Verification Progress</h2>
              <p className="text-sm text-zinc-500">
                {verifiedCount} of {totalRequired} documents verified
              </p>
            </div>
            {verificationStatus?.isVerified ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-xl">
                <CheckCircle size={20} />
                <span className="font-medium">Verified</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl">
                <Clock size={20} />
                <span className="font-medium">In Progress</span>
              </div>
            )}
          </div>
          
          <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={`h-full rounded-full ${
                progress === 100 ? 'bg-green-500' : 'bg-amber-500'
              }`}
            />
          </div>

          {verificationStatus?.canGoOnline && (
            <p className="mt-4 text-sm text-green-600 flex items-center gap-2">
              <CheckCircle size={16} />
              You can now go online and accept rides!
            </p>
          )}
        </motion.div>

        {/* Documents List */}
        <div className="space-y-4">
          {(Object.keys(DOCUMENT_INFO) as DocumentType[]).map((type, index) => {
            const info = DOCUMENT_INFO[type];
            const doc = getDocumentByType(type);
            const isUploading = uploading === type;

            return (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`bg-white rounded-2xl p-6 shadow-sm border transition-all ${
                  doc?.status === 'REJECTED' 
                    ? 'border-red-200' 
                    : doc?.status === 'VERIFIED'
                    ? 'border-green-200'
                    : 'border-zinc-100'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${
                      doc?.status === 'VERIFIED' 
                        ? 'bg-green-50 text-green-600'
                        : doc?.status === 'REJECTED'
                        ? 'bg-red-50 text-red-600'
                        : doc?.status === 'PENDING'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {info.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-zinc-900">{info.label}</h3>
                        {info.required && (
                          <span className="text-xs text-red-500">Required</span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-500 mt-1">{info.description}</p>
                      
                      {doc?.status === 'REJECTED' && doc.rejectionReason && (
                        <div className="mt-2 p-3 bg-red-50 rounded-lg">
                          <p className="text-sm text-red-700">
                            <strong>Rejection reason:</strong> {doc.rejectionReason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {getStatusBadge(doc?.status || null)}
                    {getStatusIcon(doc?.status || null)}
                  </div>
                </div>

                {/* Upload/Actions Section */}
                <div className="mt-4 pt-4 border-t border-zinc-100">
                  {doc && doc.status !== 'REJECTED' ? (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-zinc-500">
                        Uploaded on {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                      {doc.status !== 'VERIFIED' && (
                        <button
                          onClick={() => handleDelete(doc.id, type)}
                          className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      )}
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(type, file);
                        }}
                        className="hidden"
                        disabled={isUploading}
                      />
                      <div className={`
                        flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl
                        transition-colors
                        ${isUploading 
                          ? 'border-zinc-200 bg-zinc-50 cursor-wait' 
                          : 'border-zinc-300 hover:border-zinc-900 hover:bg-zinc-50'
                        }
                      `}>
                        {isUploading ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-zinc-600" />
                            <span className="text-sm text-zinc-600">Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={20} className="text-zinc-500" />
                            <span className="text-sm text-zinc-600">
                              {doc?.status === 'REJECTED' ? 'Re-upload Document' : 'Upload Document'}
                            </span>
                          </>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Info Card */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 p-6 bg-blue-50 rounded-2xl border border-blue-100"
        >
          <h3 className="font-semibold text-blue-900 mb-2">Document Guidelines</h3>
          <ul className="space-y-2 text-sm text-blue-700">
            <li>• Upload clear, legible images or PDFs</li>
            <li>• All documents must be valid and not expired</li>
            <li>• Documents are typically verified within 24-48 hours</li>
            <li>• You'll be notified once your documents are verified</li>
          </ul>
        </motion.div>
      </div>
    </div>
  );
}
