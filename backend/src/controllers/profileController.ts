import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddelwares";
import prisma from "../config/prisma";

// Update rider's saved addresses (Home/Work)
export const updateRiderAddresses = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { homeAddress, homeAddressLat, homeAddressLng, workAddress, workAddressLat, workAddressLng } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const riderProfile = await prisma.riderProfile.findUnique({
            where: { userId }
        });

        if (!riderProfile) {
            return res.status(404).json({ message: "Rider profile not found" });
        }

        const updateData: any = {};
        
        if (homeAddress !== undefined) {
            updateData.homeAddress = homeAddress;
            updateData.homeAddressLat = homeAddressLat;
            updateData.homeAddressLng = homeAddressLng;
        }
        
        if (workAddress !== undefined) {
            updateData.workAddress = workAddress;
            updateData.workAddressLat = workAddressLat;
            updateData.workAddressLng = workAddressLng;
        }

        const updatedProfile = await prisma.riderProfile.update({
            where: { userId },
            data: updateData,
            select: {
                homeAddress: true,
                homeAddressLat: true,
                homeAddressLng: true,
                workAddress: true,
                workAddressLat: true,
                workAddressLng: true
            }
        });

        res.status(200).json({
            message: "Addresses updated successfully",
            addresses: updatedProfile
        });
    } catch (error) {
        console.error("Error updating rider addresses:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get rider's saved addresses
export const getRiderAddresses = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const riderProfile = await prisma.riderProfile.findUnique({
            where: { userId },
            select: {
                homeAddress: true,
                homeAddressLat: true,
                homeAddressLng: true,
                workAddress: true,
                workAddressLat: true,
                workAddressLng: true
            }
        });

        if (!riderProfile) {
            return res.status(404).json({ message: "Rider profile not found" });
        }

        res.status(200).json({ addresses: riderProfile });
    } catch (error) {
        console.error("Error fetching rider addresses:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Upload captain document (mock implementation)
export const uploadCaptainDocument = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { documentType, documentUrl } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!documentType || !documentUrl) {
            return res.status(400).json({ message: "Document type and URL are required" });
        }

        const validDocumentTypes = ['LICENSE', 'INSURANCE', 'RC', 'AADHAR', 'PAN'];
        if (!validDocumentTypes.includes(documentType)) {
            return res.status(400).json({ message: "Invalid document type" });
        }

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
            // Update existing document
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

        res.status(200).json({
            message: "Document uploaded successfully",
            document
        });
    } catch (error) {
        console.error("Error uploading captain document:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get captain's documents
export const getCaptainDocuments = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;

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

        const documents = await prisma.captainDocument.findMany({
            where: { captainId: captainProfile.id },
            orderBy: { uploadedAt: 'desc' }
        });

        // Define all required document types
        const requiredDocuments = [
            { type: 'LICENSE', label: 'Driving License', description: 'Valid driving license' },
            { type: 'INSURANCE', label: 'Vehicle Insurance', description: 'Valid vehicle insurance' },
            { type: 'RC', label: 'Registration Certificate', description: 'Vehicle registration certificate' },
            { type: 'AADHAR', label: 'Aadhar Card', description: 'Government ID proof' },
            { type: 'PAN', label: 'PAN Card', description: 'Tax identification' }
        ];

        // Map documents with their status
        const documentStatus = requiredDocuments.map(req => {
            const doc = documents.find(d => d.documentType === req.type);
            return {
                ...req,
                uploaded: !!doc,
                documentUrl: doc?.documentUrl || null,
                status: doc?.status || null,
                uploadedAt: doc?.uploadedAt || null,
                verifiedAt: doc?.verifiedAt || null
            };
        });

        const completionPercentage = Math.round(
            (documents.filter(d => d.status === 'VERIFIED').length / requiredDocuments.length) * 100
        );

        res.status(200).json({
            documents: documentStatus,
            completionPercentage,
            totalUploaded: documents.length,
            totalVerified: documents.filter(d => d.status === 'VERIFIED').length
        });
    } catch (error) {
        console.error("Error fetching captain documents:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get user profile with complete details
export const getFullProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const role = req.user?.role;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                role: true,
                createdAt: true,
                riderProfile: role === 'RIDER' ? {
                    select: {
                        rating: true,
                        totalRides: true,
                        homeAddress: true,
                        homeAddressLat: true,
                        homeAddressLng: true,
                        workAddress: true,
                        workAddressLat: true,
                        workAddressLng: true
                    }
                } : false,
                captainProfile: role === 'CAPTAIN' ? {
                    select: {
                        rating: true,
                        totalRides: true,
                        totalEarnings: true,
                        vehicleType: true,
                        vehicleNumber: true,
                        vehicleModel: true,
                        vehicleColor: true,
                        isOnline: true,
                        isAvailable: true,
                        documents: {
                            select: {
                                documentType: true,
                                status: true,
                                uploadedAt: true
                            }
                        }
                    }
                } : false
            }
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ profile: user });
    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
