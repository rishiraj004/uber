import prisma from "../config/prisma.js";

export const userData = async (userId: number) => {
    const userData = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            role: true,
            createdAt: true,
            riderProfile: {
                select: {
                    id: true,
                    homeAddress: true,
                    workAddress: true,
                    rating: true,
                    totalRides: true
                }
            },
            captainProfile: {
                select: {
                    id: true,
                    isOnline: true,
                    isAvailable: true,
                    rating: true,
                    vehicleType: true,
                    vehicleNumber: true,
                    vehicleModel: true,
                    vehicleColor: true,
                    totalRides: true,
                    totalEarnings: true
                }
            }
        }
    });

    return userData;
};