import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const connectDB = async (): Promise<void> => {
    try{
        await prisma.$connect();
        console.log("Database connected successfully");
    } catch (error) {
        console.error("Database connection failed:", error);
    }
}

export default prisma;