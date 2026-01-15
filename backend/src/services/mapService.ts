import prisma from "../config/prisma";
import redis from "../config/redis";

export const findNearbyCaptains = async ( riderLat: number , riderLng : number , radiusKm : number = 5) => {
    try {
        const nearbyCaptainIDs = await redis.georadius(
            "captain_locations",
            riderLng,
            riderLat,
            radiusKm,
            "km"
        );
        console.log("Nearby captain IDs from Redis:", nearbyCaptainIDs);

        if (!nearbyCaptainIDs || nearbyCaptainIDs.length === 0) return [];

        const response= await prisma.user.findMany({
            where: {
                id: { in: nearbyCaptainIDs.map(id => Number(id)) },
                isOnline: true,
                role: 'CAPTAIN',
                isAvailable: true
            },
            select: {
                id: true,
                fullName: true,
                lastLat: true,
                lastLng: true,
                rating: true
            }
        });
        console.log("Nearby captains found:", response);
        return response;
    } catch (error) {
        console.error("Error finding nearby captains:", error);
        return [];
    }
}
