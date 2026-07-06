import { RideStatus, VehicleType, VehicleClass, RideType, PaymentStatus, PaymentMode, BidStatus, Role, DocumentStatus } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcrypt';
import ngeohash from 'ngeohash';
import prisma from '../src/config/prisma.js';

// Seed parameters - increased for a hefty but safe amount of data (NeonDB free tier safe)
const NUM_RIDERS = 200;
const NUM_CAPTAINS = 80;
const NUM_RIDES = 400;

// Central coordinates (Bhagalpur, Bihar)
const BASE_LAT = 25.2425;
const BASE_LNG = 86.9842;

// Generate random coordinates within ~10km radius
function getRandomCoordinates() {
    // 1 degree is approx 111km. 10km is ~0.09 degrees
    const latOffset = (Math.random() - 0.5) * 0.18;
    const lngOffset = (Math.random() - 0.5) * 0.18;
    return {
        lat: BASE_LAT + latOffset,
        lng: BASE_LNG + lngOffset
    };
}

async function main() {
    console.log('🌱 Starting database seeding...');

    // Warning: We are wiping the database before seeding to ensure a clean slate!
    console.log('🧹 Wiping existing data...');
    await prisma.chatMessage.deleteMany();
    await prisma.review.deleteMany();
    await prisma.sOSAlert.deleteMany();
    await prisma.rideShareLink.deleteMany();
    await prisma.rideLocationLog.deleteMany();
    await prisma.rideBid.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.withdrawal.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.captainDocument.deleteMany();
    await prisma.ride.deleteMany(); // Deletes rides
    await prisma.riderProfile.deleteMany();
    await prisma.captainProfile.deleteMany();
    await prisma.user.deleteMany();

    const hashedPassword = await bcrypt.hash('password123', 10);

    // ==========================================
    // 1. SEED RIDERS
    // ==========================================
    console.log(`👤 Creating ${NUM_RIDERS} Riders...`);
    const riders: number[] = [];
    
    for (let i = 0; i < NUM_RIDERS; i++) {
        const homeCoords = getRandomCoordinates();
        const workCoords = getRandomCoordinates();
        
        const user = await prisma.user.create({
            data: {
                fullName: faker.person.fullName(),
                email: faker.internet.email().toLowerCase(),
                password: hashedPassword,
                phone: '+91' + faker.string.numeric(10),
                role: Role.RIDER,
                riderProfile: {
                    create: {
                        homeAddress: faker.location.streetAddress() + ', Bhagalpur, Bihar',
                        homeAddressLat: homeCoords.lat,
                        homeAddressLng: homeCoords.lng,
                        workAddress: faker.location.streetAddress() + ', Bhagalpur, Bihar',
                        workAddressLat: workCoords.lat,
                        workAddressLng: workCoords.lng,
                        rating: faker.number.float({ min: 4.0, max: 5.0, fractionDigits: 1 }),
                        totalRides: faker.number.int({ min: 0, max: 50 })
                    }
                }
            }
        });
        riders.push(user.id);
    }

    // ==========================================
    // 2. SEED CAPTAINS
    // ==========================================
    console.log(`🚕 Creating ${NUM_CAPTAINS} Captains...`);
    const captains: number[] = [];
    
    const vehicleTypes = [VehicleType.CAR, VehicleType.CAR, VehicleType.BIKE, VehicleType.AUTO];
    const vehicleClasses = [VehicleClass.ECONOMY, VehicleClass.ECONOMY, VehicleClass.COMFORT, VehicleClass.PREMIUM, VehicleClass.XL];
    
    for (let i = 0; i < NUM_CAPTAINS; i++) {
        const vType = vehicleTypes[faker.number.int({ min: 0, max: vehicleTypes.length - 1 })];
        const vClass = vType === VehicleType.CAR ? vehicleClasses[faker.number.int({ min: 0, max: vehicleClasses.length - 1 })] : VehicleClass.ECONOMY;
        
        const currentCoords = getRandomCoordinates();

        const user = await prisma.user.create({
            data: {
                fullName: faker.person.fullName(),
                email: faker.internet.email().toLowerCase(),
                password: hashedPassword,
                phone: '+91' + faker.string.numeric(10),
                role: Role.CAPTAIN,
                captainProfile: {
                    create: {
                        vehicleType: vType,
                        vehicleClass: vClass,
                        vehicleNumber: `DL${faker.string.numeric(2)}${faker.string.alpha({ length: 2, casing: 'upper' })}${faker.string.numeric(4)}`,
                        vehicleModel: faker.vehicle.model(),
                        vehicleColor: faker.vehicle.color(),
                        isAvailable: faker.datatype.boolean(0.8), // 80% available
                        isOnline: true,
                        isVerified: true,
                        lastLat: currentCoords.lat,
                        lastLng: currentCoords.lng,
                        rating: faker.number.float({ min: 4.2, max: 5.0, fractionDigits: 1 }),
                        totalRides: faker.number.int({ min: 10, max: 500 }),
                        totalEarnings: faker.number.float({ min: 1000, max: 50000, fractionDigits: 2 }),
                        walletBalance: faker.number.float({ min: 0, max: 5000, fractionDigits: 2 }),
                        licenseNumber: `DL-${faker.string.numeric(13)}`,
                        licenseExpiry: faker.date.future({ years: 5 }),
                        rcNumber: `RC-${faker.string.numeric(10)}`,
                        rcExpiry: faker.date.future({ years: 10 }),
                        // Create documents
                        documents: {
                            create: [
                                {
                                    documentType: 'LICENSE',
                                    documentUrl: faker.image.url(),
                                    status: DocumentStatus.VERIFIED,
                                    externalVerified: true
                                },
                                {
                                    documentType: 'RC',
                                    documentUrl: faker.image.url(),
                                    status: DocumentStatus.VERIFIED,
                                    externalVerified: true
                                }
                            ]
                        }
                    }
                }
            },
            include: {
                captainProfile: true
            }
        });
        if (user.captainProfile) {
            captains.push(user.captainProfile.id);
        }
    }

    // ==========================================
    // 3. SEED RIDES
    // ==========================================
    console.log(`🚗 Creating ${NUM_RIDES} Rides...`);
    const rideStatuses = [
        RideStatus.COMPLETED, RideStatus.COMPLETED, RideStatus.COMPLETED, 
        RideStatus.ONGOING, RideStatus.ACCEPTED, RideStatus.PENDING, RideStatus.CANCELLED
    ];

    for (let i = 0; i < NUM_RIDES; i++) {
        const riderId = riders[faker.number.int({ min: 0, max: riders.length - 1 })];
        const status = rideStatuses[faker.number.int({ min: 0, max: rideStatuses.length - 1 })];
        
        // Captain is assigned for all except PENDING
        const captainId = status === RideStatus.PENDING ? null : captains[faker.number.int({ min: 0, max: captains.length - 1 })];
        
        const pickup = getRandomCoordinates();
        const dropoff = getRandomCoordinates();
        
        const distance = faker.number.float({ min: 2, max: 25, fractionDigits: 1 }); // 2 to 25 km
        const duration = distance * faker.number.float({ min: 2, max: 4, fractionDigits: 1 }); // 2-4 mins per km
        
        const vType = faker.helpers.arrayElement([VehicleType.CAR, VehicleType.BIKE, VehicleType.AUTO]);
        const vClass = vType === VehicleType.CAR ? faker.helpers.arrayElement([VehicleClass.ECONOMY, VehicleClass.COMFORT]) : VehicleClass.ECONOMY;
        
        // Base fare calculation logic roughly similar to real app
        let fare = 50 + (distance * 15);
        if (vType === VehicleType.BIKE) fare = 20 + (distance * 6);
        if (vType === VehicleType.AUTO) fare = 30 + (distance * 10);
        
        const isBidding = faker.datatype.boolean(0.3); // 30% are bidding rides
        const paymentMode = faker.helpers.arrayElement([PaymentMode.CASH, PaymentMode.UPI, PaymentMode.IN_APP]);
        
        // Determine timestamps based on status
        const createdAt = faker.date.recent({ days: 10 });
        let startedAt: Date | null = null;
        let completedAt: Date | null = null;
        let paymentStatus: PaymentStatus = PaymentStatus.PENDING;
        
        if (status === RideStatus.ONGOING || status === RideStatus.COMPLETED) {
            startedAt = new Date(createdAt.getTime() + faker.number.int({ min: 5, max: 15 }) * 60000); // 5-15 mins after creation
        }
        
        if (status === RideStatus.COMPLETED) {
            completedAt = new Date(startedAt!.getTime() + duration * 60000);
            paymentStatus = faker.helpers.arrayElement([PaymentStatus.CAPTURED, PaymentStatus.CAPTURED, PaymentStatus.PENDING]); // Mostly captured
        }

        const ride = await prisma.ride.create({
            data: {
                riderId,
                captainId,
                status,
                pickupAddress: faker.location.streetAddress() + ', Bhagalpur, Bihar',
                pickupLat: pickup.lat,
                pickupLng: pickup.lng,
                dropoffAddress: faker.location.streetAddress() + ', Bhagalpur, Bihar',
                dropoffLat: dropoff.lat,
                dropoffLng: dropoff.lng,
                vehicleType: vType,
                vehicleClass: vClass,
                rideType: RideType.SOLO,
                fare: Math.round(fare),
                surgeMultiplier: faker.helpers.arrayElement([1.0, 1.0, 1.2, 1.5]),
                estimatedDistance: distance,
                estimatedDuration: duration,
                otp: status !== RideStatus.COMPLETED && status !== RideStatus.CANCELLED ? faker.string.numeric(4) : null,
                isBiddingEnabled: isBidding,
                baseOfferPrice: isBidding ? Math.round(fare * 0.8) : null, // Rider offers 20% less
                finalAgreedPrice: isBidding && captainId ? Math.round(fare) : null,
                paymentMode,
                paymentStatus,
                startedAt,
                completedAt,
                createdAt
            }
        });

        // ==========================================
        // 4. SEED BIDS (If Bidding Enabled)
        // ==========================================
        if (isBidding) {
            // Create a few random bids
            const numBids = faker.number.int({ min: 1, max: 5 });
            const bidders = faker.helpers.shuffle(captains).slice(0, numBids);
            
            for (const bidderId of bidders) {
                const isSelected = bidderId === captainId;
                await prisma.rideBid.create({
                    data: {
                        rideId: ride.id,
                        captainId: bidderId,
                        offerAmount: Math.round(fare * faker.number.float({ min: 0.9, max: 1.2 })), // Captains offer near fare
                        status: isSelected ? BidStatus.SELECTED : (captainId ? BidStatus.REJECTED : BidStatus.PENDING),
                        estimatedArrival: faker.number.int({ min: 2, max: 15 }),
                        createdAt: new Date(createdAt.getTime() + faker.number.int({ min: 10, max: 60 }) * 1000)
                    }
                });
            }
        }

        // ==========================================
        // 5. SEED PAYMENTS (If Captured or In-App)
        // ==========================================
        if (status === RideStatus.COMPLETED && paymentMode === PaymentMode.IN_APP) {
            await prisma.payment.create({
                data: {
                    rideId: ride.id,
                    razorpayOrderId: `order_${faker.string.alphanumeric(14)}`,
                    razorpayPaymentId: paymentStatus === PaymentStatus.CAPTURED ? `pay_${faker.string.alphanumeric(14)}` : null,
                    razorpayCustomerId: `cust_${faker.string.alphanumeric(14)}`,
                    amount: ride.fare || 0,
                    currency: 'inr',
                    status: paymentStatus,
                    capturedAt: paymentStatus === PaymentStatus.CAPTURED ? completedAt : null
                }
            });
        }

        // ==========================================
        // 6. SEED REVIEWS
        // ==========================================
        if (status === RideStatus.COMPLETED) {
            // 70% chance of rider reviewing captain
            if (faker.datatype.boolean(0.7)) {
                // Get captain's user ID
                const cap = await prisma.captainProfile.findUnique({ where: { id: captainId! }});
                
                await prisma.review.create({
                    data: {
                        rideId: ride.id,
                        reviewerId: riderId,
                        revieweeId: cap!.userId,
                        rating: faker.number.int({ min: 3, max: 5 }),
                        comment: faker.helpers.arrayElement(['Great ride', 'Smooth driving', 'Clean car', '', '']),
                        type: 'RIDER_TO_CAPTAIN',
                        createdAt: new Date(completedAt!.getTime() + 3600000)
                    }
                });
            }
        }

        // ==========================================
        // 7. SEED LOCATION LOGS (For ONGOING/COMPLETED)
        // ==========================================
        if (status === RideStatus.ONGOING || status === RideStatus.COMPLETED) {
            // Generate 5-10 GPS points along the path
            const numPoints = faker.number.int({ min: 5, max: 15 });
            for (let j = 0; j < numPoints; j++) {
                // Interpolate between pickup and dropoff
                const fraction = j / numPoints;
                const pointLat = pickup.lat + (dropoff.lat - pickup.lat) * fraction;
                const pointLng = pickup.lng + (dropoff.lng - pickup.lng) * fraction;
                
                await prisma.rideLocationLog.create({
                    data: {
                        rideId: ride.id,
                        latitude: pointLat + (Math.random() - 0.5) * 0.001, // Add slight jitter
                        longitude: pointLng + (Math.random() - 0.5) * 0.001,
                        timestamp: new Date(startedAt!.getTime() + fraction * duration * 60000)
                    }
                });
            }
        }
    }

    console.log('✅ Seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
