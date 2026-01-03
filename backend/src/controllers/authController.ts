import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../config/prisma";
import { AuthRequest } from "../middlewares/authMiddelwares";

export const signup = async ( req : Request , res : Response ) => {
    try { 
        const { email, password, fullName, role } = req.body;

        if(!email || !password || !fullName ) {
            return res.status(400).json({ message: "Email, password and fullname are required." });
        }

        const exsistingUser = await prisma.user.findUnique({ where: { email } });
        if (exsistingUser) {
            return res.status(400).json({ message: "User with this email already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                fullName,
                role: role || "RIDER"
            }
        })

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET as string,
            { expiresIn: "24h" }
        );

        const { password: _, ...userWithoutPassword } = user;

        res.status(201).json({
            message: "User created successfully.",
            user: userWithoutPassword,
            token
        });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Internal server error." });
    }
}

export const login = async ( req : Request , res : Response ) => {
    try {
        const { email, password } = req.body;
        if(!email || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password." });
        }
        const isMatch = await bcrypt.compare(password, user.password || "");
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password." });
        }

        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET as string,
            { expiresIn: "24h" }
        );

        const { password: _, ...userWithoutPassword } = user;

        res.status(200).json({
            message: "Login successful.",
            user: userWithoutPassword,
            token
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal server error." });
    }
}

export const getProfile = async ( req : AuthRequest , res : Response ) => {
    try {
        const userId = req.user?.userId;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isOnline: true,
                rating: true,
                ridesCount: true,
                createdAt: true
            }
        });

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        res.status(200).json({ user });
    } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};