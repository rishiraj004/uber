import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();
// Initialize PostgreSQL connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export const connectDB = async (): Promise<void> => {
    try{
        await prisma.$connect();
        console.log("Database connected successfully");
    } catch (error) {
        console.error("Database connection failed:", error);
    }
}

export default prisma;