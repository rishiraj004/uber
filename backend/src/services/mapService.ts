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

export const distanceBetweenPoints = ( lat1: number , lon1: number , lat2: number , lon2: number ) => {
    const R = 6371; // Earth's radius in Kilometers
    
    // Convert degrees to radians
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; 
    
    return distance; // Returns distance in Kilometers
}
const toRadians = (degree: number): number => {
    return degree * (Math.PI / 180);
};