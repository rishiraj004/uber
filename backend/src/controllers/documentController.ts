import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddlewares.js";
import prisma from "../config/prisma.js";

// Document types that captains can upload
const VALID_DOCUMENT_TYPES = ['LICENSE', 'INSURANCE', 'RC', 'AADHAR', 'PAN'] as const;
type DocumentType = typeof VALID_DOCUMENT_TYPES[number];

/**
 * Upload a document for captain verification
 * In production, this would integrate with a file storage service (S3, Cloudinary)
 * For now, we accept a URL directly
 */
export const uploadDocument = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { documentType, documentUrl } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!documentType || !documentUrl) {
            return res.status(400).json({ message: "Document type and URL are required" });
        }

        if (!VALID_DOCUMENT_TYPES.includes(documentType as DocumentType)) {
            return res.status(400).json({
                message: "Invalid document type",
                validTypes: VALID_DOCUMENT_TYPES
            });
        }

        // Get captain profile
        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId },
            select: { id: true }
        });

        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        // Check if document of this type already exists
        const existingDoc = await prisma.captainDocument.findFirst({
            where: {
                captainId: captainProfile.id,
                documentType
            }
        });

        let document;
        if (existingDoc) {
            // Update existing document (reset to PENDING for re-verification)
            document = await prisma.captainDocument.update({
                where: { id: existingDoc.id },
                data: {
                    documentUrl,
                    status: 'PENDING',
                    uploadedAt: new Date(),
                    verifiedAt: null
                }
            });
        } else {
            // Create new document
            document = await prisma.captainDocument.create({
                data: {
                    captainId: captainProfile.id,
                    documentType,
                    documentUrl,
                    status: 'PENDING'
                }
            });
        }

        // Reset captain verification status since documents changed
        await prisma.captainProfile.update({
            where: { id: captainProfile.id },
            data: { isVerified: false }
        });

        res.status(201).json({
            message: "Document uploaded successfully",
            document: {
                id: document.id,
                documentType: document.documentType,
                status: document.status,
                uploadedAt: document.uploadedAt
            }
        });
    } catch (error) {
        console.error("Error uploading document:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get all documents for the current captain
 */
export const getMyDocuments = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId },
            select: {
                id: true,
                isVerified: true,
                documents: {
                    select: {
                        id: true,
                        documentType: true,
                        documentUrl: true,
                        status: true,
                        uploadedAt: true,
                        verifiedAt: true
                    },
                    orderBy: { uploadedAt: 'desc' }
                }
            }
        });

        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        // Calculate verification progress
        const uploadedTypes = new Set(captainProfile.documents.map(d => d.documentType));
        const requiredDocs = ['LICENSE', 'INSURANCE', 'RC'];
        const missingDocs = requiredDocs.filter(type => !uploadedTypes.has(type));
        const verifiedDocs = captainProfile.documents.filter(d => d.status === 'VERIFIED').length;

        res.status(200).json({
            isVerified: captainProfile.isVerified,
            documents: captainProfile.documents,
            progress: {
                total: requiredDocs.length,
                uploaded: captainProfile.documents.length,
                verified: verifiedDocs,
                missingRequired: missingDocs
            },
            requiredDocuments: requiredDocs,
            optionalDocuments: ['AADHAR', 'PAN']
        });
    } catch (error) {
        console.error("Error fetching documents:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Delete a document
 */
export const deleteDocument = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { documentId } = req.params;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId },
            select: { id: true }
        });

        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        // Verify document belongs to this captain
        const document = await prisma.captainDocument.findFirst({
            where: {
                id: Number(documentId),
                captainId: captainProfile.id
            }
        });

        if (!document) {
            return res.status(404).json({ message: "Document not found" });
        }

        await prisma.captainDocument.delete({
            where: { id: document.id }
        });

        // Reset verification status
        await prisma.captainProfile.update({
            where: { id: captainProfile.id },
            data: { isVerified: false }
        });

        res.status(200).json({ message: "Document deleted successfully" });
    } catch (error) {
        console.error("Error deleting document:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get verification status for captain
 */
export const getVerificationStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId },
            select: {
                isVerified: true,
                documents: {
                    select: {
                        documentType: true,
                        status: true
                    }
                }
            }
        });

        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        const requiredDocs = ['LICENSE', 'INSURANCE', 'RC'];
        const docStatuses = captainProfile.documents.reduce((acc, doc) => {
            acc[doc.documentType] = doc.status;
            return acc;
        }, {} as Record<string, string>);

        const allRequiredVerified = requiredDocs.every(
            type => docStatuses[type] === 'VERIFIED'
        );

        const pendingDocs = captainProfile.documents.filter(d => d.status === 'PENDING');
        const rejectedDocs = captainProfile.documents.filter(d => d.status === 'REJECTED');

        res.status(200).json({
            isVerified: captainProfile.isVerified,
            canGoOnline: captainProfile.isVerified,
            documentStatuses: docStatuses,
            allRequiredVerified,
            pendingCount: pendingDocs.length,
            rejectedCount: rejectedDocs.length,
            message: !captainProfile.isVerified
                ? "Complete document verification to start accepting rides"
                : "Your account is verified. You can go online!"
        });
    } catch (error) {
        console.error("Error fetching verification status:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
