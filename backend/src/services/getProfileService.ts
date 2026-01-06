import prisma from "../config/prisma";

export const userData = async (userId: number) => {
    const userData = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isOnline: true,
            rating: true,
            createdAt: true
        }
    });

    return userData;
};