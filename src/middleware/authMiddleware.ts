import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import jwt, { JwtPayload } from "jsonwebtoken";
import { jwtConfig } from "../utils/jwtConfig";

// const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "";

export type AuthenticatedUserPayload = JwtPayload & {
  userId: number;
  email: string;
  role: Role;
};

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUserPayload;
}

export const authenticateJWT = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token or invalid format" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, jwtConfig.jwtSecretKey);

    if (typeof decoded === "string") {
      return res.status(403).json({ message: "Invalid token" });
    }

    req.user = decoded as AuthenticatedUserPayload;
    next();
  } catch (err) {
    console.error("JWT error:", err);
    res.status(403).json({ message: "Token is invalid or expired" });
  }
};

export const authorizeRoles =
  (...allowedRoles: Role[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(401).json({
        message: "Unauthenticated user",
      });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: "You do not have permission to access this resource",
      });
    }

    next();
  };