export interface RideFare {
    AUTO: number;
    BIKE: number;
    CAR: number;
}

export type VehicleType = keyof RideFare;

export const calculateRideFare = (distanceInKm: number, durationInMinutes: number, vehicleType: VehicleType): number => {
    const baseFare: RideFare = {
        AUTO: 30,
        BIKE: 15,
        CAR: 50
    };

    const perKmRate: RideFare = {
        AUTO: 10,
        BIKE: 5,
        CAR: 15
    };

    const perMinuteRate: RideFare = {
        AUTO: 2,
        BIKE: 1,
        CAR: 3
    };

    let fare: number = 0;
    if (vehicleType === "AUTO") {
        fare = Math.round(baseFare.AUTO + (perKmRate.AUTO * distanceInKm) + (perMinuteRate.AUTO * durationInMinutes));
    } else if (vehicleType === "BIKE") {
        fare = Math.round(baseFare.BIKE + (perKmRate.BIKE * distanceInKm) + (perMinuteRate.BIKE * durationInMinutes));
    } else if (vehicleType === "CAR") {
        fare = Math.round(baseFare.CAR + (perKmRate.CAR * distanceInKm) + (perMinuteRate.CAR * durationInMinutes));
    }

    return fare;
};