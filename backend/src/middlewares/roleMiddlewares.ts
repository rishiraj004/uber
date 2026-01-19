import { Response, NextFunction } from "express";
import { AuthRequest } from "./authMiddelwares";
import jwt from "jsonwebtoken";


export const authorizeRole = ( requiredRole : 'RIDER' | 'CAPTAIN') => {
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