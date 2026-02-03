export interface RideFare {
    AUTO: number;
    BIKE: number;
    CAR: number;
}

export type VehicleType = keyof RideFare;

// Vehicle class multipliers for premium rides
export type VehicleClass = 'ECONOMY' | 'COMFORT' | 'PREMIUM' | 'XL';

const vehicleClassMultipliers: Record<VehicleClass, number> = {
    ECONOMY: 1.0,   // Base rate (Uber Go)
    COMFORT: 1.3,   // 30% more (Uber Premier)
    PREMIUM: 1.8,   // 80% more (Uber Black)
    XL: 1.5,        // 50% more (SUVs, 6+ seaters)
};

// Vehicle class descriptions for UI
export const vehicleClassInfo: Record<VehicleClass, { name: string; description: string; features: string[] }> = {
    ECONOMY: {
        name: 'Economy',
        description: 'Affordable rides for everyday trips',
        features: ['Best price', 'Standard comfort', '4 seats']
    },
    COMFORT: {
        name: 'Comfort',
        description: 'Newer cars with extra legroom',
        features: ['Newer cars', 'Extra legroom', 'Top-rated drivers']
    },
    PREMIUM: {
        name: 'Premium',
        description: 'Luxury vehicles for special occasions',
        features: ['Premium cars', 'Professional drivers', 'Leather seats']
    },
    XL: {
        name: 'XL',
        description: 'Larger vehicles for groups',
        features: ['6+ seats', 'Extra luggage space', 'Groups welcome']
    }
};

export const calculateRideFare = (
    distanceInKm: number,
    durationInMinutes: number,
    vehicleType: VehicleType,
    vehicleClass: VehicleClass = 'ECONOMY',
    surgeMultiplier: number = 1.0
): number => {
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
        fare = baseFare.AUTO + (perKmRate.AUTO * distanceInKm) + (perMinuteRate.AUTO * durationInMinutes);
    } else if (vehicleType === "BIKE") {
        fare = baseFare.BIKE + (perKmRate.BIKE * distanceInKm) + (perMinuteRate.BIKE * durationInMinutes);
    } else if (vehicleType === "CAR") {
        fare = baseFare.CAR + (perKmRate.CAR * distanceInKm) + (perMinuteRate.CAR * durationInMinutes);
    }

    // Apply vehicle class multiplier (only for CAR type)
    if (vehicleType === "CAR") {
        fare *= vehicleClassMultipliers[vehicleClass];
    }

    // Apply surge multiplier
    fare *= surgeMultiplier;

    return Math.round(fare);
};

/**
 * Calculate fares for all vehicle types and classes
 */
export const calculateAllFareOptions = (
    distanceInKm: number,
    durationInMinutes: number,
    surgeMultiplier: number = 1.0
): Array<{
    vehicleType: VehicleType;
    vehicleClass: VehicleClass;
    fare: number;
    name: string;
    description: string;
    eta: number; // Estimated time of arrival in minutes
}> => {
    const options: Array<{
        vehicleType: VehicleType;
        vehicleClass: VehicleClass;
        fare: number;
        name: string;
        description: string;
        eta: number;
    }> = [];

    // BIKE option
    options.push({
        vehicleType: 'BIKE',
        vehicleClass: 'ECONOMY',
        fare: calculateRideFare(distanceInKm, durationInMinutes, 'BIKE', 'ECONOMY', surgeMultiplier),
        name: 'Bike',
        description: 'Quick & affordable for short trips',
        eta: 3
    });

    // AUTO option
    options.push({
        vehicleType: 'AUTO',
        vehicleClass: 'ECONOMY',
        fare: calculateRideFare(distanceInKm, durationInMinutes, 'AUTO', 'ECONOMY', surgeMultiplier),
        name: 'Auto',
        description: 'Budget-friendly three-wheeler',
        eta: 4
    });

    // CAR options with different classes
    const carClasses: VehicleClass[] = ['ECONOMY', 'COMFORT', 'PREMIUM', 'XL'];
    const carNames: Record<VehicleClass, string> = {
        ECONOMY: 'UberGo',
        COMFORT: 'Premier',
        PREMIUM: 'Black',
        XL: 'UberXL'
    };
    const carEtas: Record<VehicleClass, number> = {
        ECONOMY: 5,
        COMFORT: 7,
        PREMIUM: 10,
        XL: 8
    };

    for (const vehicleClass of carClasses) {
        options.push({
            vehicleType: 'CAR',
            vehicleClass,
            fare: calculateRideFare(distanceInKm, durationInMinutes, 'CAR', vehicleClass, surgeMultiplier),
            name: carNames[vehicleClass],
            description: vehicleClassInfo[vehicleClass].description,
            eta: carEtas[vehicleClass]
        });
    }

    return options;
};