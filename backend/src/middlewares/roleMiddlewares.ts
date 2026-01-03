import { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
    user?: {
        userId: number;
        role: string;
    };
}

export const authorizeRole = ( requiredRole : 'RIDER' | 'CAPTAIN') => {
    return ( req : AuthRequest , res : Response , next : NextFunction ) => {
        const role = req.user?.role;
        if (role !== requiredRole) {
            return res.status(403).json({ message: "Forbidden: You do not have the required role." });
        }
        next();
    }
}