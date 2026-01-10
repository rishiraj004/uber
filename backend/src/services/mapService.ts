import prisma from "../config/prisma";

export const findNearbyCaptains = async ( riderLat: number , riderLng : number , radiusKm : number = 5) => {
    const nearbyCaptains : Array<any>  = await prisma.$queryRaw`
        SELECT id, "fullName", "lastLat", "lastLng", rating,
        (6371 * acos(
            cos(radians(${riderLat})) * cos(radians("lastLat")) *
            cos(radians("lastLng") - radians(${riderLng})) +
            sin(radians(${riderLat})) * sin(radians("lastLat"))
        )) AS distance
        FROM "User"
        WHERE role = 'CAPTAIN' 
        AND "isOnline" = true
        AND "isAvailable" = true
        AND (6371 * acos(
            cos(radians(${riderLat})) * cos(radians("lastLat")) *
            cos(radians("lastLng") - radians(${riderLng})) +
            sin(radians(${riderLat})) * sin(radians("lastLat"))
        )) <= ${radiusKm}
        ORDER BY distance ASC
        LIMIT 10;
    `;

    return nearbyCaptains;
}
