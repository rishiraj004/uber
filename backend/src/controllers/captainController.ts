import { Response } from "express";
import { AuthRequest } from "../middlewares/authMiddelwares";
import prisma from "../config/prisma";

export const toggleAvailability = async ( req : AuthRequest , res : Response ) => {
    try {
        const captainId = req.user?.userId;
        if (!captainId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const captain = await prisma.user.findUnique({ where: { id: captainId } , select: { isOnline: true } });
        if (!captain) {
            return res.status(404).json({ message: "Captain not found" });
        }

        const updatedCaptain = await prisma.user.update({
            where: { id: captainId },
            data: { isOnline: !captain.isOnline },
            select: { id:true, isOnline: true, fullName:true }
        });

        res.status(200).json({
            message: `Captain is now ${updatedCaptain.isOnline ? "online" : "offline"}.`,
            isOnline: updatedCaptain.isOnline
        });
    } catch (error) {
        res.status(500).json({ message: "Error toggling status" });
    }
};