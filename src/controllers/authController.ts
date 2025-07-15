import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../database/prismaClient";
import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

export const register = async (req: Request, res: Response) => {
  const { username, password, email } = req.body;

  try {
    // Check if the email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: "Customer",
        status: "Active",
      },
    });

    // Return the created user info
    res.status(201).json({
      message: "Registration successful",
      user: {
        userId: user.user_id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (err) {
    console.error(err); // Log the error details
    res.status(500).json({ message: "Server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    // Find the user by email
    const user = await prisma.user.findUnique({ where: { email } });

    // Check if the user exists and password is correct
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate a JWT token
    const token = jwt.sign(
      // Payload
      { userId: user.user_id, email: user.email, role: user.role },
      // Secret key
      process.env.JWT_SECRET_KEY || "",
      // Options
      { expiresIn: "1d" }
    );

    // Return the token and user info
    res.json({
      message: "Login successful",
      user: {
        user_id: user.user_id,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
      },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
