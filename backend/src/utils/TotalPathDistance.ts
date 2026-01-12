import { distanceBetweenPoints } from './distanceBetweenPoints';

export const calculateTotalPathDistance = (path: { lat: number; lng: number }[]): number => {
    let totalDistance = 0;
    for (let i = 1; i < path.length; i++) {
        const prevPoint = path[i - 1];
        const currPoint = path[i];
        totalDistance += distanceBetweenPoints(prevPoint.lat, prevPoint.lng, currPoint.lat, currPoint.lng);
    }
    return totalDistance;
};