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