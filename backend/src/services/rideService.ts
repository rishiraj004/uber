export interface RideFare {
    AUTO: number;
    BIKE: number;
    CAR: number;
}

export const calculateRideFare = (distanceInKm: number, durationInMinutes: number): RideFare => {
    const baseFare: RideFare = {
        AUTO : 30,
        BIKE : 15,
        CAR : 50
    };

    const perKmRate: RideFare = {
        AUTO : 10,
        BIKE : 5,
        CAR : 15
    };

    const perMinuteRate: RideFare = {
        AUTO : 2,
        BIKE : 1,
        CAR : 3
    };

    return { 
        AUTO: Math.round(baseFare.AUTO + (perKmRate.AUTO * distanceInKm) + (perMinuteRate.AUTO * durationInMinutes)),
        BIKE: Math.round(baseFare.BIKE + (perKmRate.BIKE * distanceInKm) + (perMinuteRate.BIKE * durationInMinutes)),
        CAR: Math.round(baseFare.CAR + (perKmRate.CAR * distanceInKm) + (perMinuteRate.CAR * durationInMinutes))
    };
}