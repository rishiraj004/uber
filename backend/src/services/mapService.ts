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

        // Redis stores the CaptainProfile id
        const response = await prisma.captainProfile.findMany({
            where: {
                id: { in: nearbyCaptainIDs.map(id => Number(id)) },
                isOnline: true,
                isAvailable: true
            },
            select: {
                id: true,
                lastLat: true,
                lastLng: true,
                rating: true,
                user: {
                    select: {
                        fullName: true
                    }
                }
            }
        });
        console.log("Nearby captains found:", response);
        return response.map(captain => ({
            id: captain.id,
            fullName: captain.user.fullName,
            lastLat: captain.lastLat,
            lastLng: captain.lastLng,
            rating: captain.rating
        }));
    } catch (error) {
        console.error("Error finding nearby captains:", error);
        return [];
    }
}
