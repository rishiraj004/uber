import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddelwares";
import prisma from "../config/prisma";

/**
 * Get all captains with their verification status (Admin only)
 */
export const getAllCaptains = async (req: AuthRequest, res: Response) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        // Build where clause based on filters
        const whereClause: any = {};
        if (status === 'verified') {
            whereClause.isVerified = true;
        } else if (status === 'unverified') {
            whereClause.isVerified = false;
        } else if (status === 'pending') {
            whereClause.documents = {
                some: { status: 'PENDING' }
            };
        }

        const [captains, total] = await Promise.all([
            prisma.captainProfile.findMany({
                where: whereClause,
                select: {
                    id: true,
                    isVerified: true,
                    isOnline: true,
                    vehicleType: true,
                    vehicleNumber: true,
                    vehicleModel: true,
                    rating: true,
                    totalRides: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            phone: true
                        }
                    },
                    documents: {
                        select: {
                            id: true,
                            documentType: true,
                            status: true,
                            uploadedAt: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: Number(limit)
            }),
            prisma.captainProfile.count({ where: whereClause })
        ]);

        // Calculate stats
        const stats = await prisma.captainProfile.groupBy({
            by: ['isVerified'],
            _count: { id: true }
        });

        const pendingDocsCount = await prisma.captainDocument.count({
            where: { status: 'PENDING' }
        });

        res.status(200).json({
            captains: captains.map(captain => ({
                ...captain,
                documentsCount: captain.documents.length,
                pendingDocsCount: captain.documents.filter(d => d.status === 'PENDING').length,
                verifiedDocsCount: captain.documents.filter(d => d.status === 'VERIFIED').length
            })),
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            },
            stats: {
                totalCaptains: stats.reduce((sum, s) => sum + s._count.id, 0),
                verifiedCaptains: stats.find(s => s.isVerified)?._count.id || 0,
                unverifiedCaptains: stats.find(s => !s.isVerified)?._count.id || 0,
                pendingDocuments: pendingDocsCount
            }
        });
    } catch (error) {
        console.error("Error fetching captains:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get detailed captain info with all documents (Admin only)
 */
export const getCaptainDetails = async (req: AuthRequest, res: Response) => {
    try {
        const { captainId } = req.params;

        const captain = await prisma.captainProfile.findUnique({
            where: { id: Number(captainId) },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                        phone: true,
                        createdAt: true
                    }
                },
                documents: {
                    orderBy: { uploadedAt: 'desc' }
                },
                _count: {
                    select: { ridesGiven: true }
                }
            }
        });

        if (!captain) {
            return res.status(404).json({ message: "Captain not found" });
        }

        res.status(200).json({ captain });
    } catch (error) {
        console.error("Error fetching captain details:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get all pending documents for review (Admin only)
 */
export const getPendingDocuments = async (req: AuthRequest, res: Response) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const [documents, total] = await Promise.all([
            prisma.captainDocument.findMany({
                where: { status: 'PENDING' },
                include: {
                    captain: {
                        select: {
                            id: true,
                            vehicleNumber: true,
                            user: {
                                select: {
                                    fullName: true,
                                    email: true,
                                    phone: true
                                }
                            }
                        }
                    }
                },
                orderBy: { uploadedAt: 'asc' }, // Oldest first (FIFO)
                skip,
                take: Number(limit)
            }),
            prisma.captainDocument.count({ where: { status: 'PENDING' } })
        ]);

        res.status(200).json({
            documents,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        console.error("Error fetching pending documents:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Verify or reject a document (Admin only)
 */
export const reviewDocument = async (req: AuthRequest, res: Response) => {
    try {
        const { documentId } = req.params;
        const { action, rejectionReason } = req.body;

        if (!['VERIFY', 'REJECT'].includes(action)) {
            return res.status(400).json({ message: "Action must be VERIFY or REJECT" });
        }

        const document = await prisma.captainDocument.findUnique({
            where: { id: Number(documentId) },
            include: { captain: true }
        });

        if (!document) {
            return res.status(404).json({ message: "Document not found" });
        }

        const newStatus = action === 'VERIFY' ? 'VERIFIED' : 'REJECTED';

        await prisma.captainDocument.update({
            where: { id: document.id },
            data: {
                status: newStatus,
                verifiedAt: action === 'VERIFY' ? new Date() : null
            }
        });

        // Check if all required documents are now verified
        if (action === 'VERIFY') {
            const requiredDocs = ['LICENSE', 'INSURANCE', 'RC'];
            const captainDocs = await prisma.captainDocument.findMany({
                where: { captainId: document.captainId },
                select: { documentType: true, status: true }
            });

            const allRequiredVerified = requiredDocs.every(type =>
                captainDocs.some(d => d.documentType === type && d.status === 'VERIFIED')
            );

            if (allRequiredVerified) {
                await prisma.captainProfile.update({
                    where: { id: document.captainId },
                    data: { isVerified: true }
                });
            }
        } else {
            // If rejecting, ensure captain is not verified
            await prisma.captainProfile.update({
                where: { id: document.captainId },
                data: { isVerified: false }
            });
        }

        res.status(200).json({
            message: `Document ${action === 'VERIFY' ? 'verified' : 'rejected'} successfully`,
            documentId: document.id,
            newStatus,
            rejectionReason: action === 'REJECT' ? rejectionReason : undefined
        });
    } catch (error) {
        console.error("Error reviewing document:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Manually verify/unverify a captain (Admin only)
 */
export const setCaptainVerification = async (req: AuthRequest, res: Response) => {
    try {
        const { captainId } = req.params;
        const { isVerified } = req.body;

        if (typeof isVerified !== 'boolean') {
            return res.status(400).json({ message: "isVerified must be a boolean" });
        }

        const captain = await prisma.captainProfile.findUnique({
            where: { id: Number(captainId) }
        });

        if (!captain) {
            return res.status(404).json({ message: "Captain not found" });
        }

        await prisma.captainProfile.update({
            where: { id: captain.id },
            data: { isVerified }
        });

        res.status(200).json({
            message: `Captain ${isVerified ? 'verified' : 'unverified'} successfully`,
            captainId: captain.id,
            isVerified
        });
    } catch (error) {
        console.error("Error setting captain verification:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get admin dashboard stats
 */
export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

        const [
            totalUsers,
            totalCaptains,
            verifiedCaptains,
            onlineCaptains,
            pendingDocs,
            todayRides,
            completedRides,
            totalRevenue
        ] = await Promise.all([
            prisma.user.count({ where: { role: 'RIDER' } }),
            prisma.captainProfile.count(),
            prisma.captainProfile.count({ where: { isVerified: true } }),
            prisma.captainProfile.count({ where: { isOnline: true } }),
            prisma.captainDocument.count({ where: { status: 'PENDING' } }),
            prisma.ride.count({ where: { createdAt: { gte: startOfDay } } }),
            prisma.ride.count({ where: { status: 'COMPLETED' } }),
            prisma.ride.aggregate({
                where: { status: 'COMPLETED' },
                _sum: { fare: true }
            })
        ]);

        res.status(200).json({
            users: {
                totalRiders: totalUsers,
                totalCaptains,
                verifiedCaptains,
                unverifiedCaptains: totalCaptains - verifiedCaptains,
                onlineCaptains
            },
            documents: {
                pendingReview: pendingDocs
            },
            rides: {
                today: todayRides,
                totalCompleted: completedRides,
                totalRevenue: totalRevenue._sum.fare || 0
            }
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
