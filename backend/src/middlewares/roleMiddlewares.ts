import { Response, NextFunction } from "express";
import { AuthRequest } from "./authMiddelwares";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";


export const authorizeRole = ( requiredRole : 'RIDER' | 'CAPTAIN' | 'ADMIN') => {
    return ( req : AuthRequest , res : Response , next : NextFunction ) => {
        const userRole = req.user?.role;
        if (userRole !== requiredRole) {
            return res.status(403).json({ message: "Access denied. Insufficient permissions." });
        }
        next();
    }
}

export const authorizeAdmin = ( req : AuthRequest , res : Response , next : NextFunction ) => {
    const userRole = req.user?.role;
    if (userRole !== 'ADMIN') {
        return res.status(403).json({ message: "Access denied. Admin privileges required." });
    }
    next();
}

// Middleware to attach captain profile to request
export const attachCaptainProfile = async ( req : AuthRequest , res : Response , next : NextFunction ) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "User not authenticated" });
        }

        const captainProfile = await prisma.captainProfile.findUnique({
            where: { userId }
        });

        if (!captainProfile) {
            return res.status(404).json({ message: "Captain profile not found" });
        }

        (req as any).captainProfile = captainProfile;
        next();
    } catch (error) {
        return res.status(500).json({ message: "Error fetching captain profile" });
    }
}